// Whole Inventory: every ready stock row on one screen (chain → standard weight → size → pieces),
// with the total stock weight, and bulk edits of the piece counts. Both administrators only.
const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { authenticateToken, requireAdminOrBusinessAdmin, logAudit } = require('../middleware/auth');
const { round2, getVariants } = require('../utils/pricing');
const { newRowId } = require('../services/productTables');

router.use(authenticateToken, requireAdminOrBusinessAdmin);

const MAX_UPDATES = 1000;
const MAX_QTY = 1000000;
const round3 = n => round2(n * 1000) / 1000;
const pieceWeight = (std, size) => round3((std * size) / 20);
const same = (a, b) => Math.abs(a - b) < 0.001;

// Pieces a product without ready stock rows still tracks as one overall count
function legacyStock(product) {
  return Math.max(0, (product.physical_stock || 0) - (product.reserved_stock || 0));
}

// Ready stock rows of a product; one with no rows shows its overall count as a 20" row of its standard weight
function stockRows(product) {
  const variants = getVariants(product.id);
  if (variants.length > 0) {
    return variants.map(v => ({
      std_weight_g: v.std_weight_g,
      size_inches: v.size_inches,
      unit_weight_g: v.weight_g || pieceWeight(v.std_weight_g, v.size_inches),
      stock_qty: v.stock_qty
    }));
  }
  const legacy = legacyStock(product);
  if (legacy <= 0) return [];
  const std = product.std_weight_per_20in || 20;
  return [{ std_weight_g: std, size_inches: 20, unit_weight_g: pieceWeight(std, 20), stock_qty: legacy, derived: true }];
}

function inventoryPayload() {
  const products = db.prepare(`
    SELECT p.*, c.name as category_name
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.status != 'archived'
    ORDER BY p.name COLLATE NOCASE ASC
  `).all();

  let pieces = 0;
  let weight = 0;
  const chains = products.map(p => {
    const rows = stockRows(p);
    const chainPieces = rows.reduce((s, r) => s + r.stock_qty, 0);
    const chainWeight = rows.reduce((s, r) => s + r.unit_weight_g * r.stock_qty, 0);
    pieces += chainPieces;
    weight += chainWeight;
    return {
      product_id: p.id,
      name: p.name,
      sku: p.sku,
      category_name: p.category_name,
      status: p.status,
      rows,
      total_pieces: chainPieces,
      total_weight_g: round3(chainWeight)
    };
  });

  return { chains, totals: { pieces, weight_g: round3(weight) } };
}

// GET /api/inventory
router.get('/', (req, res) => {
  res.json(inventoryPayload());
});

// Validate [{ product_id, std_weight_g, size_inches, stock_qty }] (throws on bad input)
function parseUpdates(body) {
  const updates = body && body.updates;
  if (!Array.isArray(updates) || updates.length === 0) throw new Error('Nothing to update');
  if (updates.length > MAX_UPDATES) throw new Error(`Update at most ${MAX_UPDATES} rows at a time`);
  const seen = new Set();
  return updates.map(u => {
    const productId = String(u.product_id || '');
    const std = round3(parseFloat(u.std_weight_g));
    const size = parseFloat(u.size_inches);
    const qty = Number(u.stock_qty);
    if (!productId) throw new Error('Each row needs a product');
    if (!(std > 0)) throw new Error('Each row needs a standard weight');
    if (!(size >= 1 && size <= 60)) throw new Error('Sizes must be between 1 and 60 inches');
    if (!Number.isInteger(qty) || qty < 0 || qty > MAX_QTY) throw new Error(`Quantities must be whole numbers from 0 to ${MAX_QTY}`);
    const key = `${productId}|${std}|${size}`;
    if (seen.has(key)) throw new Error('The same row is listed twice');
    seen.add(key);
    return { productId, std, size, qty };
  });
}

// Set one ready stock row to an exact count; returns the change in pieces
function setRow(product, std, size, qty, now) {
  const rows = db.prepare('SELECT * FROM product_variants WHERE product_id = ?').all(product.id);
  if (rows.length === 0) {
    const legacy = legacyStock(product);
    if (legacy > 0) {
      const legacyStd = product.std_weight_per_20in || 20;
      db.prepare(`
        INSERT INTO product_variants (id, product_id, std_weight_g, size_inches, weight_g, stock_qty, created_at, updated_at)
        VALUES (?, ?, ?, 20, ?, ?, ?, ?)
      `).run(newRowId('var'), product.id, legacyStd, pieceWeight(legacyStd, 20), legacy, now, now);
    }
  }
  const row = db.prepare('SELECT * FROM product_variants WHERE product_id = ?').all(product.id)
    .find(r => same(r.std_weight_g, std) && same(r.size_inches, size));
  if (row) {
    if (row.stock_qty === qty) return 0;
    db.prepare('UPDATE product_variants SET stock_qty = ?, updated_at = ? WHERE id = ?').run(qty, now, row.id);
    return qty - row.stock_qty;
  }
  db.prepare(`
    INSERT INTO product_variants (id, product_id, std_weight_g, size_inches, weight_g, stock_qty, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(newRowId('var'), product.id, std, size, pieceWeight(std, size), qty, now, now);
  return qty;
}

// PUT /api/inventory { updates: [{ product_id, std_weight_g, size_inches, stock_qty }] } (sets exact piece counts)
router.put('/', (req, res) => {
  let updates;
  try {
    updates = parseUpdates(req.body);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const now = new Date().toISOString();
  const changes = [];
  try {
    db.transaction(() => {
      const byProduct = new Map();
      for (const u of updates) {
        if (!byProduct.has(u.productId)) byProduct.set(u.productId, []);
        byProduct.get(u.productId).push(u);
      }
      for (const [productId, list] of byProduct) {
        const product = db.prepare("SELECT * FROM products WHERE id = ? AND status != 'archived'").get(productId);
        if (!product) throw new Error('A product in this update no longer exists');
        const lines = [];
        for (const u of list) {
          const diff = setRow(product, u.std, u.size, u.qty, now);
          if (diff !== 0) lines.push(`${u.std} g × ${u.size}": ${diff > 0 ? '+' : ''}${diff} → ${u.qty} pcs`);
        }
        if (lines.length === 0) continue;
        const readyTotal = db.prepare('SELECT COALESCE(SUM(stock_qty), 0) as t FROM product_variants WHERE product_id = ?').get(product.id).t;
        const newPhysical = (product.reserved_stock || 0) + readyTotal;
        db.prepare('UPDATE products SET physical_stock = ?, updated_at = ? WHERE id = ?').run(newPhysical, now, product.id);
        db.prepare(`
          INSERT INTO inventory_movements (id, product_id, change_qty, movement_type, reason, user_id, created_at)
          VALUES (?, ?, ?, 'ADJUSTMENT', ?, ?, ?)
        `).run(newRowId('mov'), product.id, newPhysical - (product.physical_stock || 0),
          `Whole Inventory edit: ${lines.join('; ')}`.substring(0, 500), req.user.id, now);
        changes.push({ product, lines });
      }
    })();
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not update inventory' });
  }

  for (const c of changes) {
    logAudit(req.user.id, 'EDIT_WHOLE_INVENTORY', 'products', c.product.id, `${c.product.name}: ${c.lines.join('; ')}`, req);
  }
  const rowCount = changes.reduce((s, c) => s + c.lines.length, 0);
  res.json({
    ...inventoryPayload(),
    message: rowCount === 0 ? 'No quantities changed' : `Updated ${rowCount} stock row${rowCount === 1 ? '' : 's'}`
  });
});

module.exports = router;
