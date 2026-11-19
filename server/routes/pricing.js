const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { authenticateAny, authenticateToken, requireAdminOrBusinessAdmin, logAudit } = require('../middleware/auth');
const {
  GST_RATE,
  getCurrentSilverRate,
  recordSilverRate,
  refreshSilverRate,
  setSetting
} = require('../utils/pricing');
const { getDeliveryRates, parseDeliveryRates, getPaymentTerms, parsePaymentTerms, setJson } = require('../services/commerce');

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

module.exports = router;
