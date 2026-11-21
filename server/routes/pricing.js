const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const { db } = require('../db/database');
const { authenticateAny, authenticateToken, requireAdminOrBusinessAdmin, logAudit } = require('../middleware/auth');
const {
  GST_RATE,
  round2,
  getCurrentSilverRate,
  recordSilverRate,
  refreshSilverRate,
  setSetting
} = require('../utils/pricing');
const { getDeliveryRates, parseDeliveryRates, getPaymentTerms, parsePaymentTerms, setJson } = require('../services/commerce');

const uploadExcel = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/pricing/silver-rate (staff and approved customers)
router.get('/silver-rate', authenticateAny, (req, res) => {
  const history = db.prepare(`
    SELECT s.rate_per_gram, s.source, s.created_at, u.full_name as set_by_name
    FROM silver_rates s LEFT JOIN users u ON s.set_by_id = u.id
    ORDER BY s.created_at DESC LIMIT 15
  `).all();
  res.json({ silver_rate: getCurrentSilverRate(), gst_rate: GST_RATE, history });
});

// PUT /api/pricing/silver-rate { rate_per_gram } (manual override; switches to manual mode)
router.put('/silver-rate', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  const rate = parseFloat(req.body.rate_per_gram);
  if (!(rate > 0)) {
    return res.status(400).json({ error: 'Enter a silver rate per gram greater than zero' });
  }
  setSetting('silver_rate_mode', 'manual');
  const current = recordSilverRate({ rate, source: 'manual', userId: req.user.id });
  logAudit(req.user.id, 'SET_SILVER_RATE', 'silver_rates', null, `Silver rate set manually to Rs.${rate}/g`, req);
  res.json({ silver_rate: current, message: `Silver rate updated to ₹${current.rate_per_gram}/g for all products` });
});

// PUT /api/pricing/settings { mode: 'auto'|'manual', premium_pct }
router.put('/settings', authenticateToken, requireAdminOrBusinessAdmin, async (req, res) => {
  const { mode, premium_pct } = req.body;
  if (mode !== undefined && mode !== 'auto' && mode !== 'manual') {
    return res.status(400).json({ error: 'Mode must be auto or manual' });
  }
  if (premium_pct !== undefined) {
    const pct = parseFloat(premium_pct);
    if (isNaN(pct) || pct < -50 || pct > 100) {
      return res.status(400).json({ error: 'Market premium must be between -50% and 100%' });
    }
    setSetting('silver_premium_pct', pct);
  }
  if (mode) setSetting('silver_rate_mode', mode);

  let refresh = null;
  if ((mode || getCurrentSilverRate().mode) === 'auto') {
    refresh = await refreshSilverRate({ force: true });
  }
  logAudit(req.user.id, 'UPDATE_SILVER_RATE_SETTINGS', 'app_settings', null, JSON.stringify(req.body), req);
  res.json({ silver_rate: getCurrentSilverRate(), refresh_error: refresh && refresh.error ? refresh.error : null });
});

// POST /api/pricing/refresh (fetch the live rate now and resume automatic updates)
router.post('/refresh', authenticateToken, requireAdminOrBusinessAdmin, async (req, res) => {
  setSetting('silver_rate_mode', 'auto');
  const result = await refreshSilverRate({ force: true });
  if (result.error) {
    return res.status(502).json({ error: `Live rate unavailable: ${result.error}`, silver_rate: result.current });
  }
  res.json({ silver_rate: result.current, updated: result.updated });
});

// GET /api/pricing/commerce (delivery charges by PIN code and On Order payment terms)
router.get('/commerce', authenticateToken, (req, res) => {
  res.json({ delivery_rates: getDeliveryRates(), payment_terms: getPaymentTerms() });
});

