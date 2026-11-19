const express = require('express');
const router = express.Router();
const multer = require('multer');
const { db } = require('../db/database');
const { authenticateToken, logAudit, isCustomerOnline } = require('../middleware/auth');
const { uploadsSubdir, storeUploadedFile, ensureNamed, imageFileFilter } = require('../utils/files');

// Visiting cards are stored as "<Company Name>.jpg" ("<Company Name>-1.jpg", ... for more cards)
const CARDS_DIR = uploadsSubdir('visiting_cards');

const uploadCard = multer({
  dest: CARDS_DIR,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFileFilter('visiting cards')
});

// POST /api/customers/upload-visiting-card (Upload visiting card image)
router.post('/upload-visiting-card', authenticateToken, uploadCard.single('visiting_card'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please choose an image file to upload' });
  }

  const relativePath = storeUploadedFile(req.file, CARDS_DIR, req.body.company_name || req.query.company_name || 'company');
  res.json({
    success: true,
    file_path: relativePath,
    filename: relativePath.split('/').pop(),
    original_name: req.file.originalname
  });
});

// Helper to sanitize additional_phones
function formatAdditionalPhones(phones) {
  if (!phones) return null;
  if (Array.isArray(phones)) {
    const cleaned = phones.map(p => String(p).trim()).filter(Boolean);
    return cleaned.length > 0 ? JSON.stringify(cleaned) : null;
  }
  if (typeof phones === 'string') {
    try {
      const parsed = JSON.parse(phones);
      if (Array.isArray(parsed)) return JSON.stringify(parsed.map(p => String(p).trim()).filter(Boolean));
    } catch (_) {
      const split = phones.split(',').map(p => p.trim()).filter(Boolean);
      return split.length > 0 ? JSON.stringify(split) : null;
    }
  }
  return null;
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

// GET /api/customers (Matching Customers List Screen Images 8, 9 with Sales Rep Isolation)
router.get('/', authenticateToken, (req, res) => {
  const { search, brand } = req.query;
  const isRep = req.user.role === 'SALES_REP';

  let query = `
    SELECT 
      c.*,
      c.created_by_id as created_by,
      u.full_name as creator_name,
      COUNT(DISTINCT o.id) as orders_count,
      COALESCE(SUM(o.expected_weight), 0.0) as total_grams_ordered
    FROM customers c
    LEFT JOIN users u ON c.created_by_id = u.id
    LEFT JOIN orders o ON o.customer_id = c.id
    WHERE c.is_archived = 0
  `;

  const params = [];

  // STRICT SECURITY CHECK: Sales Rep can ONLY view customers whose company is assigned to them or created by them
  if (isRep) {
    query += ` AND (
      c.created_by_id = ? 
      OR c.company_name IN (SELECT company_name FROM rep_company_assignments WHERE user_id = ?)
    )`;
    params.push(req.user.id, req.user.id);
  }

  if (brand && brand !== 'All') {
    query += ' AND c.brand = ?';
    params.push(brand);
  }

  if (search) {
    query += ` AND (
      c.poc_name LIKE ? OR 
      c.company_name LIKE ? OR 
      c.phone LIKE ? OR 
      c.alternate_phone LIKE ? OR
      c.gstin LIKE ? OR
      c.city LIKE ?
    )`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += ` GROUP BY c.id ORDER BY c.poc_name ASC`;

  const customers = db.prepare(query).all(...params);

  // Administrators see which customers are using the portal right now (green dot)
  if (req.user.role === 'ADMIN' || req.user.role === 'BUSINESS_ADMIN') {
    const seen = db.prepare(`
      SELECT customer_id, MAX(last_seen_at) as last_seen_at FROM customer_accounts
      WHERE customer_id IS NOT NULL AND status = 'APPROVED' GROUP BY customer_id
    `).all();
    const seenBy = new Map(seen.map(r => [r.customer_id, r.last_seen_at]));
    for (const c of customers) {
      c.portal_last_seen_at = seenBy.get(c.id) || null;
      c.portal_online = isCustomerOnline(c.portal_last_seen_at);
    }
  }

  res.json({ customers });
});

// GET /api/customers/companies/summary (Matching Companies Screen Image 4 with strict isolation)
router.get('/companies/summary', authenticateToken, (req, res) => {
  const { search } = req.query;
  const isRep = req.user.role === 'SALES_REP';

  let query = `
    SELECT 
      c.company_name,
      COUNT(DISTINCT c.id) as poc_count,
      MIN(c.city) as city,
      MIN(c.zone) as zone,
      COUNT(DISTINCT o.id) as orders_count,
      COALESCE(SUM(o.expected_weight), 0.0) as total_ordered_grams,
      COALESCE(SUM(o.delivered_weight), 0.0) as total_delivered_grams,
      COALESCE(SUM(CASE WHEN o.status = 'OPEN' THEN 1 ELSE 0 END), 0) as open_orders_count
    FROM customers c
    LEFT JOIN orders o ON o.customer_id = c.id
    WHERE c.is_archived = 0
  `;

  const params = [];

  // STRICT SECURITY CHECK: Sales Rep can ONLY see assigned companies
  if (isRep) {
    query += ` AND c.company_name IN (SELECT company_name FROM rep_company_assignments WHERE user_id = ?)`;
    params.push(req.user.id);
  }

  if (search) {
    query += ` AND c.company_name LIKE ?`;
    params.push(`%${search}%`);
  }

  query += ` GROUP BY c.company_name ORDER BY c.company_name ASC`;

  const companies = db.prepare(query).all(...params);

  res.json({ companies });
});

// GET /api/customers/:id (Matching Customer Details Images 6, 10 with strict isolation)
router.get('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const isRep = req.user.role === 'SALES_REP';

  const customer = db.prepare(`
    SELECT c.*, c.created_by_id as created_by, u.full_name as creator_name 
    FROM customers c 
    LEFT JOIN users u ON c.created_by_id = u.id 
    WHERE c.id = ?
  `).get(id);

  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  // STRICT SECURITY CHECK: Sales Rep cannot view a customer they are not assigned to or didn't create
  if (isRep) {
    const hasAssignment = db.prepare(`
      SELECT 1 FROM rep_company_assignments WHERE user_id = ? AND company_name = ?
    `).get(req.user.id, customer.company_name);
    if (customer.created_by_id !== req.user.id && !hasAssignment) {
      return res.status(403).json({ error: 'Access denied: You do not have permission to view this customer.' });
    }
  }

  // Summary Metrics: TOTAL, OPEN, CLOSED, ORDERED, DELIVERED
  let orderFilter = 'WHERE customer_id = ?';
  let orderParams = [id];
  if (isRep) {
    orderFilter += ' AND (creator_id = ? OR sales_rep_id = ?)';
    orderParams.push(req.user.id, req.user.id);
  }

  const summary = db.prepare(`
    SELECT 
      COUNT(id) as total_orders,
      SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as open_orders,
      SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as in_progress_orders,
      SUM(CASE WHEN status = 'CLOSED' THEN 1 ELSE 0 END) as closed_orders,
      COALESCE(SUM(expected_weight), 0.0) as total_ordered_grams,
      COALESCE(SUM(delivered_weight), 0.0) as total_delivered_grams,
      COALESCE(SUM(total_amount), 0.0) as total_value,
      COALESCE(SUM(paid_amount), 0.0) as total_paid
    FROM orders
    ${orderFilter}
  `).get(...orderParams);

  // Order History for this customer
  const orders = db.prepare(`
    SELECT 
      o.id,
      o.order_number,
      o.order_date,
      o.status,
      o.total_pieces,
      o.expected_weight,
      o.delivered_pieces,
      o.delivered_weight,
      o.total_amount,
      o.payment_status,
      o.order_type,
      o.created_at
    FROM orders o
    ${orderFilter}
    ORDER BY o.order_date DESC, o.order_number DESC
  `).all(...orderParams);

  res.json({
    customer,
    summary: {
      total: summary.total_orders || 0,
      open: summary.open_orders || 0,
      in_progress: summary.in_progress_orders || 0,
      closed: summary.closed_orders || 0,
      ordered_grams: summary.total_ordered_grams || 0.0,
      delivered_grams: summary.total_delivered_grams || 0.0,
      total_value: summary.total_value || 0.0,
      total_paid: summary.total_paid || 0.0
    },
    orders
  });
});

// POST /api/customers (Add Customer with Visiting Card, Location & Category)
router.post('/', authenticateToken, (req, res) => {
  const {
    poc_name,
    company_name,
    phone,
    alternate_phone,
    additional_phones,
    gstin,
    email,
    address,
    pin_code,
    city,
    state,
    zone,
    notes,
    visiting_card_path,
    latitude,
    longitude,
    location_address,
    category,
    country,
    brand,
    assigned_rep_id
  } = req.body;

  if (!poc_name || !poc_name.trim()) {
    return res.status(400).json({ error: 'POC Name is required' });
  }

  if (!company_name || !company_name.trim()) {
    return res.status(400).json({ error: 'Company Name is required' });
  }

  const isRep = req.user.role === 'SALES_REP';

  // STRICT SECURITY CHECK: Prevent Sales Rep from creating a customer under another company not assigned to them
  if (isRep) {
    const existingCompany = db.prepare(`
      SELECT DISTINCT company_name FROM customers WHERE LOWER(company_name) = LOWER(?) AND is_archived = 0
      UNION
      SELECT DISTINCT company_name FROM rep_company_assignments WHERE LOWER(company_name) = LOWER(?)
    `).all(company_name.trim(), company_name.trim());

    if (existingCompany.length > 0) {
      const isAssigned = db.prepare(`
        SELECT 1 FROM rep_company_assignments WHERE user_id = ? AND LOWER(company_name) = LOWER(?)
      `).get(req.user.id, company_name.trim());

      if (!isAssigned) {
        return res.status(403).json({
          error: `Access denied: Company "${company_name.trim()}" is not assigned to you. You can only add customers to companies assigned to you.`
        });
      }
    }
  }

  const cleanPhone = phone ? normalizePhone(phone) : '';
  if (cleanPhone) {
    if (cleanPhone.length < 10) {
      return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number' });
    }
    const existing = db.prepare(`
      SELECT id, poc_name, company_name FROM customers 
      WHERE (phone = ? OR REPLACE(REPLACE(phone, ' ', ''), '+91', '') = ?) AND is_archived = 0
    `).get(cleanPhone, cleanPhone);

    if (existing) {
      return res.status(400).json({
        error: `A customer with mobile number ${cleanPhone} already exists: "${existing.poc_name}" (${existing.company_name}). Each customer must have only one mobile number.`
      });
    }
  }

  const generatedId = cleanPhone ? 'cust_' + cleanPhone : 'cust_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  const existingId = db.prepare('SELECT id FROM customers WHERE id = ?').get(generatedId);
  const id = existingId ? 'cust_' + Date.now().toString(36) + '_' + (cleanPhone || 'id') : generatedId;

  const now = new Date().toISOString();
  const additionalPhonesJson = formatAdditionalPhones(additional_phones);
  const customerBrand = String(brand || '').toUpperCase() === 'ORAANI' ? 'ORAANI' : 'AI925';

  db.prepare(`
    INSERT INTO customers (
      id, poc_name, company_name, phone, alternate_phone, additional_phones, gstin, email, address,
      pin_code, city, state, zone, notes, visiting_card_path, latitude, longitude, location_address,
      category, country, brand, created_by_id, rep_edit_count, is_archived, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
  `).run(
    id,
    poc_name.trim(),
    company_name.trim(),
    cleanPhone || phone || '',
    alternate_phone || null,
    additionalPhonesJson,
    gstin ? gstin.trim().toUpperCase() : null,
    email || '',
    address || '',
    pin_code || '',
    city || '',
    state || '',
    zone || 'West',
    notes || '',
    visiting_card_path ? ensureNamed(visiting_card_path, company_name.trim()) : null,
    latitude !== undefined && latitude !== null ? parseFloat(latitude) : null,
    longitude !== undefined && longitude !== null ? parseFloat(longitude) : null,
    location_address || null,
    category || 'Wholesaler',
    country || 'India',
    customerBrand,
    req.user.id,
    now,
    now
  );

  // Auto-assign new company to sales rep if added by sales rep
  if (isRep) {
    const asgnId = 'asgn_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    db.prepare(`
      INSERT OR IGNORE INTO rep_company_assignments (id, user_id, company_name, assigned_by_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(asgnId, req.user.id, company_name.trim(), req.user.id, now);
  } else if (assigned_rep_id && assigned_rep_id.trim()) {
    // Admin or Business Admin explicitly assigned to a representative
    // Check exclusivity: is company already assigned to someone else?
    const existingAssign = db.prepare(`
      SELECT rca.*, u.full_name as rep_name
      FROM rep_company_assignments rca
      JOIN users u ON rca.user_id = u.id
      WHERE LOWER(rca.company_name) = LOWER(?) AND rca.user_id != ?
    `).get(company_name.trim(), assigned_rep_id.trim());

    if (!existingAssign) {
      const asgnId = 'asgn_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
      db.prepare(`
        INSERT OR REPLACE INTO rep_company_assignments (id, user_id, company_name, assigned_by_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(asgnId, assigned_rep_id.trim(), company_name.trim(), req.user.id, now);
    }
  }

  const created = db.prepare(`
    SELECT c.*, c.created_by_id as created_by, u.full_name as creator_name 
    FROM customers c 
    LEFT JOIN users u ON c.created_by_id = u.id 
    WHERE c.id = ?
  `).get(id);

  logAudit(
    req.user.id,
    'CREATE_CUSTOMER',
    'customers',
    id,
    `Created customer: ${poc_name.trim()} (${company_name.trim()})`,
    req,
    null,
    created
  );

  res.status(201).json({ customer: created });
});

// PUT /api/customers/:id
// Admin: Can modify anytime
// Sales Rep: Can only modify once if added by them
router.put('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const {
    poc_name,
    company_name,
    phone,
    alternate_phone,
    additional_phones,
    gstin,
    email,
    address,
    pin_code,
    city,
    state,
    zone,
    notes,
    visiting_card_path,
    latitude,
    longitude,
    location_address,
    category,
    country,
    brand,
    assigned_rep_id
  } = req.body;

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const isRep = req.user.role === 'SALES_REP';

  // STRICT SECURITY CHECK: Sales Rep can only modify once if added
  if (isRep) {
    if (customer.created_by_id && customer.created_by_id !== req.user.id) {
      return res.status(403).json({
        error: 'Access denied: Sales representatives can only modify customers they added.'
      });
    }

    if ((customer.rep_edit_count || 0) >= 1) {
      return res.status(403).json({
        error: 'Access denied: Sales representatives are only allowed to modify a customer once after adding.'
      });
    }

    if (company_name && company_name.trim().toLowerCase() !== customer.company_name.toLowerCase()) {
      const isAssigned = db.prepare(`
        SELECT 1 FROM rep_company_assignments WHERE user_id = ? AND LOWER(company_name) = LOWER(?)
      `).get(req.user.id, company_name.trim());
      if (!isAssigned) {
        return res.status(403).json({
          error: `Access denied: You cannot change customer company to unassigned company "${company_name.trim()}".`
        });
      }
    }
  }

  if (phone !== undefined && phone !== customer.phone) {
    const cleanPhone = normalizePhone(phone);
    if (cleanPhone && cleanPhone.length === 10) {
      const clash = db.prepare(`
        SELECT id, poc_name, company_name FROM customers 
        WHERE (phone = ? OR REPLACE(REPLACE(phone, ' ', ''), '+91', '') = ?) AND id != ? AND is_archived = 0
      `).get(cleanPhone, cleanPhone, id);
      if (clash) {
        return res.status(400).json({
          error: `Another customer (${clash.poc_name}) already has mobile number ${cleanPhone}. Each customer must have a unique mobile number.`
        });
      }
    }
  }

  const now = new Date().toISOString();
  const nextRepEditCount = isRep ? ((customer.rep_edit_count || 0) + 1) : (customer.rep_edit_count || 0);
  const additionalPhonesJson = additional_phones !== undefined ? formatAdditionalPhones(additional_phones) : customer.additional_phones;

  db.prepare(`
    UPDATE customers SET
      poc_name = COALESCE(?, poc_name),
      company_name = COALESCE(?, company_name),
      phone = COALESCE(?, phone),
      alternate_phone = COALESCE(?, alternate_phone),
      additional_phones = ?,
      gstin = COALESCE(?, gstin),
      email = COALESCE(?, email),
      address = COALESCE(?, address),
      pin_code = COALESCE(?, pin_code),
      city = COALESCE(?, city),
      state = COALESCE(?, state),
      zone = COALESCE(?, zone),
      notes = COALESCE(?, notes),
      visiting_card_path = COALESCE(?, visiting_card_path),
      latitude = COALESCE(?, latitude),
      longitude = COALESCE(?, longitude),
      location_address = COALESCE(?, location_address),
      category = COALESCE(?, category),
      country = COALESCE(?, country),
      brand = COALESCE(?, brand),
      rep_edit_count = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    poc_name ? poc_name.trim() : null,
    company_name ? company_name.trim() : null,
    phone !== undefined ? phone : customer.phone,
    alternate_phone !== undefined ? alternate_phone : customer.alternate_phone,
    additionalPhonesJson,
    gstin !== undefined ? (gstin ? gstin.trim().toUpperCase() : null) : customer.gstin,
    email !== undefined ? email : customer.email,
    address !== undefined ? address : customer.address,
    pin_code !== undefined ? pin_code : customer.pin_code,
    city !== undefined ? city : customer.city,
    state !== undefined ? state : customer.state,
    zone !== undefined ? zone : customer.zone,
    notes !== undefined ? notes : customer.notes,
    (() => {
      const card = visiting_card_path !== undefined ? visiting_card_path : customer.visiting_card_path;
      return card ? ensureNamed(card, company_name ? company_name.trim() : customer.company_name) : card;
    })(),
    latitude !== undefined && latitude !== null ? parseFloat(latitude) : customer.latitude,
    longitude !== undefined && longitude !== null ? parseFloat(longitude) : customer.longitude,
    location_address !== undefined ? location_address : customer.location_address,
    category !== undefined ? category : customer.category,
    country !== undefined ? country : customer.country,
    brand !== undefined ? (String(brand).toUpperCase() === 'ORAANI' ? 'ORAANI' : 'AI925') : null,
    nextRepEditCount,
    now,
    id
  );

  // If Admin or Business Admin assigns or changes representative
  if (!isRep && assigned_rep_id !== undefined) {
    const finalCompName = company_name ? company_name.trim() : customer.company_name;
    if (assigned_rep_id && assigned_rep_id.trim()) {
      const existingAssign = db.prepare(`
        SELECT rca.*, u.full_name as rep_name
        FROM rep_company_assignments rca
        JOIN users u ON rca.user_id = u.id
        WHERE LOWER(rca.company_name) = LOWER(?) AND rca.user_id != ?
      `).get(finalCompName, assigned_rep_id.trim());

      if (!existingAssign) {
        const asgnId = 'asgn_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
        db.prepare(`
          INSERT OR REPLACE INTO rep_company_assignments (id, user_id, company_name, assigned_by_id, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(asgnId, assigned_rep_id.trim(), finalCompName, req.user.id, now);
      }
    }
  }

  const updated = db.prepare(`
    SELECT c.*, c.created_by_id as created_by, u.full_name as creator_name 
    FROM customers c 
    LEFT JOIN users u ON c.created_by_id = u.id 
    WHERE c.id = ?
  `).get(id);

  logAudit(
    req.user.id,
    'UPDATE_CUSTOMER',
    'customers',
    id,
    `Updated customer: ${poc_name || customer.poc_name} (${isRep ? 'Sales rep edit 1/1 applied' : 'Admin edit'})`,
    req,
    customer,
    updated
  );

  res.json({
    customer: updated,
    message: isRep 
      ? 'Customer updated successfully (Your 1 modification has been applied).'
      : 'Customer updated successfully.'
  });
});

// DELETE /api/customers/:id
// Admin: Permitted to delete completely. Removes portal accounts, approvals, order history, and frees phone number.
// Sales Rep: Strictly forbidden (403)
router.delete('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({
      error: 'Access denied: Only administrators can delete customers.'
    });
  }

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const cleanPhone = customer.phone ? normalizePhone(customer.phone) : '';

  db.transaction(() => {
    // 1. Delete all associated portal accounts and their child records
    const accounts = db.prepare(`
      SELECT id FROM customer_accounts 
      WHERE customer_id = ? 
         OR (phone != '' AND phone = ?)
         OR (phone != '' AND phone LIKE ?)
         OR (email != '' AND LOWER(email) = LOWER(?))
    `).all(id, customer.phone || '', cleanPhone ? `%${cleanPhone}` : '', customer.email || '');

    for (const acct of accounts) {
      db.prepare('DELETE FROM stock_requests WHERE customer_account_id = ?').run(acct.id);
      db.prepare('DELETE FROM call_bookings WHERE customer_account_id = ?').run(acct.id);
      db.prepare('DELETE FROM customer_change_requests WHERE customer_account_id = ?').run(acct.id);
      db.prepare('DELETE FROM customer_password_history WHERE customer_account_id = ?').run(acct.id);
      db.prepare('DELETE FROM customer_accounts WHERE id = ?').run(acct.id);
    }

    // 2. Clear customer orders and all related order records
    const orderIds = db.prepare('SELECT id FROM orders WHERE customer_id = ?').all(id).map(r => r.id);
    for (const ordId of orderIds) {
      db.prepare('DELETE FROM delivery_items WHERE delivery_id IN (SELECT id FROM deliveries WHERE order_id = ?)').run(ordId);
      db.prepare('DELETE FROM deliveries WHERE order_id = ?').run(ordId);
      db.prepare('DELETE FROM payments WHERE order_id = ?').run(ordId);
      db.prepare('DELETE FROM order_items WHERE order_id = ?').run(ordId);
    }
    db.prepare('DELETE FROM orders WHERE customer_id = ?').run(id);

    // 3. Delete customer record completely from customers table (and any duplicates matching this phone)
    db.prepare('DELETE FROM customers WHERE id = ?').run(id);
    if (cleanPhone) {
      db.prepare("DELETE FROM customers WHERE (phone = ? OR REPLACE(REPLACE(phone, ' ', ''), '+91', '') = ?)").run(cleanPhone, cleanPhone);
    }
  })();

  logAudit(
    req.user.id,
    'DELETE_CUSTOMER',
    'customers',
    id,
    `Completely deleted customer: ${customer.poc_name} (${customer.company_name}) and wiped portal history`,
    req,
    customer,
    null
  );

  res.json({
    success: true,
    message: `Customer "${customer.poc_name}" (${customer.company_name}) deleted completely. Mobile number is now available for new sign-up.`
  });
});

module.exports = router;
