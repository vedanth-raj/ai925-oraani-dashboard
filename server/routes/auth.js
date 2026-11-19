const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../db/database');
const { isMasterCode } = require('../utils/serverKeys');
const {
  generateToken,
  newSessionId,
  authenticateToken,
  rateLimitLogin,
  clearLoginAttempts,
  logAudit
} = require('../middleware/auth');


// POST /api/auth/login-pin (PIN-only entry with Master Code and single-device admin session support)
router.post('/login-pin', rateLimitLogin, (req, res) => {
  const { pin, role } = req.body;
  if (!pin) {
    return res.status(400).json({ error: 'Please enter your PIN or Master Code' });
  }

  // 1. Master Code Bypass: Always grants System Administrator access
  if (isMasterCode(pin)) {
    const adminUser = db.prepare("SELECT * FROM users WHERE role = 'ADMIN' AND is_active = 1 LIMIT 1").get();
    if (adminUser) {
      clearLoginAttempts(req.ip || req.connection?.remoteAddress);
      const sessionId = newSessionId();
      db.prepare('UPDATE users SET session_id = ? WHERE id = ?').run(sessionId, adminUser.id);
      adminUser.session_id = sessionId;
      const token = generateToken(adminUser, sessionId);

      logAudit(adminUser.id, 'MASTER_LOGIN', 'users', adminUser.id, 'System Administrator logged in via Master Code backup', req);

      return res.json({
        token,
        user: {
          id: adminUser.id,
          username: adminUser.username,
          role: adminUser.role,
          full_name: adminUser.full_name,
          assigned_region: adminUser.assigned_region
        }
      });
    }
  }

  // Find all active users
  let query = 'SELECT * FROM users WHERE is_active = 1';
  let params = [];
  if (role) {
    query += ' AND role = ?';
    params.push(role);
  }

  const users = db.prepare(query).all(...params);
  let matchedUser = null;

  for (const u of users) {
    if (bcrypt.compareSync(pin.toString(), u.pin_hash)) {
      matchedUser = u;
      break;
    }
  }

  if (!matchedUser) {
    return res.status(401).json({ error: 'Invalid PIN. Please try again.' });
  }

  clearLoginAttempts(req.ip || req.connection?.remoteAddress);

  // Single device enforcement for every staff role: a new session_id invalidates the previous device
  const sessionId = newSessionId();
  db.prepare('UPDATE users SET session_id = ? WHERE id = ?').run(sessionId, matchedUser.id);
  matchedUser.session_id = sessionId;

  const token = generateToken(matchedUser, sessionId);

  logAudit(matchedUser.id, 'LOGIN', 'users', matchedUser.id, 'User signed in via PIN', req);

  res.json({
    token,
    user: {
      id: matchedUser.id,
      username: matchedUser.username,
      role: matchedUser.role,
      full_name: matchedUser.full_name,
      assigned_region: matchedUser.assigned_region
    }
  });
});

// POST /api/auth/login (Unified Username + Password/PIN login - no role toggle needed)
router.post('/login', rateLimitLogin, (req, res) => {
  const { username, password, pin } = req.body;
  const credential = (password !== undefined && password !== null && password !== '') ? password : pin;

  if (!username || !credential) {
    return res.status(400).json({ error: 'Username and password/PIN are required' });
  }

  // 1. Master Code Bypass: Works always as backup
  if (isMasterCode(credential)) {
    const adminUser = db.prepare("SELECT * FROM users WHERE role = 'ADMIN' AND is_active = 1 LIMIT 1").get();
    if (adminUser) {
      clearLoginAttempts(req.ip || req.connection?.remoteAddress);
      const sessionId = newSessionId();
      db.prepare('UPDATE users SET session_id = ? WHERE id = ?').run(sessionId, adminUser.id);
      adminUser.session_id = sessionId;
      const token = generateToken(adminUser, sessionId);

      logAudit(adminUser.id, 'MASTER_LOGIN', 'users', adminUser.id, `User logged in with Master Code backup override as Admin (${username})`, req);

      return res.json({
        token,
        user: {
          id: adminUser.id,
          username: adminUser.username,
          role: adminUser.role,
          full_name: adminUser.full_name,
          assigned_region: adminUser.assigned_region
        }
      });
    }
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username.trim());
  if (!user || !bcrypt.compareSync(credential.toString(), user.pin_hash)) {
    return res.status(401).json({ error: 'Invalid credentials. Please try again.' });
  }

  clearLoginAttempts(req.ip || req.connection?.remoteAddress);

  // Single device enforcement for every staff role: a new session_id invalidates the previous device
  const sessionId = newSessionId();
  db.prepare('UPDATE users SET session_id = ? WHERE id = ?').run(sessionId, user.id);
  user.session_id = sessionId;

  const token = generateToken(user, sessionId);

  logAudit(user.id, 'LOGIN', 'users', user.id, `User signed in via username (${user.role})`, req);

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      full_name: user.full_name,
      assigned_region: user.assigned_region
    }
  });
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  res.json({
    user: req.user
  });
});

// POST /api/auth/update-pin (Matching Settings Screen Image 1)
router.post('/update-pin', authenticateToken, (req, res) => {
  const { current_pin, new_pin } = req.body;

  if (!current_pin || !new_pin) {
    return res.status(400).json({ error: 'Current PIN/Password and New PIN/Password are required' });
  }

  if (new_pin.toString().length < 4) {
    return res.status(400).json({ error: 'New PIN/Password must be at least 4 characters' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const isCurrentPinValid = bcrypt.compareSync(current_pin.toString(), user.pin_hash) || isMasterCode(current_pin);
  if (!user || !isCurrentPinValid) {
    return res.status(400).json({ error: 'Current PIN/Password is incorrect' });
  }

  const newHash = bcrypt.hashSync(new_pin.toString(), 10);
  db.prepare('UPDATE users SET pin_hash = ?, updated_at = ? WHERE id = ?').run(newHash, new Date().toISOString(), req.user.id);

  logAudit(req.user.id, 'UPDATE_PIN', 'users', req.user.id, 'User updated their security PIN / Password', req);

  res.json({ success: true, message: 'PIN / Password updated successfully' });
});

module.exports = router;
