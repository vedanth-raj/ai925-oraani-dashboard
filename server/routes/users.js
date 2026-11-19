const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../db/database');
const { authenticateToken, requireAdmin, requireAdminOrBusinessAdmin, logAudit } = require('../middleware/auth');

// ============================================================================
// 1. BUSINESS ADMINISTRATORS MANAGEMENT (Admin Only)
// ============================================================================

// GET /api/users/business-admins (Admin only)
router.get('/business-admins', authenticateToken, requireAdmin, (req, res) => {
  const admins = db.prepare(`
    SELECT 
      id,
      username,
      full_name,
      phone,
      email,
      employee_code,
      assigned_region,
      is_active,
      created_at,
      updated_at
    FROM users
    WHERE role = 'BUSINESS_ADMIN'
    ORDER BY created_at ASC
  `).all();

  res.json({ business_admins: admins });
});

// POST /api/users/business-admins (Admin only)
router.post('/business-admins', authenticateToken, requireAdmin, (req, res) => {
  const { username, full_name, phone, email, employee_code, password, pin } = req.body;
  const credential = password || pin || '888888';

  if (!full_name || !full_name.trim()) {
    return res.status(400).json({ error: 'Full name is required' });
  }

  const userUsername = (username && username.trim()) 
    ? username.trim().toLowerCase().replace(/\s+/g, '_')
    : 'biz_' + (employee_code ? employee_code.toLowerCase().replace(/[^a-z0-9]/g, '') : Date.now().toString(36).substring(4));

  if (credential.toString().length < 4) {
    return res.status(400).json({ error: 'Password/PIN must be at least 4 characters' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(userUsername);
  if (existing) {
    return res.status(400).json({ error: 'Username is already taken. Please choose another.' });
  }

  const id = 'usr_biz_' + Date.now().toString(36);
  const pinHash = bcrypt.hashSync(credential.toString(), 10);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (
      id, username, pin_hash, role, full_name, phone, email,
      employee_code, assigned_region, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, 'BUSINESS_ADMIN', ?, ?, ?, ?, 'West', 1, ?, ?)
  `).run(
    id,
    userUsername,
    pinHash,
    full_name.trim(),
    phone || '',
    email || '',
    employee_code || ('BA-' + Date.now().toString().slice(-4)),
    now,
    now
  );

  logAudit(req.user.id, 'CREATE_BUSINESS_ADMIN', 'users', id, `Created Business Administrator: ${full_name.trim()} (${userUsername})`, req);

  const created = db.prepare('SELECT id, username, role, full_name, phone, email, employee_code, is_active, created_at FROM users WHERE id = ?').get(id);
  res.status(201).json({ business_admin: created, message: 'Business Administrator created successfully' });
});

// PUT /api/users/business-admins/:id (Admin only)
router.put('/business-admins/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { full_name, phone, email, username, is_active, password, pin } = req.body;

  const admin = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'BUSINESS_ADMIN'").get(id);
  if (!admin) {
    return res.status(404).json({ error: 'Business Administrator not found' });
  }

  if (username && username.trim() !== admin.username) {
    const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username.trim(), id);
    if (existing) {
      return res.status(400).json({ error: 'Username is already taken' });
    }
  }

  const now = new Date().toISOString();
  let newPinHash = admin.pin_hash;
  if (password || pin) {
    const cred = password || pin;
    if (cred.toString().length < 4) {
      return res.status(400).json({ error: 'Password/PIN must be at least 4 characters' });
    }
    newPinHash = bcrypt.hashSync(cred.toString(), 10);
  }

  db.prepare(`
    UPDATE users SET
      full_name = COALESCE(?, full_name),
      username = COALESCE(?, username),
      phone = COALESCE(?, phone),
      email = COALESCE(?, email),
      pin_hash = ?,
      is_active = COALESCE(?, is_active),
      updated_at = ?
    WHERE id = ?
  `).run(
    full_name ? full_name.trim() : null,
    username ? username.trim().toLowerCase() : null,
    phone,
    email,
    newPinHash,
    is_active !== undefined ? (is_active ? 1 : 0) : null,
    now,
    id
  );

  logAudit(req.user.id, 'UPDATE_BUSINESS_ADMIN', 'users', id, `Updated Business Administrator ${admin.username}`, req, admin, req.body);

  const updated = db.prepare('SELECT id, username, role, full_name, phone, email, employee_code, is_active FROM users WHERE id = ?').get(id);
  res.json({ business_admin: updated, message: 'Business Administrator updated successfully' });
});

// DELETE /api/users/business-admins/:id (Admin only)
router.delete('/business-admins/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const admin = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'BUSINESS_ADMIN'").get(id);
  if (!admin) {
    return res.status(404).json({ error: 'Business Administrator not found' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  logAudit(req.user.id, 'DELETE_BUSINESS_ADMIN', 'users', id, `Deleted Business Administrator ${admin.username}`, req, admin);

  res.json({ success: true, message: `Business Administrator ${admin.full_name} deleted successfully` });
});

// POST /api/users/business-admins/:id/reset-pin (Admin only)
router.post('/business-admins/:id/reset-pin', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { new_pin, password } = req.body;
  const credential = password || new_pin;

  if (!credential || credential.toString().length < 4) {
    return res.status(400).json({ error: 'New PIN/Password must be at least 4 characters' });
  }

  const admin = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'BUSINESS_ADMIN'").get(id);
  if (!admin) {
    return res.status(404).json({ error: 'Business Administrator not found' });
  }

  const newHash = bcrypt.hashSync(credential.toString(), 10);
  db.prepare('UPDATE users SET pin_hash = ?, updated_at = ? WHERE id = ?').run(newHash, new Date().toISOString(), id);

  logAudit(req.user.id, 'RESET_PIN', 'users', id, `Admin reset password/PIN for Business Administrator ${admin.username}`, req);

  res.json({ success: true, message: `Password/PIN reset successfully for ${admin.full_name}` });
});

// ============================================================================
// 2. SALES REPRESENTATIVES MANAGEMENT (Admin & Business Admin)
// ============================================================================

// GET /api/users/representatives (Admin and Business Admin)
router.get('/representatives', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  const reps = db.prepare(`
    SELECT 
      u.id,
      u.username,
      u.full_name,
      u.phone,
      u.email,
      u.employee_code,
      u.assigned_region,
      u.is_active,
      u.created_at,
      COUNT(DISTINCT o.id) as orders_count,
      COALESCE(SUM(o.expected_weight), 0.0) as total_ordered_grams,
      COALESCE(SUM(o.delivered_weight), 0.0) as total_delivered_grams
    FROM users u
    LEFT JOIN orders o ON (o.sales_rep_id = u.id OR o.creator_id = u.id)
    WHERE u.role = 'SALES_REP'
    GROUP BY u.id
    ORDER BY u.created_at ASC
  `).all();

  // Attach assigned companies list to each representative
  for (const rep of reps) {
    const assignedCompanies = db.prepare(`
      SELECT company_name FROM rep_company_assignments 
      WHERE user_id = ? 
      ORDER BY company_name ASC
    `).all(rep.id).map(c => c.company_name);
    rep.assigned_companies = assignedCompanies;
  }

  res.json({ representatives: reps });
});

// POST /api/users/representatives (Admin only)
router.post('/representatives', authenticateToken, requireAdmin, (req, res) => {
  const { username, full_name, phone, email, employee_code, assigned_region, pin, password, assigned_companies } = req.body;

  if (!full_name || !full_name.trim()) {
    return res.status(400).json({ error: 'Representative full name is required' });
  }

  const credential = password || pin || '123456';
  if (credential.toString().length < 4) {
    return res.status(400).json({ error: 'PIN/Password must be at least 4 characters' });
  }

  const id = 'usr_rep_' + Date.now().toString(36);
  const userUsername = (username && username.trim())
    ? username.trim().toLowerCase().replace(/\s+/g, '_')
    : 'rep_' + (employee_code ? employee_code.toLowerCase().replace(/[^a-z0-9]/g, '') : Date.now().toString(36).substring(4));

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(userUsername);
  if (existing) {
    return res.status(400).json({ error: 'Username is already taken. Please choose another.' });
  }

  const pinHash = bcrypt.hashSync(credential.toString(), 10);
  const now = new Date().toISOString();

  // Check unique employee code
  if (employee_code) {
    const existingCode = db.prepare('SELECT id FROM users WHERE employee_code = ?').get(employee_code);
    if (existingCode) {
      return res.status(400).json({ error: 'A representative with this employee code already exists' });
    }
  }

  db.prepare(`
    INSERT INTO users (
      id, username, pin_hash, role, full_name, phone, email,
      employee_code, assigned_region, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, 'SALES_REP', ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    id,
    userUsername,
    pinHash,
    full_name.trim(),
    phone || '',
    email || '',
    employee_code || ('SR-' + Date.now().toString().slice(-4)),
    assigned_region || 'West',
    now,
    now
  );

  // Assign companies if provided
  if (assigned_companies && Array.isArray(assigned_companies)) {
    const insertAssign = db.prepare(`
      INSERT OR IGNORE INTO rep_company_assignments (id, user_id, company_name, assigned_by_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const comp of assigned_companies) {
      if (comp && comp.trim()) {
        const asgnId = 'asgn_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
        insertAssign.run(asgnId, id, comp.trim(), req.user.id, now);
      }
    }
  }

  logAudit(req.user.id, 'CREATE_REPRESENTATIVE', 'users', id, `Created sales representative: ${full_name.trim()} (${userUsername})`, req, null, req.body);

  const created = db.prepare('SELECT id, username, full_name, phone, email, employee_code, assigned_region, is_active FROM users WHERE id = ?').get(id);
  res.status(201).json({ representative: created, message: 'Sales representative created successfully' });
});

// PUT /api/users/representatives/:id (Admin only)
router.put('/representatives/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { username, full_name, phone, email, assigned_region, is_active, pin, password, assigned_companies } = req.body;

  const rep = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'SALES_REP'").get(id);
  if (!rep) {
    return res.status(404).json({ error: 'Sales representative not found' });
  }

  if (username && username.trim() !== rep.username) {
    const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username.trim(), id);
    if (existing) {
      return res.status(400).json({ error: 'Username is already taken' });
    }
  }

  const now = new Date().toISOString();
  let newPinHash = rep.pin_hash;
  if (password || pin) {
    const cred = password || pin;
    if (cred.toString().length < 4) {
      return res.status(400).json({ error: 'PIN/Password must be at least 4 characters' });
    }
    newPinHash = bcrypt.hashSync(cred.toString(), 10);
  }

  db.prepare(`
    UPDATE users SET
      username = COALESCE(?, username),
      full_name = COALESCE(?, full_name),
      phone = COALESCE(?, phone),
      email = COALESCE(?, email),
      assigned_region = COALESCE(?, assigned_region),
      is_active = COALESCE(?, is_active),
      pin_hash = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    username ? username.trim().toLowerCase() : null,
    full_name ? full_name.trim() : null,
    phone,
    email,
    assigned_region,
    is_active !== undefined ? (is_active ? 1 : 0) : null,
    newPinHash,
    now,
    id
  );

  // Update assigned companies if provided
  if (assigned_companies && Array.isArray(assigned_companies)) {
    db.prepare('DELETE FROM rep_company_assignments WHERE user_id = ?').run(id);
    const insertAssign = db.prepare(`
      INSERT OR IGNORE INTO rep_company_assignments (id, user_id, company_name, assigned_by_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const comp of assigned_companies) {
      if (comp && comp.trim()) {
        const asgnId = 'asgn_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
        insertAssign.run(asgnId, id, comp.trim(), req.user.id, now);
      }
    }
  }

  logAudit(req.user.id, 'UPDATE_REPRESENTATIVE', 'users', id, `Updated representative ${rep.username}`, req, rep, req.body);

  const updated = db.prepare('SELECT id, username, full_name, phone, email, employee_code, assigned_region, is_active FROM users WHERE id = ?').get(id);
  res.json({ representative: updated, message: 'Sales representative updated successfully' });
});

// DELETE /api/users/representatives/:id (Admin only)
router.delete('/representatives/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const rep = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'SALES_REP'").get(id);
  if (!rep) {
    return res.status(404).json({ error: 'Sales representative not found' });
  }

  // Check if rep has orders
  const ordersCount = db.prepare('SELECT COUNT(*) as c FROM orders WHERE sales_rep_id = ? OR creator_id = ?').get(id, id).c;
  if (ordersCount > 0) {
    // Soft delete/deactivate to preserve historical integrity
    db.prepare('UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);
  } else {
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }

  logAudit(req.user.id, 'DELETE_REPRESENTATIVE', 'users', id, `Deleted/deactivated representative ${rep.username}`, req, rep);

  res.json({ success: true, message: `Representative ${rep.full_name} deleted successfully` });
});

// POST /api/users/representatives/:id/reset-pin (Admin only)
router.post('/representatives/:id/reset-pin', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { new_pin, password } = req.body;
  const credential = password || new_pin;

  if (!credential || credential.toString().length < 4) {
    return res.status(400).json({ error: 'New PIN/Password must be at least 4 characters' });
  }

  const rep = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'SALES_REP'").get(id);
  if (!rep) {
    return res.status(404).json({ error: 'User not found' });
  }

  const newHash = bcrypt.hashSync(credential.toString(), 10);
  db.prepare('UPDATE users SET pin_hash = ?, updated_at = ? WHERE id = ?').run(newHash, new Date().toISOString(), id);

  logAudit(req.user.id, 'RESET_PIN', 'users', id, `Admin reset PIN for representative ${rep.username}`, req);

  res.json({ success: true, message: `PIN/Password reset successfully for ${rep.full_name}` });
});

// ============================================================================
// 3. COMPANY ASSIGNMENTS FOR SALES REPRESENTATIVES (Admin & Business Admin)
// ============================================================================

// GET /api/users/representatives/:id/companies
router.get('/representatives/:id/companies', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  const { id } = req.params;
  const assignments = db.prepare(`
    SELECT id, company_name, assigned_by_id, created_at
    FROM rep_company_assignments
    WHERE user_id = ?
    ORDER BY company_name ASC
  `).all(id);

  res.json({ companies: assignments.map(a => a.company_name), assignments });
});

// GET /api/users/unassigned-companies (Companies not assigned to ANY representative)
router.get('/unassigned-companies', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  const companies = db.prepare(`
    SELECT DISTINCT company_name
    FROM customers
    WHERE is_archived = 0
      AND company_name NOT IN (SELECT company_name FROM rep_company_assignments)
    ORDER BY company_name ASC
  `).all().map(c => c.company_name);

  res.json({ companies });
});

// GET /api/users/companies-directory (All registered companies and their assigned sales representative)
router.get('/companies-directory', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  const companies = db.prepare(`
    SELECT DISTINCT 
      c.company_name, 
      rca.user_id as assigned_rep_id, 
      u.full_name as assigned_rep_name
    FROM customers c
    LEFT JOIN rep_company_assignments rca ON LOWER(c.company_name) = LOWER(rca.company_name)
    LEFT JOIN users u ON rca.user_id = u.id
    WHERE c.is_archived = 0
    ORDER BY c.company_name ASC
  `).all();

  res.json({ companies });
});

// POST /api/users/representatives/:id/companies (Assign company)
router.post('/representatives/:id/companies', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  const { id } = req.params;
  const { company_name } = req.body;

  if (!company_name || !company_name.trim()) {
    return res.status(400).json({ error: 'Company name is required' });
  }

  const rep = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'SALES_REP'").get(id);
  if (!rep) {
    return res.status(404).json({ error: 'Sales representative not found' });
  }

  // EXCLUSIVITY RULE: Check if company is already assigned to ANY other sales representative
  const existingAssign = db.prepare(`
    SELECT rca.*, u.full_name as rep_name
    FROM rep_company_assignments rca
    JOIN users u ON rca.user_id = u.id
    WHERE LOWER(rca.company_name) = LOWER(?) AND rca.user_id != ?
  `).get(company_name.trim(), id);

  if (existingAssign) {
    return res.status(400).json({ 
      error: `Company "${company_name.trim()}" is already assigned to representative ${existingAssign.rep_name}. It cannot be assigned to another sales representative.` 
    });
  }

  const asgnId = 'asgn_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  db.prepare(`
    INSERT OR REPLACE INTO rep_company_assignments (id, user_id, company_name, assigned_by_id, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(asgnId, id, company_name.trim(), req.user.id, new Date().toISOString());

  logAudit(req.user.id, 'ASSIGN_COMPANY', 'rep_company_assignments', asgnId, `Assigned company "${company_name.trim()}" to representative ${rep.full_name}`, req);

  res.status(201).json({ success: true, message: `Company "${company_name.trim()}" assigned to ${rep.full_name}` });
});

// DELETE /api/users/representatives/:id/companies/:companyName
router.delete('/representatives/:id/companies/:companyName', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  const { id, companyName } = req.params;
  db.prepare('DELETE FROM rep_company_assignments WHERE user_id = ? AND company_name = ?').run(id, decodeURIComponent(companyName));

  logAudit(req.user.id, 'UNASSIGN_COMPANY', 'rep_company_assignments', id, `Unassigned company "${decodeURIComponent(companyName)}" from rep ${id}`, req);

  res.json({ success: true, message: 'Company unassigned successfully' });
});

// ============================================================================
// 4. SALESPERSON AUDIT TRAIL / ACTIVITY LOG (Admin Only)
// ============================================================================

// GET /api/users/audit-logs (Admin only)
router.get('/audit-logs', authenticateToken, requireAdmin, (req, res) => {
  const { user_id, entity_type, limit } = req.query;
  const maxRows = Math.min(parseInt(limit, 10) || 100, 500);

  let query = `
    SELECT 
      a.id,
      a.user_id,
      u.username,
      u.full_name as user_name,
      u.role as user_role,
      a.action,
      a.entity_type,
      a.entity_id,
      a.details,
      a.previous_data,
      a.new_data,
      a.ip_address,
      a.created_at
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.id
    WHERE 1=1
  `;

  const params = [];

  if (user_id) {
    query += ' AND a.user_id = ?';
    params.push(user_id);
  }

  if (entity_type) {
    query += ' AND a.entity_type = ?';
    params.push(entity_type);
  }

  query += ' ORDER BY a.created_at DESC LIMIT ?';
  params.push(maxRows);

  const logs = db.prepare(query).all(...params);

  // Parse JSON fields safely
  for (const log of logs) {
    if (log.previous_data) {
      try { log.previous_data = JSON.parse(log.previous_data); } catch (_) {}
    }
    if (log.new_data) {
      try { log.new_data = JSON.parse(log.new_data); } catch (_) {}
    }
  }

  res.json({ logs });
});

// ============================================================================
// 5. LIVE LOCATION TRACKING (Sales Rep update, Admin/Business Admin monitor)
// ============================================================================

// POST /api/users/location (Update live location for current user)
router.post('/location', authenticateToken, (req, res) => {
  const { latitude, longitude, address } = req.body;
  if (latitude === undefined || longitude === undefined || latitude === null || longitude === null) {
    return res.status(400).json({ error: 'Latitude and longitude coordinates are required' });
  }

  const latNum = parseFloat(latitude);
  const lngNum = parseFloat(longitude);
  if (isNaN(latNum) || isNaN(lngNum)) {
    return res.status(400).json({ error: 'Valid numeric coordinates required' });
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users SET
      last_latitude = ?,
      last_longitude = ?,
      last_location_address = ?,
      last_location_updated_at = ?
    WHERE id = ?
  `).run(latNum, lngNum, address || null, now, req.user.id);

  res.json({ success: true, timestamp: now });
});

// GET /api/users/representatives/locations (View live/last location of all sales reps - Admin & Business Admin)
router.get('/representatives/locations', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  const reps = db.prepare(`
    SELECT 
      id, username, full_name, phone, email, employee_code, assigned_region,
      last_latitude, last_longitude, last_location_address, last_location_updated_at, is_active
    FROM users
    WHERE role = 'SALES_REP'
    ORDER BY full_name ASC
  `).all();

  res.json({ representatives: reps });
});

module.exports = router;
