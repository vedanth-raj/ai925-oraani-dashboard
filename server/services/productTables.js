const { db } = require('../db/database');
const { round2 } = require('../utils/pricing');

// A product's three tables (standard weights, ready stock, order quantity slabs): validation and saving.
// Shared by the product form and the products CSV import.

// Validate ready stock rows [{ std_weight_g, size_inches, stock_qty }] (throws on bad input).
// The standard weight is per 20 inches, so a piece weighs std × size ÷ 20.
function parseVariants(variants) {
  if (!Array.isArray(variants)) return null;
  const seen = new Set();
  const rows = [];
  for (const v of variants) {
    const std = parseFloat(v.std_weight_g);
    const size = parseFloat(v.size_inches);
    const stock = parseInt(v.stock_qty, 10) || 0;
    if (!(std > 0)) throw new Error('Each ready stock row needs a standard weight (g)');
    if (!(size > 0)) throw new Error(`Enter the size (in) for the ${std} g ready stock row`);
    if (stock < 0) throw new Error(`Ready stock for ${std} g × ${size} in cannot be negative`);
    const weight = (std * size) / 20;
    const key = `${std.toFixed(3)}|${size.toFixed(2)}`;
    if (seen.has(key)) throw new Error(`${std} g × ${size} in is listed twice in ready stock`);
    seen.add(key);
    rows.push({ std_weight_g: round2(std * 1000) / 1000, size_inches: size, weight_g: round2(weight * 1000) / 1000, stock_qty: stock });
  }
  return rows.sort((a, b) => a.std_weight_g - b.std_weight_g || a.size_inches - b.size_inches);
}

const text = (v, max = 120) => String(v ?? '').trim().substring(0, max);

