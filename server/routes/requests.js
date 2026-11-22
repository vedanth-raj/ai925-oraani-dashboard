// Staff inbox: customer seller-requests, new customer verification and on-order purchase requests
const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { authenticateToken, requireAdminOrBusinessAdmin, requireAdmin, logAudit, isCustomerOnline } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const { encrypt, decrypt } = require('../utils/secrets');
const { deleteCustomerCompletely } = require('../services/customerCascade');
const { detectStateFromText } = require('../utils/pricing');

const newId = prefix => prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

router.use(authenticateToken, requireAdminOrBusinessAdmin);

// GET /api/requests/summary (badge counts for the dashboard panels)
router.get('/summary', (req, res) => {
  const openStockRequests = db.prepare("SELECT COUNT(*) as c FROM stock_requests WHERE status != 'CLOSED'").get().c;
  const pendingCustomers = db.prepare("SELECT COUNT(*) as c FROM customer_accounts WHERE status = 'PENDING'").get().c;
  // Either administrator's approval activates the account, so every pending one awaits whoever looks
  const awaitingMyApproval = pendingCustomers;
  const onOrderOpen = db.prepare("SELECT COUNT(*) as c FROM orders WHERE order_type = 'ON_ORDER' AND status = 'OPEN'").get().c;
  const profileChanges = db.prepare("SELECT COUNT(*) as c FROM customer_change_requests WHERE status = 'PENDING'").get().c;
  const callBookings = db.prepare("SELECT COUNT(*) as c FROM call_bookings WHERE status IN ('OPEN', 'SCHEDULED')").get().c;
  const payments = db.prepare(`
    SELECT
      COALESCE(SUM(paid_amount), 0) as received,
      COALESCE(SUM(CASE WHEN payment_status != 'PAID' AND status != 'CLOSED' THEN total_amount - paid_amount ELSE 0 END), 0) as outstanding,
      SUM(CASE WHEN payment_status != 'PAID' AND total_amount > 0 THEN 1 ELSE 0 END) as unpaid_orders
    FROM orders
  `).get();

  res.json({
    open_stock_requests: openStockRequests,
    pending_customers: pendingCustomers,
    awaiting_my_approval: awaitingMyApproval,
    on_order_open: onOrderOpen,
    profile_changes: profileChanges,
    call_bookings: callBookings,
    payments_received: payments.received || 0,
    payments_outstanding: payments.outstanding || 0,
    unpaid_orders: payments.unpaid_orders || 0
  });
});

// GET /api/requests/stock-requests?status=OPEN|IN_PROGRESS|CLOSED|All
router.get('/stock-requests', (req, res) => {
  const { status } = req.query;
  let query = `
    SELECT sr.*, p.name as product_name, p.sku as product_sku, p.image_path as product_image,
      ca.full_name as customer_name, ca.company_name, ca.phone as customer_phone, ca.email as customer_email,
      ca.address as customer_address, u.full_name as handled_by_name
    FROM stock_requests sr
    JOIN products p ON sr.product_id = p.id
    JOIN customer_accounts ca ON sr.customer_account_id = ca.id
    LEFT JOIN users u ON sr.handled_by_id = u.id
  `;
  const params = [];
  if (status && status !== 'All') {
    query += ' WHERE sr.status = ?';
    params.push(status);
  } else if (!status) {
    query += " WHERE sr.status != 'CLOSED'";
  }
  query += ' ORDER BY sr.created_at DESC';
  res.json({ requests: db.prepare(query).all(...params) });
});

