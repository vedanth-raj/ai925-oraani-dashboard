const jwt = require('jsonwebtoken');
const { db } = require('../db/database');

const { JWT_SECRET, MASTER_CODE } = require('../utils/serverKeys');

// In-memory rate limiting for login attempts
const loginAttempts = new Map();

function rateLimitLogin(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 5 * 60 * 1000; // 5 minutes
  const maxAttempts = 15;

  const userAttempts = loginAttempts.get(ip) || [];
  const recentAttempts = userAttempts.filter(timestamp => now - timestamp < windowMs);

  if (recentAttempts.length >= maxAttempts) {
    return res.status(429).json({
      error: 'Too many login attempts. Please try again after 5 minutes.'
    });
  }

  recentAttempts.push(now);
  loginAttempts.set(ip, recentAttempts);
  next();
}

function clearLoginAttempts(ip) {
  loginAttempts.delete(ip);
}

function generateToken(user, sessionId = null) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      full_name: user.full_name,
      assigned_region: user.assigned_region,
      session_id: sessionId || user.session_id || null
    },
    JWT_SECRET,
    { expiresIn: '30d', algorithm: 'HS256' } // local app, long session for tablet/mobile
  );
}

function newSessionId() {
  return 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
}

// Customer portal tokens carry kind: 'customer' so they can never pass staff authentication
function generateCustomerToken(account) {
  return jwt.sign(
    { id: account.id, kind: 'customer', role: 'CUSTOMER' },
    JWT_SECRET,
    { expiresIn: '30d', algorithm: 'HS256' }
  );
}

// A token in the URL is accepted only for GET file downloads (CSV / ZIP exports, backups, cloud files),
// so it never works for reading or changing data through ordinary API calls
const DOWNLOAD_PATH_RE = /(\/download|\.csv|\.zip)$/;
function readToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  const pathOnly = (req.originalUrl || '').split('?')[0];
  if (req.method === 'GET' && typeof req.query.token === 'string' && DOWNLOAD_PATH_RE.test(pathOnly)) {
    return req.query.token;
  }
  return null;
}

// Returns { user } for a valid staff session or { status, body } describing the rejection
function resolveStaff(decoded) {
  if (decoded.kind === 'customer') {
    return { status: 403, body: { error: 'Access denied. Staff account required.' } };
  }

  // Verify user still active in DB
  const user = db.prepare('SELECT id, username, role, full_name, assigned_region, session_id, is_active FROM users WHERE id = ?').get(decoded.id);
  if (!user || !user.is_active) {
    return { status: 403, body: { error: 'Account is deactivated or not found.' } };
  }

  // Single Device Enforcement (System Admin, Business Admin, Sales Rep):
  // every sign-in stores a new session_id, so tokens from the previous device stop working.
  if (user.session_id && decoded.session_id !== user.session_id) {
    return {
      status: 401,
      body: { error: 'Logged in from another device. You have been logged out.', session_invalidated: true }
    };
  }

  return { user };
}

function authenticateToken(req, res, next) {
  const token = readToken(req);

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Session expired or invalid. Please sign in again.' });
    }

    const result = resolveStaff(decoded);
    if (!result.user) {
      return res.status(result.status).json(result.body);
    }

    req.user = result.user;
    next();
  });
}

function loadCustomerAccount(id) {
  return db.prepare(`
    SELECT id, full_name, company_name, phone, email, address, id_card_path, status,
      biz_approved_at, sys_approved_at, rejected_reason, customer_id, created_at,
      account_type, can_view_ready, can_view_order, brand
    FROM customer_accounts WHERE id = ?
  `).get(id);
}

// A customer counts as "using the app" while requests keep arriving; writes at most every 30 s
const PRESENCE_WRITE_MS = 30 * 1000;
function touchCustomerPresence(id) {
  try {
    const now = new Date();
    db.prepare('UPDATE customer_accounts SET last_seen_at = ? WHERE id = ? AND (last_seen_at IS NULL OR last_seen_at < ?)')
      .run(now.toISOString(), id, new Date(now.getTime() - PRESENCE_WRITE_MS).toISOString());
  } catch (err) {
    console.error('Customer presence update failed:', err.message);
  }
}

function authenticateCustomer(req, res, next) {
  const token = readToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Please sign in to continue.' });
  }

  jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }, (err, decoded) => {
    if (err || decoded.kind !== 'customer') {
      return res.status(403).json({ error: 'Session expired or invalid. Please sign in again.' });
    }
    const account = loadCustomerAccount(decoded.id);
    if (!account) {
      return res.status(403).json({ error: 'Customer account not found.' });
    }
    touchCustomerPresence(account.id);
    req.customer = account;
    next();
  });
}

// The portal sends a heartbeat every minute while open, so two minutes of silence means the customer left
const ONLINE_WINDOW_MS = 2 * 60 * 1000;
function isCustomerOnline(lastSeenAt) {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  return Number.isFinite(t) && Date.now() - t < ONLINE_WINDOW_MS;
}

// Ready Stock / On Order sections an administrator has opened for this customer
function canViewMode(customer, mode) {
  if (!customer) return false;
  if (mode === 'READY_STOCK') return customer.can_view_ready !== 0;
  if (mode === 'ON_ORDER') return customer.can_view_order !== 0;
  return false;
}

function requireApprovedCustomer(req, res, next) {
  if (!req.customer || req.customer.status !== 'APPROVED' || !req.customer.customer_id) {
    return res.status(403).json({
      error: 'Your profile is under verification. Once it is verified you will be informed.',
      verification_pending: true
    });
  }
  next();
}

// Accepts either a staff or a customer token (read-only shared data such as the silver rate)
function authenticateAny(req, res, next) {
  const token = readToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }
  jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Session expired or invalid. Please sign in again.' });
    }
    if (decoded.kind === 'customer') {
      const account = loadCustomerAccount(decoded.id);
      if (!account) return res.status(403).json({ error: 'Customer account not found.' });
      req.customer = account;
      return next();
    }
    const result = resolveStaff(decoded);
    if (!result.user) {
      return res.status(result.status).json(result.body);
    }
    req.user = result.user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({
      error: 'Access denied. Administrator privileges required.'
    });
  }
  next();
}

function requireAdminOrBusinessAdmin(req, res, next) {
  if (!req.user || (req.user.role !== 'ADMIN' && req.user.role !== 'BUSINESS_ADMIN')) {
    return res.status(403).json({
      error: 'Access denied. Administrator or Business Administrator privileges required.'
    });
  }
  next();
}

function logAudit(userId, action, entityType, entityId, details, req, previousData = null, newData = null) {
  try {
    const ip = req ? (req.ip || req.connection?.remoteAddress || 'local') : 'local';
    const id = 'aud_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at, previous_data, new_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      action,
      entityType,
      entityId,
      typeof details === 'string' ? details : JSON.stringify(details),
      ip,
      new Date().toISOString(),
      previousData ? (typeof previousData === 'string' ? previousData : JSON.stringify(previousData)) : null,
      newData ? (typeof newData === 'string' ? newData : JSON.stringify(newData)) : null
    );
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

module.exports = {
  JWT_SECRET,
  MASTER_CODE,
  generateToken,
  generateCustomerToken,
  newSessionId,
  authenticateToken,
  authenticateCustomer,
  requireApprovedCustomer,
  canViewMode,
  isCustomerOnline,
  authenticateAny,
  requireAdmin,
  requireAdminOrBusinessAdmin,
  rateLimitLogin,
  clearLoginAttempts,
  logAudit
};
