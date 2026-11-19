const { db } = require('../db/database');

const GST_RATE = 0.03;
const GRAMS_PER_TROY_OUNCE = 31.1034768;

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)')
    .run(key, String(value), new Date().toISOString());
}

function getRateSettings() {
  return {
    mode: getSetting('silver_rate_mode', 'auto') === 'manual' ? 'manual' : 'auto',
    premium_pct: parseFloat(getSetting('silver_premium_pct', '0')) || 0,
    last_error: getSetting('silver_rate_last_error', null),
    last_checked_at: getSetting('silver_rate_last_checked_at', null)
  };
}

// Latest silver rate in force (null when none has ever been set or fetched)
function getCurrentSilverRate() {
  const row = db.prepare(`
    SELECT s.*, u.full_name as set_by_name
    FROM silver_rates s
    LEFT JOIN users u ON s.set_by_id = u.id
    ORDER BY s.created_at DESC LIMIT 1
  `).get();
  const settings = getRateSettings();
  if (!row) {
    return { rate_per_gram: null, source: null, updated_at: null, ...settings };
  }
  return {
    rate_per_gram: row.rate_per_gram,
    source: row.source,
    usd_per_oz: row.usd_per_oz,
    usd_inr: row.usd_inr,
    set_by_name: row.set_by_name || null,
    updated_at: row.created_at,
    ...settings
  };
}

function recordSilverRate({ rate, source, usdPerOz = null, usdInr = null, userId = null }) {
  const id = 'rate_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  db.prepare(`
    INSERT INTO silver_rates (id, rate_per_gram, source, usd_per_oz, usd_inr, set_by_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, round2(rate), source, usdPerOz, usdInr, userId, new Date().toISOString());
  return getCurrentSilverRate();
}

// Pull international spot silver (USD/oz) and USD->INR, convert to INR per gram plus market premium.
async function fetchLiveSilverRate() {
  const [metalRes, fxRes] = await Promise.all([
    fetch('https://api.gold-api.com/price/XAG', { signal: AbortSignal.timeout(10000) }),
    fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(10000) })
  ]);
  if (!metalRes.ok) throw new Error(`Silver price feed returned ${metalRes.status}`);
  if (!fxRes.ok) throw new Error(`Currency feed returned ${fxRes.status}`);
  const metal = await metalRes.json();
  const fx = await fxRes.json();
  const usdPerOz = parseFloat(metal.price);
  const usdInr = parseFloat(fx?.rates?.INR);
  if (!(usdPerOz > 0) || !(usdInr > 0)) throw new Error('Live feed returned an invalid silver or currency value');

  const { premium_pct } = getRateSettings();
  const rate = (usdPerOz * usdInr / GRAMS_PER_TROY_OUNCE) * (1 + premium_pct / 100);
  return { rate: round2(rate), usdPerOz, usdInr };
}

// Refresh from the live feed. In manual mode this is a no-op unless forced.
async function refreshSilverRate({ force = false } = {}) {
  const settings = getRateSettings();
  if (settings.mode === 'manual' && !force) {
    return { updated: false, reason: 'manual_mode', current: getCurrentSilverRate() };
  }
  setSetting('silver_rate_last_checked_at', new Date().toISOString());
  try {
    const live = await fetchLiveSilverRate();
    setSetting('silver_rate_last_error', '');
    const current = getCurrentSilverRate();
    if (current.rate_per_gram !== null && current.source === 'live' && round2(current.rate_per_gram) === live.rate) {
      return { updated: false, reason: 'unchanged', current };
    }
    const updated = recordSilverRate({ rate: live.rate, source: 'live', usdPerOz: live.usdPerOz, usdInr: live.usdInr });
    return { updated: true, current: updated };
  } catch (err) {
    setSetting('silver_rate_last_error', err.message || 'Live rate fetch failed');
    console.warn('[silver-rate] live refresh failed:', err.message);
    return { updated: false, reason: 'error', error: err.message, current: getCurrentSilverRate() };
  }
}