// PUT /api/requests/stock-requests/:id (close or modify)
router.put('/stock-requests/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM stock_requests WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Request not found' });
  }
  const { status, quantity, size_inches, admin_notes } = req.body;
  if (status && !['OPEN', 'IN_PROGRESS', 'CLOSED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const qty = quantity !== undefined ? Math.max(1, parseInt(quantity, 10) || 1) : existing.quantity;
  const size = size_inches !== undefined
    ? (size_inches === '' || size_inches === null ? null : parseFloat(size_inches))
    : existing.size_inches;

  db.prepare(`
    UPDATE stock_requests SET status = ?, quantity = ?, size_inches = ?, admin_notes = ?, handled_by_id = ?, updated_at = ?
    WHERE id = ?
  `).run(
    status || existing.status,
    qty,
    size,
    admin_notes !== undefined ? String(admin_notes) : existing.admin_notes,
    req.user.id,
    new Date().toISOString(),
    existing.id
  );

  logAudit(req.user.id, 'UPDATE_STOCK_REQUEST', 'stock_requests', existing.id, `Seller request set to ${status || existing.status}`, req, existing, req.body);
  res.json({ request: db.prepare('SELECT * FROM stock_requests WHERE id = ?').get(existing.id) });
});

function accountWithApprovers(id) {
  const account = db.prepare(`
    SELECT ca.id, ca.full_name, ca.company_name, ca.phone, ca.email, ca.address, ca.id_card_path, ca.status,
      ca.biz_approved_at, ca.sys_approved_at, ca.rejected_reason, ca.customer_id, ca.notified_at, ca.created_at,
      ca.account_type, ca.can_view_ready, ca.can_view_order, ca.brand,
      ca.last_seen_at, ca.last_latitude, ca.last_longitude, ca.last_location_at,
      bu.full_name as biz_approved_by_name, su.full_name as sys_approved_by_name
    FROM customer_accounts ca
    LEFT JOIN users bu ON ca.biz_approved_by_id = bu.id
    LEFT JOIN users su ON ca.sys_approved_by_id = su.id
    WHERE ca.id = ?
  `).get(id);
  if (!account) return account;
  const rawBrand = (account.brand || 'AI925').toUpperCase();
  const brand = ['AI925', 'ORAANI', 'BOTH'].includes(rawBrand) ? rawBrand : 'AI925';
  return {
    ...account,
    brand,
    can_view_ready: account.can_view_ready !== 0,
    can_view_order: account.can_view_order !== 0,
    online: isCustomerOnline(account.last_seen_at)
  };
}

// Reads { can_view_ready, can_view_order, brand } from a request body; null when none is sent
function readAccess(body) {
  const b = body || {};
  if (b.can_view_ready === undefined && b.can_view_order === undefined && b.brand === undefined) return null;
  for (const key of ['can_view_ready', 'can_view_order']) {
    if (b[key] !== undefined && typeof b[key] !== 'boolean') {
      throw new Error('Visibility settings must be true or false');
    }
  }
  if (b.brand !== undefined) {
    const brand = String(b.brand).trim().toUpperCase();
    if (!['AI925', 'ORAANI', 'BOTH'].includes(brand)) {
      throw new Error('Brand access must be AI925, ORAANI, or BOTH');
    }
    b.brand = brand;
  }
  return b;
}

function applyAccess(accountId, access, now) {
  const current = db.prepare('SELECT can_view_ready, can_view_order, brand, customer_id FROM customer_accounts WHERE id = ?').get(accountId);
  const ready = access.can_view_ready !== undefined ? access.can_view_ready : current.can_view_ready !== 0;
  const order = access.can_view_order !== undefined ? access.can_view_order : current.can_view_order !== 0;
  const brand = access.brand !== undefined ? access.brand : (current.brand || 'AI925');
  db.prepare('UPDATE customer_accounts SET can_view_ready = ?, can_view_order = ?, brand = ?, updated_at = ? WHERE id = ?')
    .run(ready ? 1 : 0, order ? 1 : 0, brand, now, accountId);
  if (current.customer_id) {
    db.prepare('UPDATE customers SET brand = ?, updated_at = ? WHERE id = ?').run(brand, now, current.customer_id);
  }
  return { ready, order, brand };
}