// Validate the custom column names on the standard weight table
function parseWeightColumns(columns) {
  if (!Array.isArray(columns)) return null;
  const seen = new Set();
  const out = [];
  for (const c of columns) {
    const name = text(c, 40);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

const TIER_UNITS = ['pcs', 'g', 'kg'];
const TIER_TYPES = ['READY_STOCK', 'ON_ORDER', 'ALL'];
const TYPE_LABEL = { READY_STOCK: 'Ready Stock', ON_ORDER: 'On Order', ALL: 'Both-type' };

// Validate standard weight options [{ std_weight_g, making_charge, weight_slabs, sku_code, wire_size, endings, lock_type, extra }]
function parseWeightOptions(options, columns) {
  if (!Array.isArray(options)) return null;
  const seen = new Set();
  return options.map((o, i) => {
    const std = parseFloat(o.std_weight_g);
    if (!(std > 0)) throw new Error('Each standard weight needs a weight in grams');
    const key = std.toFixed(3);
    if (seen.has(key)) throw new Error(`Standard weight ${std} g is listed twice`);
    seen.add(key);
    const slabs = parseWeightSlabRows(o.weight_slabs, std);
    // With slabs, the weight's base pricing is its first (smallest quantity) slab
    const making = slabs.length > 0
      ? slabs[0].making
      : o.making_charge === '' || o.making_charge === null || o.making_charge === undefined ? null : parseFloat(o.making_charge);
    if (making !== null && !(making >= 0)) throw new Error(`Pricing for ${std} g must be zero or more`);
    const extra = {};
    for (const col of columns || []) {
      const v = text(o.extra && o.extra[col]);
      if (v) extra[col] = v;
    }
    const rawThk = text(o.thickness, 60);
    const thk = rawThk ? (rawThk.includes('mm') ? rawThk : rawThk + ' mm') : (o.wire_size ? (String(o.wire_size).includes('mm') ? String(o.wire_size) : String(o.wire_size) + ' mm') : null);
    return {
      std_weight_g: round2(std * 1000) / 1000,
      making_charge: making === null ? null : round2(making),
      sku_code: text(o.sku_code, 60),
      wire_size: text(o.wire_size, 60),
      thickness: thk,
      endings: text(o.endings, 60),
      lock_type: text(o.lock_type, 60),
      extra,
      weight_slabs: slabs,
      sort_order: i
    };
  });
}

// Validate a standard weight's making charge slabs [{ min_g, max_g, making, order_type }] by net grams (throws on bad input)
function parseWeightSlabRows(slabs, std) {
  if (!Array.isArray(slabs)) return [];
  const rows = slabs.map(s => {
    const min = parseFloat(s.min_g);
    const max = s.max_g === '' || s.max_g === null || s.max_g === undefined ? null : parseFloat(s.max_g);
    const making = parseFloat(s.making);
    const type = TIER_TYPES.includes(s.order_type) ? s.order_type : 'ALL';
    if (!(min >= 0)) throw new Error(`Each slab of ${std} g needs a starting net quantity`);
    if (max !== null && !(max >= min)) throw new Error(`Slab ${min} g+ of ${std} g ends below its start`);
    if (!(making >= 0)) throw new Error(`Enter the making charge for the ${min} g+ slab of ${std} g`);
    return { min_g: round2(min * 1000) / 1000, max_g: max === null ? null : round2(max * 1000) / 1000, making: round2(making), order_type: type };
  }).sort((a, b) => a.min_g - b.min_g || a.order_type.localeCompare(b.order_type));
  // Slabs a purchase type uses (its own and 'Both') must not overlap
  for (const mode of ['READY_STOCK', 'ON_ORDER']) {
    const used = rows.filter(r => r.order_type === 'ALL' || r.order_type === mode);
    for (let i = 1; i < used.length; i++) {
      const prev = used[i - 1];
      if (prev.max_g === null || prev.max_g >= used[i].min_g) {
        throw new Error(`${TYPE_LABEL[mode]} slabs of ${std} g overlap: ${prev.min_g}-${prev.max_g ?? 'above'} g and ${used[i].min_g} g+`);
      }
    }
  }
  return rows;
}

// Validate order quantity slabs [{ min_qty, max_qty, qty_unit, price_per_gram, order_type }]: the making
// charge per gram for an order quantity range of one purchase type (throws on bad input)
function parseTiers(tiers) {
  if (!Array.isArray(tiers)) return null;
  const rows = tiers.map(t => {
    const unit = TIER_UNITS.includes(t.qty_unit) ? t.qty_unit : 'pcs';
    const type = TIER_TYPES.includes(t.order_type) ? t.order_type : 'ALL';
    const min = parseFloat(t.min_qty);
    const max = t.max_qty === '' || t.max_qty === null || t.max_qty === undefined ? null : parseFloat(t.max_qty);
    const price = parseFloat(t.price_per_gram);
    const disc = t.discount_price_per_gram === '' || t.discount_price_per_gram === null || t.discount_price_per_gram === undefined
      ? null
      : parseFloat(t.discount_price_per_gram);
    if (!(min >= 0)) throw new Error('Each order quantity slab needs a starting quantity');
    if (unit === 'pcs' && !Number.isInteger(min)) throw new Error('Piece quantities must be whole numbers');
    if (max !== null && !(max >= min)) throw new Error(`Slab ${min} ${unit}+ has an end quantity lower than its start`);
    if (!(price >= 0)) throw new Error(`Enter the making charge for the slab starting at ${min} ${unit}`);
    if (disc !== null && (!(disc >= 0) || disc > price)) throw new Error(`Discount price for slab ${min}+ must be between 0 and the price`);
    return {
      min_qty: min,
      max_qty: max,
      qty_unit: unit,
      order_type: type,
      price_per_gram: round2(price),
      discount_price_per_gram: disc === null ? null : round2(disc)
    };
  }).sort((a, b) => a.order_type.localeCompare(b.order_type) || a.qty_unit.localeCompare(b.qty_unit) || a.min_qty - b.min_qty);

  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const cur = rows[i];
    if (prev.order_type !== cur.order_type || prev.qty_unit !== cur.qty_unit) continue;
    if (prev.max_qty === null || prev.max_qty >= cur.min_qty) {
      throw new Error(`${TYPE_LABEL[cur.order_type]} slabs overlap: ${prev.min_qty}-${prev.max_qty ?? '∞'} ${cur.qty_unit} and ${cur.min_qty}+ ${cur.qty_unit}`);
    }
  }
  return rows;
}

const newRowId = prefix => prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);