function startSilverRateScheduler(intervalMs = 60 * 60 * 1000) {
  refreshSilverRate().catch(() => {});
  const timer = setInterval(() => refreshSilverRate().catch(() => {}), intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}

function getVariants(productId) {
  return db.prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY std_weight_g ASC, size_inches ASC').all(productId);
}

function getTiers(productId) {
  return db.prepare('SELECT * FROM product_price_tiers WHERE product_id = ? ORDER BY order_type ASC, min_qty ASC').all(productId);
}

function getWeightOptions(productId) {
  return db.prepare('SELECT * FROM product_weight_options WHERE product_id = ? ORDER BY sort_order ASC, std_weight_g ASC').all(productId)
    .map(o => ({ ...o, extra: parseJsonObject(o.extra), weight_slabs: parseWeightSlabs(o.weight_slabs) }));
}

const SLAB_TYPES = ['READY_STOCK', 'ON_ORDER', 'ALL'];

// Making charge slabs of a standard weight: [{ min_g, max_g (null = & above), making, order_type }] sorted by
// min_g. order_type is the purchase type the slab applies to ('ALL' = both).
function parseWeightSlabs(raw) {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v)
      ? v.filter(s => s && Number(s.making) >= 0)
          .map(s => ({
            min_g: Number(s.min_g) || 0,
            max_g: s.max_g === null || s.max_g === undefined ? null : Number(s.max_g),
            making: Number(s.making),
            order_type: SLAB_TYPES.includes(s.order_type) ? s.order_type : 'ALL'
          }))
          .sort((a, b) => a.min_g - b.min_g)
      : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw) {
  try {
    const v = JSON.parse(raw || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

const sameNum = (a, b) => Math.abs(Number(a) - Number(b)) < 0.001;

// A product's photos in display order (the first is its cover, also kept in image_path)
function productImages(product) {
  try {
    const list = JSON.parse(product.image_paths || '[]');
    if (Array.isArray(list) && list.length > 0) return list.filter(p => typeof p === 'string' && p);
  } catch {
    // fall through to the single cover image
  }
  return product.image_path ? [product.image_path] : [];
}

// Weight of one piece. The standard weight is the weight of a 20-inch piece, so a piece weighs
// std × size ÷ 20 (3 g at 14" = 2.1 g). Without one (older staff orders), the first ready row for that size,
// else the product's 20-inch standard weight scaled to the size.
function unitWeightFor(product, variants, sizeInches, stdWeight = null) {
  const size = parseFloat(sizeInches) || 20;
  const std = parseFloat(stdWeight);
  if (std > 0) return (std * size) / 20;
  const variant = (variants || []).find(v => sameNum(v.size_inches, size));
  if (variant) return variant.weight_g;
  return (size / 20.0) * (product.std_weight_per_20in || 20.0);
}

// Base making charge per gram for a standard weight: that weight's "Pricing", else the product's labour charge
function baseMakingFor(product, weightOptions, stdWeight) {
  const opt = stdWeight ? (weightOptions || []).find(o => sameNum(o.std_weight_g, stdWeight)) : null;
  if (opt && opt.making_charge !== null && opt.making_charge !== undefined) return Number(opt.making_charge);
  return Number(product.labour_per_gram) || 0;
}

function tierMaking(tier) {
  return tier.discount_price_per_gram !== null && tier.discount_price_per_gram !== undefined
    ? Number(tier.discount_price_per_gram)
    : Number(tier.price_per_gram) || 0;
}

// Order quantity in a slab's unit: pieces, grams or kilograms of this product in the order
function qtyInUnit(unit, pieces, grams) {
  if (unit === 'g') return grams;
  if (unit === 'kg') return grams / 1000;
  return pieces;
}

// Slab for a purchase type ('READY_STOCK' | 'ON_ORDER'; staff orders are priced as On Order): the type's
// own slabs when it has any, else the slabs written for both types
function pickTier(tiers, mode, pieces, grams) {
  const type = mode === 'READY_STOCK' ? 'READY_STOCK' : 'ON_ORDER';
  const list = tiers || [];
  const own = list.filter(t => t.order_type === type);
  const usable = own.length > 0 ? own : list.filter(t => !t.order_type || t.order_type === 'ALL');
  return usable.find(t => {
    const q = qtyInUnit(t.qty_unit || 'pcs', pieces, grams);
    return q >= t.min_qty && (t.max_qty === null || t.max_qty === undefined || q <= t.max_qty);
  }) || null;
}

// Slab for the net grams of one standard weight in an order of one purchase type (staff orders count as On
// Order). Ranges run up to their end weight, so a weight between two slabs (100.5 g between 1-100 and 101-500)
// takes the next one; below the first slab, the first.
function pickWeightSlab(slabs, grams, mode) {
  const type = mode === 'READY_STOCK' ? 'READY_STOCK' : 'ON_ORDER';
  const list = (slabs || []).filter(s => !s.order_type || s.order_type === 'ALL' || s.order_type === type);
  if (list.length === 0) return null;
  return list.find(s => s.max_g === null || grams <= s.max_g + 1e-9) || list[list.length - 1];
}

// State-wise premium pricing lookup (e.g., Goa +100% / 2x multiplier)
function getStatePremium(stateName) {
  if (!stateName) return 0;
  try {
    const row = db.prepare('SELECT premium_pct FROM state_premiums WHERE LOWER(state) = LOWER(?) AND is_active = 1').get(String(stateName).trim());
    return row ? parseFloat(row.premium_pct) || 0 : 0;
  } catch {
    return 0;
  }
}

function getAllStatePremiums() {
  try {
    return db.prepare('SELECT * FROM state_premiums ORDER BY state ASC').all();
  } catch {
    return [];
  }
}

// Making charge per gram for one standard weight. A weight with its own slabs is priced by the net grams of
// that weight in the order (`stdGrams`); otherwise by the product's quantity slab for its total pieces / grams.
// `mrp_per_gram` is that weight's base making charge, before any slab.
// If statePremiumPct is provided, making charges are adjusted accordingly.
function makingFor({ product, tiers, weightOptions, stdWeight, mode, pieces, grams, stdGrams = 0, statePremiumPct = 0 }) {
  const baseRaw = baseMakingFor(product, weightOptions, stdWeight);
  const multiplier = 1 + (Number(statePremiumPct) || 0) / 100;
  const base = round2(baseRaw * multiplier);
  const opt = stdWeight ? (weightOptions || []).find(o => sameNum(o.std_weight_g, stdWeight)) : null;
  const weightSlab = opt ? pickWeightSlab(opt.weight_slabs, stdGrams, mode) : null;
  if (weightSlab) {
    const scaledMaking = round2(weightSlab.making * multiplier);
    return { labour_per_gram: scaledMaking, mrp_per_gram: base, tier: null, weight_slab: { ...weightSlab, making: scaledMaking } };
  }
  const tier = pickTier(tiers, mode, pieces, grams);
  const tierLabour = tier ? round2(tierMaking(tier) * multiplier) : base;
  return { labour_per_gram: tierLabour, mrp_per_gram: base, tier, weight_slab: null };
}

// Smallest net silver weight a customer order can be placed for, per purchase type
const MIN_ORDER_GRAMS = { READY_STOCK: 100, ON_ORDER: 500 };

// Silver per gram + labour per gram, then 3% GST on the whole.
function priceBreakdown(weightG, silverRate, labourPerGram, statePremiumPct = 0) {
  const multiplier = 1 + (Number(statePremiumPct) || 0) / 100;
  const effectiveSilverRate = round2((Number(silverRate) || 0) * multiplier);
  const effectiveLabour = round2((Number(labourPerGram) || 0));
  const silver = round2(effectiveSilverRate * weightG);
  const labour = round2(effectiveLabour * weightG);
  const subtotal = round2(silver + labour);
  const gst = round2(subtotal * GST_RATE);
  return {
    weight_g: round2(weightG * 1000) / 1000,
    silver_amount: silver,
    labour_amount: labour,
    subtotal,
    gst_amount: gst,
    total: round2(subtotal + gst)
  };
}

// Discount of a slab on the full per-gram rate (silver + base making), like an MRP discount
function slabDiscountPct(silverRate, baseMaking, slabMaking) {
  const full = (Number(silverRate) || 0) + baseMaking;
  return full > 0 ? Math.max(0, round2(((baseMaking - slabMaking) / full) * 100)) : 0;
}

// Live pricing summary attached to product payloads
function productPricing(product, silverRate, variants, tiers) {
  const rate = Number(silverRate) || 0;
  const base = Number(product.labour_per_gram) || 0;
  const perGram = round2((rate + base) * (1 + GST_RATE));
  const stdWeight = (variants && variants.length > 0)
    ? (variants.find(v => Math.abs(v.size_inches - 20) < 0.001) || variants[0]).weight_g
    : product.std_weight_per_20in || 20;
  const slabs = (tiers || []).map(t => ({ ...t, discount_pct: slabDiscountPct(rate, base, tierMaking(t)) }));
  return {
    silver_rate: silverRate,
    labour_per_gram: base,
    gst_rate: GST_RATE,
    price_per_gram: perGram,
    reference_weight_g: stdWeight,
    reference_piece_price: round2(perGram * stdWeight),
    slabs
  };
}

module.exports = {
  GST_RATE,
  MIN_ORDER_GRAMS,
  round2,
  getSetting,
  setSetting,
  getRateSettings,
  getCurrentSilverRate,
  recordSilverRate,
  refreshSilverRate,
  startSilverRateScheduler,
  getVariants,
  getTiers,
  getWeightOptions,
  productImages,
  unitWeightFor,
  baseMakingFor,
  tierMaking,
  pickTier,
  pickWeightSlab,
  makingFor,
  slabDiscountPct,
  priceBreakdown,
  productPricing,
  getStatePremium,
  getAllStatePremiums
};