const brandLabel = b => b === 'BOTH' ? 'AI 925 + Oraani' : b === 'ORAANI' ? 'Oraani' : 'AI 925';
const accessLabel = ({ ready, order, brand }) =>
  `${[ready && 'Ready Stock', order && 'Order Purchase'].filter(Boolean).join(' + ') || 'nothing'} · Brands: ${brandLabel(brand)}`;

// GET /api/requests/customer-accounts/by-customer/:customerId (portal account of a customer record, if any)
router.get('/customer-accounts/by-customer/:customerId', (req, res) => {
  const row = db.prepare('SELECT id FROM customer_accounts WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1').get(req.params.customerId);
  res.json({ account: row ? accountWithApprovers(row.id) : null });
});

// PUT /api/requests/customer-accounts/:id/access { can_view_ready?, can_view_order? } (either administrator, any time)
router.put('/customer-accounts/:id/access', (req, res) => {
  const account = db.prepare('SELECT * FROM customer_accounts WHERE id = ?').get(req.params.id);
  if (!account) {
    return res.status(404).json({ error: 'Customer account not found' });
  }
  let access;
  try {
    access = readAccess(req.body);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  if (!access) {
    return res.status(400).json({ error: 'Nothing to change' });
  }
  const result = applyAccess(account.id, access, new Date().toISOString());
  logAudit(req.user.id, 'UPDATE_CUSTOMER_ACCESS', 'customer_accounts', account.id,
    `${account.full_name} can now see: ${accessLabel(result)}`, req,
    { can_view_ready: account.can_view_ready !== 0, can_view_order: account.can_view_order !== 0 },
    { can_view_ready: result.ready, can_view_order: result.order });
  res.json({ account: accountWithApprovers(account.id), message: `${account.full_name} can now see: ${accessLabel(result)}` });
});

// GET /api/requests/customer-accounts?status=PENDING|APPROVED|REJECTED|All
router.get('/customer-accounts', (req, res) => {
  const status = req.query.status || 'PENDING';
  const ids = (status === 'All'
    ? db.prepare('SELECT id FROM customer_accounts ORDER BY created_at DESC').all()
    : db.prepare('SELECT id FROM customer_accounts WHERE status = ? ORDER BY created_at DESC').all(status)
  ).map(r => r.id);
  res.json({ accounts: ids.map(accountWithApprovers) });
});

// Create (or link to an existing) customer record once an administrator approves
function activateAccount(account, approverId) {
  const now = new Date().toISOString();
  const accountBrand = account.brand || 'AI925';
  const cleanPhone = normalizePhone(account.phone);
  const resolvedState = account.state || detectStateFromText(account.address) || '';
  let customer = db.prepare("SELECT id FROM customers WHERE (phone = ? OR REPLACE(REPLACE(phone, ' ', ''), '+91', '') = ?) AND is_archived = 0").get(cleanPhone, cleanPhone);
  if (!customer) {
    const customerId = cleanPhone ? 'cust_' + cleanPhone : 'cust_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const existingId = db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId);
    const finalId = existingId ? 'cust_' + Date.now().toString(36) + '_' + (cleanPhone || 'id') : customerId;

    db.prepare(`
      INSERT INTO customers (
        id, poc_name, company_name, phone, email, address, state, zone, notes, category, country, brand,
        created_by_id, rep_edit_count, is_archived, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'West', 'Registered via customer portal', ?, 'India', ?, ?, 0, 0, ?, ?)
    `).run(finalId, account.full_name, account.company_name || account.full_name, cleanPhone, account.email, account.address,
      resolvedState, account.account_type || 'Retailer', accountBrand, approverId, now, now);
    if (account.pin_code) db.prepare('UPDATE customers SET pin_code = ? WHERE id = ?').run(account.pin_code, finalId);
    customer = { id: finalId };
  } else {
    db.prepare("UPDATE customers SET brand = COALESCE(brand, ?), phone = ?, state = COALESCE(NULLIF(state, ''), ?) WHERE id = ?")
      .run(accountBrand, cleanPhone, resolvedState, customer.id);
  }
  db.prepare("UPDATE customer_accounts SET status = 'APPROVED', customer_id = ?, state = COALESCE(NULLIF(state, ''), ?), updated_at = ? WHERE id = ?")
    .run(customer.id, resolvedState, now, account.id);
}

// DELETE /api/requests/customer-accounts/:id
// Admin: Delete portal account, approval history, orders and wipe customer completely
router.delete('/customer-accounts/:id', (req, res) => {
  const account = db.prepare('SELECT * FROM customer_accounts WHERE id = ?').get(req.params.id);
  if (!account) {
    return res.status(404).json({ error: 'Customer account not found' });
  }

  deleteCustomerCompletely({ customerAccountId: account.id, phone: account.phone, email: account.email });

  logAudit(req.user.id, 'DELETE_CUSTOMER_ACCOUNT', 'customer_accounts', account.id, `Completely deleted customer account ${account.full_name} (${account.phone}) and wiped approval history`, req);

  res.json({ success: true, message: `Customer account "${account.full_name}" deleted completely from approval history.` });
});

// POST /api/requests/customer-accounts/:id/approve
// Business Admin records the business approval, System Admin the system approval; either one activates the account.
router.post('/customer-accounts/:id/approve', (req, res) => {
  const account = db.prepare('SELECT * FROM customer_accounts WHERE id = ?').get(req.params.id);
  if (!account) {
    return res.status(404).json({ error: 'Customer account not found' });
  }
  if (account.status === 'APPROVED') {
    return res.status(400).json({ error: 'This customer is already approved' });
  }
  let access;
  try {
    access = readAccess(req.body);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const now = new Date().toISOString();
  const isSystem = req.user.role === 'ADMIN';

  db.transaction(() => {
    if (access) applyAccess(account.id, access, now);
    if (isSystem) {
      db.prepare("UPDATE customer_accounts SET sys_approved_by_id = ?, sys_approved_at = ?, status = 'PENDING', rejected_reason = NULL, updated_at = ? WHERE id = ?")
        .run(req.user.id, now, now, account.id);
    } else {
      db.prepare("UPDATE customer_accounts SET biz_approved_by_id = ?, biz_approved_at = ?, status = 'PENDING', rejected_reason = NULL, updated_at = ? WHERE id = ?")
        .run(req.user.id, now, now, account.id);
    }
    activateAccount(db.prepare('SELECT * FROM customer_accounts WHERE id = ?').get(account.id), req.user.id);
  })();

  const updated = accountWithApprovers(account.id);
  logAudit(req.user.id, 'APPROVE_CUSTOMER_ACCOUNT', 'customer_accounts', account.id,
    `${isSystem ? 'System' : 'Business'} approval for ${account.full_name}${updated.status === 'APPROVED' ? ' (account activated)' : ''}`, req);

  res.json({
    account: updated,
    fully_approved: updated.status === 'APPROVED',
    message: `${account.full_name} is approved by the ${isSystem ? 'System' : 'Business'} Administrator and can now use the portal`
  });
});

// POST /api/requests/customer-accounts/:id/reject
router.post('/customer-accounts/:id/reject', (req, res) => {
  const account = db.prepare('SELECT * FROM customer_accounts WHERE id = ?').get(req.params.id);
  if (!account) {
    return res.status(404).json({ error: 'Customer account not found' });
  }
  const reason = String(req.body.reason || '').trim() || 'Details could not be verified';
  db.prepare("UPDATE customer_accounts SET status = 'REJECTED', rejected_reason = ?, updated_at = ? WHERE id = ?")
    .run(reason, new Date().toISOString(), account.id);
  logAudit(req.user.id, 'REJECT_CUSTOMER_ACCOUNT', 'customer_accounts', account.id, `Rejected ${account.full_name}: ${reason}`, req);
  res.json({ account: accountWithApprovers(account.id) });
});

// POST /api/requests/customer-accounts/:id/notified (WhatsApp approval message was sent)
router.post('/customer-accounts/:id/notified', (req, res) => {
  const result = db.prepare('UPDATE customer_accounts SET notified_at = ? WHERE id = ?').run(new Date().toISOString(), req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Customer account not found' });
  }
  res.json({ account: accountWithApprovers(req.params.id) });
});

// ---------- Customer profile / password change requests ----------
const CHANGE_FIELDS = ['full_name', 'company_name', 'phone', 'email', 'address', 'pin_code'];

function changeRequestRows(where, params, isSystem) {
  return db.prepare(`
    SELECT r.*, ca.full_name, ca.company_name, ca.phone, ca.email, ca.address, ca.pin_code, u.full_name as reviewed_by_name
    FROM customer_change_requests r
    JOIN customer_accounts ca ON r.customer_account_id = ca.id
    LEFT JOIN users u ON r.reviewed_by_id = u.id
    ${where}
    ORDER BY r.created_at DESC
  `).all(...params).map(r => ({
    id: r.id,
    customer_account_id: r.customer_account_id,
    status: r.status,
    created_at: r.created_at,
    reviewed_at: r.reviewed_at,
    reviewed_by_name: r.reviewed_by_name,
    rejected_reason: r.rejected_reason,
    current: { full_name: r.full_name, company_name: r.company_name, phone: r.phone, email: r.email, address: r.address, pin_code: r.pin_code },
    changes: JSON.parse(r.changes || '{}'),
    changes_password: Boolean(r.password_hash),
    // Only the System Administrator sees the new password itself
    new_password: isSystem && r.password_enc ? decrypt(r.password_enc) : null
  }));
}

// GET /api/requests/profile-changes?status=PENDING|APPROVED|REJECTED|All
router.get('/profile-changes', (req, res) => {
  const status = req.query.status || 'PENDING';
  const isSystem = req.user.role === 'ADMIN';
  const rows = status === 'All'
    ? changeRequestRows('', [], isSystem)
    : changeRequestRows('WHERE r.status = ?', [status], isSystem);
  res.json({ requests: rows });
});

// POST /api/requests/profile-changes/:id/approve (either administrator): applies the change to the portal
// account and to the linked customer record
router.post('/profile-changes/:id/approve', (req, res) => {
  const request = db.prepare('SELECT * FROM customer_change_requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Change request not found' });
  if (request.status !== 'PENDING') return res.status(400).json({ error: 'This request was already handled' });
  const account = db.prepare('SELECT * FROM customer_accounts WHERE id = ?').get(request.customer_account_id);
  const changes = JSON.parse(request.changes || '{}');

  if (changes.phone && db.prepare('SELECT 1 FROM customer_accounts WHERE phone = ? AND id != ?').get(changes.phone, account.id)) {
    return res.status(400).json({ error: 'Another account now uses this mobile number; reject this request' });
  }
  if (changes.email && db.prepare('SELECT 1 FROM customer_accounts WHERE LOWER(email) = ? AND id != ?').get(changes.email, account.id)) {
    return res.status(400).json({ error: 'Another account now uses this email; reject this request' });
  }

  const now = new Date().toISOString();
  const fields = CHANGE_FIELDS.filter(f => changes[f] !== undefined);
  db.transaction(() => {
    if (fields.length > 0) {
      db.prepare(`UPDATE customer_accounts SET ${fields.map(f => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
        .run(...fields.map(f => changes[f] || null), now, account.id);
    }
    if (request.password_hash) {
      db.prepare('UPDATE customer_accounts SET password_hash = ?, password_enc = ?, password_changed_at = ?, updated_at = ? WHERE id = ?')
        .run(request.password_hash, request.password_enc, now, now, account.id);
      db.prepare(`
        INSERT INTO customer_password_history (id, customer_account_id, password_enc, source, approved_by_id, created_at)
        VALUES (?, ?, ?, 'CHANGED', ?, ?)
      `).run(newId('pwh'), account.id, request.password_enc, req.user.id, now);
    }
    // Keep the customer record the staff work with in step (a blank company name keeps the old one)
    if (account.customer_id) {
      const map = { full_name: 'poc_name', company_name: 'company_name', phone: 'phone', email: 'email', address: 'address', pin_code: 'pin_code' };
      const cols = fields.filter(f => !(f === 'company_name' && !changes[f]));
      if (cols.length > 0) {
        db.prepare(`UPDATE customers SET ${cols.map(f => `${map[f]} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
          .run(...cols.map(f => changes[f]), now, account.customer_id);
      }
    }
    db.prepare("UPDATE customer_change_requests SET status = 'APPROVED', reviewed_by_id = ?, reviewed_at = ? WHERE id = ?")
      .run(req.user.id, now, request.id);
  })();

  const what = [...fields.map(f => f.replace('_', ' ')), ...(request.password_hash ? ['password'] : [])].join(', ');
  logAudit(req.user.id, 'APPROVE_PROFILE_CHANGE', 'customer_accounts', account.id, `Approved ${account.full_name}'s change: ${what}`, req);
  res.json({ message: `${account.full_name}'s ${what} updated` });
});

// POST /api/requests/profile-changes/:id/reject { reason }
router.post('/profile-changes/:id/reject', (req, res) => {
  const request = db.prepare('SELECT * FROM customer_change_requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Change request not found' });
  if (request.status !== 'PENDING') return res.status(400).json({ error: 'This request was already handled' });
  const reason = String(req.body.reason || '').trim() || 'Not approved';
  db.prepare("UPDATE customer_change_requests SET status = 'REJECTED', rejected_reason = ?, reviewed_by_id = ?, reviewed_at = ? WHERE id = ?")
    .run(reason, req.user.id, new Date().toISOString(), request.id);
  logAudit(req.user.id, 'REJECT_PROFILE_CHANGE', 'customer_accounts', request.customer_account_id, `Rejected profile change: ${reason}`, req);
  res.json({ message: 'Change rejected' });
});

// GET /api/requests/credentials?customer_id=|account_id= (System Administrator only): portal sign-in details,
// the password in force and every earlier one
router.get('/credentials', requireAdmin, (req, res) => {
  const { customer_id, account_id } = req.query;
  const account = account_id
    ? db.prepare('SELECT * FROM customer_accounts WHERE id = ?').get(account_id)
    : db.prepare('SELECT * FROM customer_accounts WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1').get(customer_id);
  if (!account) return res.json({ account: null, history: [] });
  const history = db.prepare(`
    SELECT h.password_enc, h.source, h.created_at, u.full_name as approved_by_name
    FROM customer_password_history h LEFT JOIN users u ON h.approved_by_id = u.id
    WHERE h.customer_account_id = ? ORDER BY h.created_at DESC
  `).all(account.id).map(h => ({ password: decrypt(h.password_enc), source: h.source, created_at: h.created_at, approved_by_name: h.approved_by_name }));
  const pending = db.prepare("SELECT password_enc, created_at FROM customer_change_requests WHERE customer_account_id = ? AND status = 'PENDING' AND password_enc IS NOT NULL").get(account.id);
  res.json({
    account: {
      id: account.id,
      full_name: account.full_name,
      phone: account.phone,
      email: account.email,
      status: account.status,
      password: decrypt(account.password_enc),
      password_recorded: Boolean(account.password_enc),
      password_changed_at: account.password_changed_at,
      created_at: account.created_at,
      pending_password: pending ? { password: decrypt(pending.password_enc), requested_at: pending.created_at } : null
    },
    history
  });
});

// PUT /api/requests/credentials/:accountId { password } (System Administrator sets a new password directly)
router.put('/credentials/:accountId', requireAdmin, (req, res) => {
  const account = db.prepare('SELECT * FROM customer_accounts WHERE id = ?').get(req.params.accountId);
  if (!account) return res.status(404).json({ error: 'Customer account not found' });
  const password = String(req.body.password || '');
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const enc = encrypt(password);
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare('UPDATE customer_accounts SET password_hash = ?, password_enc = ?, password_changed_at = ?, updated_at = ? WHERE id = ?')
      .run(bcrypt.hashSync(password, 10), enc, now, now, account.id);
    db.prepare(`
      INSERT INTO customer_password_history (id, customer_account_id, password_enc, source, approved_by_id, created_at)
      VALUES (?, ?, ?, 'SET_BY_ADMIN', ?, ?)
    `).run(newId('pwh'), account.id, enc, req.user.id, now);
  })();
  logAudit(req.user.id, 'SET_CUSTOMER_PASSWORD', 'customer_accounts', account.id, `Set a new portal password for ${account.full_name}`, req);
  res.json({ message: `New password saved for ${account.full_name}` });
});

// ---------- "Book a call" requests ----------
// GET /api/requests/call-bookings?status=OPEN|SCHEDULED|DONE|CANCELLED|All (default: open and scheduled)
router.get('/call-bookings', (req, res) => {
  const { status } = req.query;
  let query = `
    SELECT b.*, ca.full_name as customer_name, ca.company_name, ca.email as customer_email, u.full_name as handled_by_name
    FROM call_bookings b
    JOIN customer_accounts ca ON b.customer_account_id = ca.id
    LEFT JOIN users u ON b.handled_by_id = u.id
  `;
  const params = [];
  if (status && status !== 'All') {
    query += ' WHERE b.status = ?';
    params.push(status);
  } else if (!status) {
    query += " WHERE b.status IN ('OPEN', 'SCHEDULED')";
  }
  query += ' ORDER BY b.created_at DESC';
  res.json({ bookings: db.prepare(query).all(...params) });
});

// PUT /api/requests/call-bookings/:id { status, admin_notes }
router.put('/call-bookings/:id', (req, res) => {
  const booking = db.prepare('SELECT * FROM call_bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  const { status, admin_notes } = req.body;
  if (status && !['OPEN', 'SCHEDULED', 'DONE', 'CANCELLED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  db.prepare('UPDATE call_bookings SET status = ?, admin_notes = ?, handled_by_id = ?, updated_at = ? WHERE id = ?')
    .run(status || booking.status, admin_notes !== undefined ? String(admin_notes) : booking.admin_notes, req.user.id, new Date().toISOString(), booking.id);
  logAudit(req.user.id, 'UPDATE_CALL_BOOKING', 'call_bookings', booking.id, `Call booking set to ${status || booking.status}`, req);
  res.json({ booking: db.prepare('SELECT * FROM call_bookings WHERE id = ?').get(booking.id) });
});

// GET /api/requests/on-order (On Order Purchase requests from the portal)
router.get('/on-order', (req, res) => {
  const status = req.query.status || 'OPEN';
  let query = `
    SELECT o.id, o.order_number, o.order_date, o.status, o.total_pieces, o.expected_weight, o.total_amount,
      o.payment_status, o.special_notes, o.created_at, c.company_name, c.poc_name, c.phone as customer_phone
    FROM orders o JOIN customers c ON o.customer_id = c.id
    WHERE o.order_type = 'ON_ORDER'
  `;
  const params = [];
  if (status !== 'All') {
    query += ' AND o.status = ?';
    params.push(status);
  }
  query += ' ORDER BY o.created_at DESC';
  res.json({ orders: db.prepare(query).all(...params) });
});

module.exports = router;