// Replace a product's ready stock rows. Ready stock drives the product's available stock.
function saveVariants(productId, rows, userId) {
  const now = new Date().toISOString();
  db.prepare('DELETE FROM product_variants WHERE product_id = ?').run(productId);
  const insert = db.prepare(`
    INSERT INTO product_variants (id, product_id, std_weight_g, size_inches, weight_g, stock_qty, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of rows) {
    insert.run(newRowId('var'), productId, r.std_weight_g, r.size_inches, r.weight_g, r.stock_qty, now, now);
  }

  // No rows leaves overall stock alone (older products track stock without a ready stock window)
  if (rows.length === 0) return;
  const product = db.prepare('SELECT physical_stock, reserved_stock FROM products WHERE id = ?').get(productId);
  const readyTotal = rows.reduce((s, r) => s + r.stock_qty, 0);
  const newPhysical = (product.reserved_stock || 0) + readyTotal;
  if (newPhysical !== product.physical_stock) {
    db.prepare('UPDATE products SET physical_stock = ? WHERE id = ?').run(newPhysical, productId);
    db.prepare(`
      INSERT INTO inventory_movements (id, product_id, change_qty, movement_type, reason, user_id, created_at)
      VALUES (?, ?, ?, 'ADJUSTMENT', 'Ready stock updated', ?, ?)
    `).run('mov_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6), productId, newPhysical - product.physical_stock, userId, now);
  }
}

function saveWeightOptions(productId, rows) {
  const now = new Date().toISOString();
  db.prepare('DELETE FROM product_weight_options WHERE product_id = ?').run(productId);
  const insert = db.prepare(`
    INSERT INTO product_weight_options (id, product_id, std_weight_g, making_charge, sku_code, wire_size, endings, lock_type, extra, weight_slabs, sort_order, created_at, thickness)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of rows) {
    const raw = r.thickness ? String(r.thickness).trim() : '';
    const thk = raw ? (raw.includes('mm') ? raw : raw + ' mm') : (r.wire_size ? (r.wire_size.includes('mm') ? r.wire_size : r.wire_size + ' mm') : null);
    insert.run(newRowId('wopt'), productId, r.std_weight_g, r.making_charge, r.sku_code, r.wire_size, r.endings, r.lock_type,
      JSON.stringify(r.extra || {}), JSON.stringify(r.weight_slabs || []), r.sort_order, now, thk);
  }
}

function saveTiers(productId, rows) {
  const now = new Date().toISOString();
  db.prepare('DELETE FROM product_price_tiers WHERE product_id = ?').run(productId);
  const insert = db.prepare(`
    INSERT INTO product_price_tiers (id, product_id, min_qty, max_qty, price_per_gram, discount_price_per_gram, qty_unit, order_type, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of rows) {
    insert.run(newRowId('tier'), productId, r.min_qty, r.max_qty, r.price_per_gram, r.discount_price_per_gram, r.qty_unit, r.order_type, now);
  }
}

// The first standard weight also fills the product's summary fields used by lists, staff orders and exports
function summaryFromOptions(options) {
  const first = options && options[0];
  if (!first) return null;
  const priced = options.find(o => o.making_charge !== null);
  const rawThk = first.thickness ? String(first.thickness).trim() : '';
  const finalThk = rawThk ? (rawThk.includes('mm') ? rawThk : rawThk + ' mm') : (first.wire_size ? (first.wire_size.includes('mm') ? first.wire_size : first.wire_size + ' mm') : '2.0 mm');
  return {
    std_weight_per_20in: first.std_weight_g,
    labour_per_gram: priced ? priced.making_charge : null,
    wire_size: first.wire_size,
    thickness: finalThk,
    endings: first.endings,
    lock_type: first.lock_type || null
  };
}

// Parse the three product tables from a create/update body; null for any table not sent
function parseProductTables(body) {
  const columns = parseWeightColumns(body.weight_columns);
  const options = parseWeightOptions(body.weight_options, columns || []);
  if (options && options.length === 0) throw new Error('Add at least one standard weight');
  return {
    variantRows: parseVariants(body.variants),
    columns,
    options,
    tierRows: parseTiers(body.tiers)
  };
}

module.exports = {
  TIER_UNITS,
  TIER_TYPES,
  newRowId,
  parseProductTables,
  saveVariants,
  saveWeightOptions,
  saveTiers,
  summaryFromOptions
};