// PUT /api/pricing/delivery-rates { rules: [{ prefix, label, charge }], zones, default_charge, free_above }
router.put('/delivery-rates', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  try {
    const rates = parseDeliveryRates(req.body || {});
    setJson('delivery_rates', rates);
    logAudit(req.user.id, 'UPDATE_DELIVERY_RATES', 'app_settings', null, `Delivery charges updated (${rates.rules.length} PIN rules)`, req);
    res.json({ delivery_rates: getDeliveryRates(), message: 'Delivery charges saved' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/pricing/payment-terms { advance_pct, full_payment_discount_pct }
router.put('/payment-terms', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  try {
    const terms = parsePaymentTerms(req.body || {});
    setJson('payment_terms', terms);
    logAudit(req.user.id, 'UPDATE_PAYMENT_TERMS', 'app_settings', null, JSON.stringify(terms), req);
    res.json({ payment_terms: getPaymentTerms(), message: 'Payment terms saved' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/pricing/state-premiums (staff & portal)
router.get('/state-premiums', authenticateAny, (req, res) => {
  const premiums = db.prepare('SELECT * FROM state_premiums ORDER BY state ASC').all();
  res.json({ state_premiums: premiums });
});

// POST /api/pricing/state-premiums { state, premium_pct, is_active } (Admin & Business Admin)
router.post('/state-premiums', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  const { state, premium_pct, is_active = 1 } = req.body;
  const stateClean = String(state || '').trim();
  const pct = parseFloat(premium_pct);

  if (!stateClean) {
    return res.status(400).json({ error: 'State name is required' });
  }
  if (isNaN(pct) || pct < 0 || pct > 1000) {
    return res.status(400).json({ error: 'Premium percentage must be between 0% and 1000%' });
  }

  const id = 'sprem_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO state_premiums (id, state, premium_pct, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(state) DO UPDATE SET
      premium_pct = excluded.premium_pct,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at
  `).run(id, stateClean, pct, is_active ? 1 : 0, now, now);

  logAudit(req.user.id, 'SET_STATE_PREMIUM', 'state_premiums', stateClean, `Set ${stateClean} premium to +${pct}%`, req);
  res.json({ success: true, message: `Premium of +${pct}% saved for ${stateClean}`, state_premiums: db.prepare('SELECT * FROM state_premiums ORDER BY state ASC').all() });
});

// DELETE /api/pricing/state-premiums/:id (Admin & Business Admin)
router.delete('/state-premiums/:id', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM state_premiums WHERE id = ? OR LOWER(state) = LOWER(?)').get(id, id);
  if (!existing) {
    return res.status(404).json({ error: 'State premium rule not found' });
  }
  db.prepare('DELETE FROM state_premiums WHERE id = ?').run(existing.id);
  logAudit(req.user.id, 'DELETE_STATE_PREMIUM', 'state_premiums', existing.id, `Removed state premium for ${existing.state}`, req);
  res.json({ success: true, message: `Removed premium rule for ${existing.state}`, state_premiums: db.prepare('SELECT * FROM state_premiums ORDER BY state ASC').all() });
});

// =========================================================================
// CUSTOM DELIVERY CHARGES BY PINCODE (Excel Upload, Download & Single Edit)
// =========================================================================

// GET /api/pricing/delivery-pincodes
router.get('/delivery-pincodes', authenticateAny, (req, res) => {
  const search = String(req.query.search || '').trim();
  let query = 'SELECT * FROM delivery_pincodes';
  const params = [];
  if (search) {
    query += ' WHERE pincode LIKE ? OR city LIKE ? OR state LIKE ?';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  query += ' ORDER BY pincode ASC LIMIT 500';
  const rows = db.prepare(query).all(...params);
  const countRow = db.prepare('SELECT COUNT(*) as total FROM delivery_pincodes').get();
  res.json({ delivery_pincodes: rows, total_count: countRow ? countRow.total : 0 });
});

// GET /api/pricing/delivery-pincodes/export (Download current Excel or CSV file)
router.get('/delivery-pincodes/export', authenticateToken, (req, res) => {
  const rows = db.prepare('SELECT pincode, charge, city, state, updated_at FROM delivery_pincodes ORDER BY pincode ASC').all();
  const format = req.query.format || 'xlsx';

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="delivery_charges.csv"');
    const header = 'Pincode,Delivery Charge (INR),City,State,Last Updated\n';
    const lines = rows.map(r => `"${r.pincode}",${r.charge},"${r.city || ''}","${r.state || ''}","${r.updated_at}"`).join('\n');
    return res.send(header + lines);
  }

  const exportData = rows.length > 0 ? rows.map(r => ({
    'Pincode': r.pincode,
    'Delivery Charge (INR)': r.charge,
    'City': r.city || '',
    'State': r.state || '',
    'Last Updated': r.updated_at
  })) : [
    { 'Pincode': '403001', 'Delivery Charge (INR)': 150, 'City': 'Panaji', 'State': 'Goa', 'Last Updated': new Date().toISOString() },
    { 'Pincode': '400001', 'Delivery Charge (INR)': 100, 'City': 'Mumbai', 'State': 'Maharashtra', 'Last Updated': new Date().toISOString() },
    { 'Pincode': '560001', 'Delivery Charge (INR)': 120, 'City': 'Bangalore', 'State': 'Karnataka', 'Last Updated': new Date().toISOString() }
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(exportData);
  XLSX.utils.book_append_sheet(wb, ws, 'Delivery Charges');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="delivery_charges.xlsx"');
  res.send(buffer);
});

// POST /api/pricing/delivery-pincodes/upload (Excel / CSV upload)
router.post('/delivery-pincodes/upload', authenticateToken, requireAdminOrBusinessAdmin, uploadExcel.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please select an Excel (.xlsx / .xls) or CSV file to upload' });
  }

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: 'The uploaded file contains no data rows' });
    }

    let updatedCount = 0;
    const now = new Date().toISOString();
    const insertStmt = db.prepare(`
      INSERT INTO delivery_pincodes (pincode, charge, city, state, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(pincode) DO UPDATE SET
        charge = excluded.charge,
        city = COALESCE(NULLIF(excluded.city, ''), delivery_pincodes.city),
        state = COALESCE(NULLIF(excluded.state, ''), delivery_pincodes.state),
        updated_at = excluded.updated_at
    `);

    db.transaction(() => {
      for (const row of rows) {
        const pinKey = Object.keys(row).find(k => /pincode|pin_code|pin|postal/i.test(k));
        const chargeKey = Object.keys(row).find(k => /charge|delivery_charge|delivery|rate|cost|fee|amount/i.test(k));
        const cityKey = Object.keys(row).find(k => /city|district/i.test(k));
        const stateKey = Object.keys(row).find(k => /state|region/i.test(k));

        if (!pinKey) continue;
        const rawPin = String(row[pinKey] || '').replace(/\D/g, '');
        if (rawPin.length !== 6) continue;

        const rawCharge = chargeKey ? parseFloat(row[chargeKey]) : 0;
        const charge = isNaN(rawCharge) || rawCharge < 0 ? 0 : round2(rawCharge);
        const city = cityKey ? String(row[cityKey] || '').trim() : '';
        const state = stateKey ? String(row[stateKey] || '').trim() : '';

        insertStmt.run(rawPin, charge, city, state, now);
        updatedCount++;
      }
    })();

    logAudit(req.user.id, 'UPLOAD_DELIVERY_PINCODES', 'delivery_pincodes', null, `Imported ${updatedCount} delivery pincodes from file`, req);
    res.json({
      success: true,
      message: `Successfully processed and updated ${updatedCount} pincodes from file.`,
      count: updatedCount
    });
  } catch (err) {
    res.status(400).json({ error: `Could not parse file: ${err.message}` });
  }
});

// POST /api/pricing/delivery-pincodes/single { pincode, charge, city, state }
router.post('/delivery-pincodes/single', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  const { pincode, charge, city = '', state = '' } = req.body;
  const pin = String(pincode || '').replace(/\D/g, '');
  if (pin.length !== 6) {
    return res.status(400).json({ error: 'Please enter a valid 6-digit Indian PIN code' });
  }
  const numCharge = parseFloat(charge);
  if (isNaN(numCharge) || numCharge < 0) {
    return res.status(400).json({ error: 'Delivery charge must be a non-negative number' });
  }

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO delivery_pincodes (pincode, charge, city, state, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(pincode) DO UPDATE SET
      charge = excluded.charge,
      city = COALESCE(NULLIF(excluded.city, ''), delivery_pincodes.city),
      state = COALESCE(NULLIF(excluded.state, ''), delivery_pincodes.state),
      updated_at = excluded.updated_at
  `).run(pin, round2(numCharge), String(city || '').trim(), String(state || '').trim(), now);

  logAudit(req.user.id, 'SET_DELIVERY_PINCODE', 'delivery_pincodes', pin, `Set delivery charge for ${pin} to Rs.${numCharge}`, req);
  res.json({ success: true, message: `Delivery charge of ₹${numCharge} saved for PIN ${pin}` });
});

// DELETE /api/pricing/delivery-pincodes/:pincode
router.delete('/delivery-pincodes/:pincode', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  const pin = String(req.params.pincode || '').replace(/\D/g, '');
  db.prepare('DELETE FROM delivery_pincodes WHERE pincode = ?').run(pin);
  logAudit(req.user.id, 'DELETE_DELIVERY_PINCODE', 'delivery_pincodes', pin, `Removed custom delivery charge for PIN ${pin}`, req);
  res.json({ success: true, message: `Removed custom delivery charge for PIN ${pin}` });
});

// =========================================================================
// WEIGHT SLAB DISCOUNTS (Discount on Labour Charges in Rs/g based on total kg)
// =========================================================================

// GET /api/pricing/weight-slab-discounts (staff & portal)
router.get('/weight-slab-discounts', authenticateAny, (req, res) => {
  const slabs = db.prepare('SELECT * FROM weight_slab_discounts ORDER BY min_kg ASC').all();
  res.json({ weight_slab_discounts: slabs });
});

// POST /api/pricing/weight-slab-discounts (Admin & Business Admin)
router.post('/weight-slab-discounts', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  const { min_kg, max_kg, discount_per_gram, is_active = 1 } = req.body;
  const min = parseFloat(min_kg);
  const max = max_kg === null || max_kg === undefined || max_kg === '' ? null : parseFloat(max_kg);
  const discount = parseFloat(discount_per_gram);

  if (isNaN(min) || min < 0) {
    return res.status(400).json({ error: 'Minimum weight must be 0 kg or more' });
  }
  if (max !== null && (isNaN(max) || max <= min)) {
    return res.status(400).json({ error: 'Maximum weight must be greater than minimum weight' });
  }
  if (isNaN(discount) || discount < 0) {
    return res.status(400).json({ error: 'Discount per gram must be 0 or more' });
  }

  const id = 'slab_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO weight_slab_discounts (id, min_kg, max_kg, discount_per_gram, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, min, max, round2(discount), is_active ? 1 : 0, now, now);

  logAudit(req.user.id, 'ADD_WEIGHT_SLAB_DISCOUNT', 'weight_slab_discounts', id, `Added discount slab: ${min}kg-${max || 'above'}: Rs.${discount}/g off labour`, req);
  res.json({
    success: true,
    message: `Added slab discount of ₹${discount}/g for ${min}kg to ${max ? max + 'kg' : 'above'}`,
    weight_slab_discounts: db.prepare('SELECT * FROM weight_slab_discounts ORDER BY min_kg ASC').all()
  });
});

// DELETE /api/pricing/weight-slab-discounts/:id (Admin & Business Admin)
router.delete('/weight-slab-discounts/:id', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM weight_slab_discounts WHERE id = ?').run(id);
  logAudit(req.user.id, 'DELETE_WEIGHT_SLAB_DISCOUNT', 'weight_slab_discounts', id, `Deleted discount slab ${id}`, req);
  res.json({
    success: true,
    message: 'Weight slab discount removed',
    weight_slab_discounts: db.prepare('SELECT * FROM weight_slab_discounts ORDER BY min_kg ASC').all()
  });
});

// =========================================================================
// CUSTOMIZABLE WEIGHT SLAB DELIVERY CHARGES (Shipping Rules by Net Weight)
// =========================================================================

// GET /api/pricing/delivery-weight-slabs (staff & portal)
router.get('/delivery-weight-slabs', authenticateAny, (req, res) => {
  const slabs = db.prepare('SELECT * FROM delivery_weight_slabs ORDER BY min_weight_g ASC').all();
  res.json({ delivery_weight_slabs: slabs });
});

// POST /api/pricing/delivery-weight-slabs (Admin & Business Admin)
router.post('/delivery-weight-slabs', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  const { min_weight_g, max_weight_g, shipping_charge, is_active = 1 } = req.body;
  const min = parseFloat(min_weight_g);
  const max = max_weight_g === null || max_weight_g === undefined || max_weight_g === '' ? null : parseFloat(max_weight_g);
  const charge = parseFloat(shipping_charge);

  if (isNaN(min) || min < 0) {
    return res.status(400).json({ error: 'Minimum weight must be 0 grams or more' });
  }
  if (max !== null && (isNaN(max) || max <= min)) {
    return res.status(400).json({ error: 'Maximum weight must be greater than minimum weight' });
  }
  if (isNaN(charge) || charge < 0) {
    return res.status(400).json({ error: 'Shipping charge must be 0 or more' });
  }

  const id = 'dws_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO delivery_weight_slabs (id, min_weight_g, max_weight_g, shipping_charge, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, min, max, round2(charge), is_active ? 1 : 0, now, now);

  logAudit(req.user.id, 'ADD_DELIVERY_WEIGHT_SLAB', 'delivery_weight_slabs', id, `Added delivery slab ${min}g-${max || 'above'}: Rs.${charge}`, req);
  res.json({
    success: true,
    message: `Saved delivery slab of ₹${charge} for ${min}g to ${max ? max + 'g' : 'above'}`,
    delivery_weight_slabs: db.prepare('SELECT * FROM delivery_weight_slabs ORDER BY min_weight_g ASC').all()
  });
});

// DELETE /api/pricing/delivery-weight-slabs/:id (Admin & Business Admin)
router.delete('/delivery-weight-slabs/:id', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM delivery_weight_slabs WHERE id = ?').run(id);
  logAudit(req.user.id, 'DELETE_DELIVERY_WEIGHT_SLAB', 'delivery_weight_slabs', id, `Deleted delivery weight slab ${id}`, req);
  res.json({
    success: true,
    message: 'Delivery weight slab removed',
    delivery_weight_slabs: db.prepare('SELECT * FROM delivery_weight_slabs ORDER BY min_weight_g ASC').all()
  });
});

module.exports = router;
