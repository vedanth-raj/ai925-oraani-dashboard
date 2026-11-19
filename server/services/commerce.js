// Shop-wide settings kept in app_settings: delivery charges by PIN code, On Order payment terms and the
// dropdown lists used by the product form (lock types, wire sizes, endings).
const { db } = require('../db/database');
const { round2, getSetting, setSetting } = require('../utils/pricing');

function getJson(key, fallback) {
  try {
    const raw = getSetting(key, null);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function setJson(key, value) {
  setSetting(key, JSON.stringify(value));
}

// ---------- Delivery charges ----------
// rules: PIN prefix -> charge (the longest matching prefix wins, so "400001" beats "400" beats "4")
// zones: North / South / East / West -> charge (blank = not set), used when no prefix matches
// default_charge: everything else; free_above: order value (before delivery) that ships free
const ZONES = ['North', 'South', 'East', 'West'];
const DEFAULT_DELIVERY = { rules: [], zones: { North: null, South: null, East: null, West: null }, default_charge: 0, free_above: null };

function getDeliveryRates() {
  const saved = getJson('delivery_rates', {});
  return {
    rules: Array.isArray(saved.rules) ? saved.rules : [],
    zones: { ...DEFAULT_DELIVERY.zones, ...(saved.zones || {}) },
    default_charge: Number(saved.default_charge) || 0,
    free_above: saved.free_above === null || saved.free_above === undefined || saved.free_above === '' ? null : Number(saved.free_above)
  };
}

function parseDeliveryRates(body) {
  const num = (v, label) => {
    const n = v === '' || v === null || v === undefined ? 0 : parseFloat(v);
    if (!(n >= 0)) throw new Error(`${label} must be zero or more`);
    return round2(n);
  };
  const seen = new Set();
  const rules = (Array.isArray(body.rules) ? body.rules : []).map(r => {
    const prefix = String(r.prefix || '').replace(/\D/g, '');
    if (!prefix || prefix.length > 6) throw new Error('Each PIN rule needs 1 to 6 digits of a PIN code');
    if (seen.has(prefix)) throw new Error(`PIN ${prefix} is listed twice`);
    seen.add(prefix);
    return { prefix, label: String(r.label || '').trim().substring(0, 60), charge: num(r.charge, `Charge for PIN ${prefix}`) };
  });
  const zones = {};
  for (const z of ZONES) {
    const v = body.zones && body.zones[z];
    zones[z] = v === '' || v === null || v === undefined ? null : num(v, `${z} zone charge`);
  }
  const freeAbove = body.free_above === '' || body.free_above === null || body.free_above === undefined ? null : num(body.free_above, 'Free delivery limit');
  return { rules, zones, default_charge: num(body.default_charge, 'Default charge'), free_above: freeAbove };
}

// PIN code of a portal customer: their account, else the linked customer record, else a 6-digit number in the address
function customerPin(account, customer) {
  const candidates = [account && account.pin_code, customer && customer.pin_code];
  for (const c of candidates) {
    const digits = String(c || '').replace(/\D/g, '');
    if (digits.length === 6) return digits;
  }
  const match = String((account && account.address) || (customer && customer.address) || '').match(/\b\d{6}\b/);
  return match ? match[0] : null;
}

function deliveryChargeFor({ pin, zone, orderValue }) {
  const rates = getDeliveryRates();
  if (rates.free_above !== null && orderValue >= rates.free_above) {
    return { charge: 0, basis: `Free above ₹${rates.free_above}`, pin };
  }
  if (pin) {
    try {
      const custom = db.prepare('SELECT charge, city, state FROM delivery_pincodes WHERE pincode = ?').get(String(pin).trim());
      if (custom) {
        return { charge: parseFloat(custom.charge) || 0, basis: `Pincode ${pin} charge`, pin };
      }
    } catch {}
    const rule = rates.rules
      .filter(r => pin.startsWith(r.prefix))
      .sort((a, b) => b.prefix.length - a.prefix.length)[0];
    if (rule) return { charge: rule.charge, basis: rule.label || `PIN ${rule.prefix}…`, pin };
  }
  if (zone && rates.zones[zone] !== null && rates.zones[zone] !== undefined) {
    return { charge: rates.zones[zone], basis: `${zone} zone`, pin };
  }
  return { charge: rates.default_charge, basis: 'Standard delivery', pin };
}

// ---------- On Order payment terms ----------
function getPaymentTerms() {
  const saved = getJson('payment_terms', {});
  return {
    advance_pct: saved.advance_pct === undefined ? 20 : Number(saved.advance_pct),
    full_payment_discount_pct: saved.full_payment_discount_pct === undefined ? 0.025 : Number(saved.full_payment_discount_pct)
  };
}

function parsePaymentTerms(body) {
  const advance = parseFloat(body.advance_pct);
  const discount = parseFloat(body.full_payment_discount_pct);
  if (!(advance > 0 && advance <= 100)) throw new Error('Advance must be between 0 and 100%');
  if (!(discount >= 0 && discount < 100)) throw new Error('Full payment discount must be between 0 and 100%');
  return { advance_pct: round2(advance), full_payment_discount_pct: Math.round(discount * 10000) / 10000 };
}

// ---------- Product form dropdown lists ----------
const OPTION_FIELDS = ['lock_type', 'wire_size', 'endings'];
const DEFAULT_LOCKS = ['Fish Lock', 'Spring Lock', 'Lobster', 'Box Lock'];

// Saved lists, plus every value already used on a product so nothing typed earlier goes missing
function getOptionLists() {
  const saved = getJson('product_option_lists', {});
  const lists = {};
  for (const field of OPTION_FIELDS) {
    const used = db.prepare(`
      SELECT DISTINCT TRIM(${field}) as v FROM product_weight_options WHERE TRIM(COALESCE(${field}, '')) != ''
      UNION SELECT DISTINCT TRIM(${field}) as v FROM products WHERE TRIM(COALESCE(${field}, '')) != ''
    `).all().map(r => r.v);
    const base = Array.isArray(saved[field]) ? saved[field] : field === 'lock_type' ? DEFAULT_LOCKS : [];
    const all = [];
    for (const v of [...base, ...used]) {
      if (v && !all.some(x => x.toLowerCase() === v.toLowerCase())) all.push(v);
    }
    lists[field] = all;
  }
  return lists;
}

function addOption(field, value) {
  if (!OPTION_FIELDS.includes(field)) throw new Error('Unknown option list');
  const v = String(value || '').trim().substring(0, 60);
  if (!v) throw new Error('Enter a value to add');
  const saved = getJson('product_option_lists', {});
  const list = Array.isArray(saved[field]) ? saved[field] : field === 'lock_type' ? [...DEFAULT_LOCKS] : [];
  if (!list.some(x => x.toLowerCase() === v.toLowerCase())) list.push(v);
  setJson('product_option_lists', { ...saved, [field]: list });
  return getOptionLists();
}

module.exports = {
  ZONES,
  getDeliveryRates,
  parseDeliveryRates,
  customerPin,
  deliveryChargeFor,
  getPaymentTerms,
  parsePaymentTerms,
  getOptionLists,
  addOption,
  setJson,
  OPTION_FIELDS
};
