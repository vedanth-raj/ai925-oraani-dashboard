const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { db } = require('../db/database');
const { authenticateToken, requireAdmin, requireAdminOrBusinessAdmin, logAudit } = require('../middleware/auth');
const { uploadsSubdir, storeUploadedFile, ensureNamed, removeUpload, imageFileFilter, absFromRel, relFromAbs, uniqueFilePath, safeBaseName } = require('../utils/files');
const {
  round2,
  getCurrentSilverRate,
  getVariants,
  getTiers,
  getWeightOptions,
  productImages,
  productPricing
} = require('../utils/pricing');
const { getOptionLists, addOption } = require('../services/commerce');
const { newRowId, parseProductTables, saveVariants, saveWeightOptions, saveTiers, summaryFromOptions } = require('../services/productTables');

const PRODUCTS_DIR = uploadsSubdir('products');

// Files land under a temporary name; the handler renames them after the product once all fields are parsed
const uploadProductImg = multer({
  dest: PRODUCTS_DIR,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFileFilter('products')
});

// POST /api/products/upload-image (Upload square product image, saved as "<SKU code>.jpg")
router.post(
  '/upload-image',
  authenticateToken,
  requireAdminOrBusinessAdmin,
  uploadProductImg.fields([{ name: 'image', maxCount: 1 }, { name: 'product_image', maxCount: 1 }]),
  (req, res) => {
    const file = (req.files?.image || req.files?.product_image || [])[0];
    if (!file) {
      return res.status(400).json({ error: 'Please select an image file to upload' });
    }

    const relativePath = storeUploadedFile(file, PRODUCTS_DIR, req.body.sku || req.body.name || 'product');
    res.json({
      success: true,
      file_path: relativePath,
      filename: relativePath.split('/').pop()
    });
  }
);

function stripRepFields(product, isRep) {
  if (isRep) {
    delete product.wire_size;
    delete product.endings;
  }
}

function weightColumns(product) {
  try {
    const cols = JSON.parse(product.weight_columns || '[]');
    return Array.isArray(cols) ? cols.filter(c => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

function weightOptionsFor(productId, isRep) {
  return getWeightOptions(productId).map(o => {
    if (isRep) {
      delete o.wire_size;
      delete o.endings;
    }
    return o;
  });
}

// GET /api/products
router.get('/', authenticateToken, (req, res) => {
  const { search, category, status, order_status } = req.query;
  const isRep = req.user.role === 'SALES_REP';

  let orderJoin = 'LEFT JOIN orders o ON oi.order_id = o.id';
  const params = [];

  if (isRep) {
    orderJoin += ' AND (o.creator_id = ? OR o.sales_rep_id = ?)';
    params.push(req.user.id, req.user.id);
  }

  let query = `
    SELECT
      p.*,
      c.name as category_name,
      COALESCE(COUNT(DISTINCT oi.order_id), 0) as total_orders_count,
      COALESCE(SUM(oi.requested_pieces), 0) as total_ordered_pieces,
      COALESCE(SUM(oi.delivered_pieces), 0) as total_delivered_pieces,
      COALESCE(SUM(oi.requested_pieces - oi.delivered_pieces), 0) as total_outstanding_pieces,
      COALESCE(SUM(oi.expected_weight), 0) as total_expected_weight,
      COALESCE(SUM(oi.delivered_weight), 0) as total_delivered_weight,
      COALESCE(SUM(CASE WHEN o.status = 'OPEN' THEN 1 ELSE 0 END), 0) as open_orders_count,
      COALESCE(SUM(CASE WHEN o.status = 'IN_PROGRESS' THEN 1 ELSE 0 END), 0) as in_progress_orders_count
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN order_items oi ON oi.product_id = p.id
    ${orderJoin}
    WHERE p.status != 'archived'
  `;

  if (search) {
    query += ` AND (p.name LIKE ? OR p.sku LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }

  if (category && category !== 'All') {
    query += ` AND (c.name = ? OR p.category_id = ?)`;
    params.push(category, category);
  }

  if (status && status !== 'All') {
    query += ` AND LOWER(p.status) = LOWER(?)`;
    params.push(status);
  }

  if (order_status && order_status !== 'Any') {
    query += ` AND o.status = ?`;
    params.push(order_status);
  }

  query += ` GROUP BY p.id ORDER BY p.name ASC`;

  const products = db.prepare(query).all(...params);
  const rate = getCurrentSilverRate();

  for (const p of products) {
    stripRepFields(p, isRep);
    const variants = getVariants(p.id);
    p.variants = variants;
    p.weight_options = weightOptionsFor(p.id, isRep);
    p.ready_stock = variants.reduce((s, v) => s + (v.stock_qty || 0), 0);
    p.pricing = productPricing(p, rate.rate_per_gram, variants, getTiers(p.id));
  }

  res.json({ products, silver_rate: rate });
});

// GET /api/products/meta/options (dropdown lists for the product form: lock types, wire sizes, endings)
router.get('/meta/options', authenticateToken, (req, res) => {
  res.json({ options: getOptionLists() });
});

// POST /api/products/meta/options { field: 'lock_type' | 'wire_size' | 'endings', value } (both administrators)
router.post('/meta/options', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  try {
    const options = addOption(req.body.field, req.body.value);
    logAudit(req.user.id, 'ADD_PRODUCT_OPTION', 'app_settings', null, `Added ${req.body.field} option "${String(req.body.value).trim()}"`, req);
    res.status(201).json({ options });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/products/:id (Matching Product Details Images 15, 16)
router.get('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const product = db.prepare(`
    SELECT p.*, c.name as category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.id = ?
  `).get(id);

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const isRep = req.user.role === 'SALES_REP';
  stripRepFields(product, isRep);

  // Calculate detailed summary KPIs with strict role isolation
  let kpiQuery = `
    SELECT
      COUNT(DISTINCT oi.order_id) as total_orders,
      COUNT(DISTINCT o.customer_id) as unique_customers,
      COALESCE(SUM(oi.requested_pieces), 0) as total_ordered_pieces,
      COALESCE(SUM(oi.delivered_pieces), 0) as total_delivered_pieces,
      COALESCE(SUM(oi.requested_pieces - oi.delivered_pieces), 0) as total_remaining_pieces,
      COALESCE(SUM(oi.expected_weight), 0.0) as total_expected_weight,
      COALESCE(SUM(oi.delivered_weight), 0.0) as total_delivered_weight
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE oi.product_id = ?
  `;
  const kpiParams = [id];

  if (isRep) {
    kpiQuery += ` AND (o.creator_id = ? OR o.sales_rep_id = ?)`;
    kpiParams.push(req.user.id, req.user.id);
  }

  const kpis = db.prepare(kpiQuery).get(...kpiParams);

  // Remaining estimated weight: if std weight per 20 in is known
  const remainingEstWeight = Math.max(0, (kpis.total_expected_weight || 0) - (kpis.total_delivered_weight || 0));

  // Order history for this product (Strictly isolated: Reps only see their own customer orders)
  let historyQuery = `
    SELECT
      o.id as order_id,
      o.order_number,
      o.order_date,
      o.status,
      c.company_name,
      c.poc_name,
      c.phone as customer_phone,
      c.city as customer_city,
      c.zone as customer_zone,
      oi.size_inches,
      oi.requested_pieces,
      oi.delivered_pieces,
      (oi.requested_pieces - oi.delivered_pieces) as remaining_pieces,
      oi.expected_weight,
      oi.delivered_weight as actual_delivered_weight,
      (SELECT MAX(delivery_date) FROM deliveries WHERE order_id = o.id) as last_delivery_date
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN customers c ON o.customer_id = c.id
    WHERE oi.product_id = ?
  `;
  const historyParams = [id];

  if (isRep) {
    historyQuery += ` AND (o.creator_id = ? OR o.sales_rep_id = ?)`;
    historyParams.push(req.user.id, req.user.id);
  }

  historyQuery += ` ORDER BY o.order_date DESC, o.order_number DESC`;
  const history = db.prepare(historyQuery).all(...historyParams);

  const rate = getCurrentSilverRate();
  const variants = getVariants(id);
  const tiers = getTiers(id);

  res.json({
    product: { ...product, image_paths: productImages(product) },
    variants,
    tiers,
    weight_options: weightOptionsFor(id, isRep),
    weight_columns: weightColumns(product),
    pricing: productPricing(product, rate.rate_per_gram, variants, tiers),
    silver_rate: rate,
    kpis: {
      orders_count: kpis.total_orders,
      customers_count: kpis.unique_customers,
      ordered_pieces: kpis.total_ordered_pieces,
      expected_weight: kpis.total_expected_weight,
      delivered_pieces: kpis.total_delivered_pieces,
      delivered_weight: kpis.total_delivered_weight,
      remaining_pieces: kpis.total_remaining_pieces,
      remaining_est_weight: remainingEstWeight
    },
    history
  });
});

const MAX_PRODUCT_IMAGES = 10;

// Photos sent with a product: uploaded product images only, in order, without repeats (null when not sent).
// A legacy single `image_path` stands for a one-photo list.
function sentImages(body) {
  if (Array.isArray(body.image_paths)) {
    const seen = new Set();
    return body.image_paths
      .filter(p => typeof p === 'string' && p.startsWith('/uploads/products/') && !seen.has(p) && seen.add(p))
      .slice(0, MAX_PRODUCT_IMAGES);
  }
  if (body.image_path !== undefined) return body.image_path ? [body.image_path] : [];
  return null;
}

// Name each photo after the SKU ("CH018.jpg", "CH018-1.jpg", ...); returns the stored paths
const nameImages = (list, sku) => list.map(p => ensureNamed(p, sku));

function productPayload(id) {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  const variants = getVariants(id);
  const tiers = getTiers(id);
  return {
    product: { ...product, image_paths: productImages(product) },
    variants,
    tiers,
    weight_options: getWeightOptions(id),
    weight_columns: weightColumns(product),
    pricing: productPricing(product, getCurrentSilverRate().rate_per_gram, variants, tiers)
  };
}

// POST /api/products (System Admin & Business Admin)
router.post('/', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  const {
    name,
    sku,
    category_id,
    wire_size,
    thickness,
    endings,
    lock_type,
    std_weight_per_20in,
    description,
    status,
    physical_stock,
    reorder_threshold,
    image_path,
    labour_per_gram,
    variants,
    tiers
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Product name is required' });
  }

  if (!sku || !sku.trim()) {
    return res.status(400).json({ error: 'SKU is required' });
  }

  const existingSku = db.prepare('SELECT id FROM products WHERE LOWER(sku) = LOWER(?)').get(sku.trim());
  if (existingSku) {
    return res.status(400).json({ error: 'A product with this SKU already exists' });
  }

  let tables;
  try {
    tables = parseProductTables(req.body);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const variantRows = tables.variantRows || [];
  const summary = summaryFromOptions(tables.options) || {};

  const id = 'prod_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  const now = new Date().toISOString();
  const weight = summary.std_weight_per_20in || parseFloat(std_weight_per_20in) || 20.0;
  const initialStock = Array.isArray(variants)
    ? variantRows.reduce((s, r) => s + r.stock_qty, 0)
    : (parseInt(physical_stock, 10) || 500);
  const labour = Math.max(0, summary.labour_per_gram ?? (parseFloat(labour_per_gram) || 0));
  const storedImages = nameImages(sentImages(req.body) || [], sku.trim());
  const storedImage = storedImages[0] || null;

  try {
    db.transaction(() => {
      db.prepare(`
        INSERT INTO products (
          id, name, sku, category_id, description, wire_size, endings, lock_type,
          std_weight_per_20in, physical_stock, reserved_stock, reorder_threshold, status,
          image_path, created_at, updated_at, labour_per_gram, weight_columns, image_paths, thickness
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        name.trim(),
        sku.trim(),
        category_id || null,
        description || '',
        summary.wire_size ?? (wire_size || ''),
        summary.endings ?? (endings || ''),
        summary.lock_type || lock_type || 'Fish Lock',
        weight,
        initialStock,
        parseInt(reorder_threshold, 10) || 50,
        status || 'active',
        storedImage,
        now,
        now,
        labour,
        JSON.stringify(tables.columns || []),
        JSON.stringify(storedImages),
        summary.thickness ?? (thickness ? (String(thickness).includes('mm') ? String(thickness).trim() : String(thickness).trim() + ' mm') : '2.0 mm')
      );

      // Log initial stock intake in inventory movement ledger
      db.prepare(`
        INSERT INTO inventory_movements (id, product_id, change_qty, movement_type, reason, user_id, created_at)
        VALUES (?, ?, ?, 'INTAKE', 'Initial stock on creation', ?, ?)
      `).run('mov_' + Date.now() + '_init', id, initialStock, req.user.id, now);

      if (variantRows.length > 0) saveVariants(id, variantRows, req.user.id);
      if (tables.options) saveWeightOptions(id, tables.options);
      if (tables.tierRows) saveTiers(id, tables.tierRows);
    })();
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to create product' });
  }

  logAudit(req.user.id, 'CREATE_PRODUCT', 'products', id, `Created product: ${name.trim()} (${sku.trim()})`, req);

  res.status(201).json(productPayload(id));
});

// PUT /api/products/:id (System Admin & Business Admin)
router.put('/:id', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  const { id } = req.params;
  const {
    name,
    sku,
    category_id,
    wire_size,
    thickness,
    endings,
    lock_type,
    std_weight_per_20in,
    description,
    status,
    physical_stock,
    reorder_threshold,
    image_path,
    labour_per_gram,
    variants,
    tiers
  } = req.body;

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  if (sku && sku.trim().toLowerCase() !== product.sku.toLowerCase()) {
    const clash = db.prepare('SELECT id FROM products WHERE LOWER(sku) = LOWER(?) AND id != ?').get(sku.trim(), id);
    if (clash) {
      return res.status(400).json({ error: 'A product with this SKU already exists' });
    }
  }

  let tables;
  try {
    tables = parseProductTables(req.body);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const variantRows = tables.variantRows;
  const summary = summaryFromOptions(tables.options) || {};

  const now = new Date().toISOString();
  const weight = summary.std_weight_per_20in || parseFloat(std_weight_per_20in) || product.std_weight_per_20in;
  const labourValue = summary.labour_per_gram ?? (labour_per_gram !== undefined && labour_per_gram !== '' ? Math.max(0, parseFloat(labour_per_gram) || 0) : null);
  const rawThk = thickness !== undefined && thickness !== null ? String(thickness).trim() : '';
  const finalThickness = summary.thickness || (rawThk ? (rawThk.includes('mm') ? rawThk : rawThk + ' mm') : product.thickness);
  const finalName = name ? name.trim() : product.name;
  const finalSku = sku ? sku.trim() : product.sku;
  const oldImages = productImages(product);
  const storedImages = nameImages(sentImages(req.body) || oldImages, finalSku);
  const storedImage = storedImages[0] || null;

  try {
    db.transaction(() => {
      db.prepare(`
        UPDATE products SET
          name = COALESCE(?, name),
          sku = COALESCE(?, sku),
          category_id = COALESCE(?, category_id),
          wire_size = COALESCE(?, wire_size),
          thickness = ?,
          endings = COALESCE(?, endings),
          lock_type = COALESCE(?, lock_type),
          std_weight_per_20in = ?,
          description = COALESCE(?, description),
          status = COALESCE(?, status),
          reorder_threshold = COALESCE(?, reorder_threshold),
          image_path = ?,
          image_paths = ?,
          labour_per_gram = COALESCE(?, labour_per_gram),
          weight_columns = COALESCE(?, weight_columns),
          updated_at = ?
        WHERE id = ?
      `).run(
        name ? name.trim() : null,
        sku ? sku.trim() : null,
        category_id !== undefined ? category_id : null,
        summary.wire_size ?? wire_size,
        finalThickness,
        summary.endings ?? endings,
        summary.lock_type || lock_type,
        weight,
        description,
        status,
        reorder_threshold !== undefined ? parseInt(reorder_threshold, 10) : null,
        storedImage,
        JSON.stringify(storedImages),
        labourValue,
        tables.columns ? JSON.stringify(tables.columns) : null,
        now,
        id
      );

      // If physical stock changed directly, log movement
      if (physical_stock !== undefined && !variantRows && parseInt(physical_stock, 10) !== product.physical_stock) {
        const diff = parseInt(physical_stock, 10) - product.physical_stock;
        db.prepare('UPDATE products SET physical_stock = ? WHERE id = ?').run(parseInt(physical_stock, 10), id);
        db.prepare(`
          INSERT INTO inventory_movements (id, product_id, change_qty, movement_type, reason, user_id, created_at)
          VALUES (?, ?, ?, 'ADJUSTMENT', 'Manual stock adjustment via edit', ?, ?)
        `).run('mov_' + Date.now(), id, diff, req.user.id, now);
      }

      if (variantRows) saveVariants(id, variantRows, req.user.id);
      if (tables.options) saveWeightOptions(id, tables.options);
      if (tables.tierRows) saveTiers(id, tables.tierRows);
    })();
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to update product' });
  }

  // Removed photos: drop their files (a renamed photo keeps its file under the new name)
  for (const old of oldImages) {
    if (!storedImages.includes(old)) removeUpload(old);
  }

  const payload = productPayload(id);
  logAudit(req.user.id, 'UPDATE_PRODUCT', 'products', id, `Updated product details for ${finalName}`, req, product, payload.product);

  res.json(payload);
});

// Copy a product image to a new file named after the copy, so renaming or deleting one never touches the other
function copyProductImage(relPath, base) {
  const src = absFromRel(relPath);
  if (!src || !fs.existsSync(src)) return null;
  const target = uniqueFilePath(path.dirname(src), safeBaseName(base), path.extname(src));
  fs.copyFileSync(src, target);
  return relFromAbs(target);
}

function nextCopySku(sku) {
  let candidate = `${sku}-COPY`;
  let n = 2;
  while (db.prepare('SELECT 1 FROM products WHERE LOWER(sku) = LOWER(?)').get(candidate)) {
    candidate = `${sku}-COPY${n}`;
    n++;
  }
  return candidate;
}

// POST /api/products/:id/duplicate (System Admin & Business Admin)
// Copies details, standard weights, ready stock sizes and slabs. The copy starts inactive with no stock,
// so customers never see it and it never counts as inventory until it is reviewed.
router.post('/:id/duplicate', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  const src = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!src) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const id = 'prod_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  const now = new Date().toISOString();
  const name = `${src.name} (Copy)`;
  const sku = nextCopySku(src.sku);
  const images = productImages(src).map(p => copyProductImage(p, sku)).filter(Boolean);
  const image = images[0] || null;

  try {
    db.transaction(() => {
      db.prepare(`
        INSERT INTO products (
          id, name, sku, category_id, description, wire_size, endings, lock_type,
          std_weight_per_20in, unit, physical_stock, reserved_stock, reorder_threshold, status,
          image_path, created_at, updated_at, labour_per_gram, weight_columns, image_paths
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 'inactive', ?, ?, ?, ?, ?, ?)
      `).run(id, name, sku, src.category_id, src.description, src.wire_size, src.endings, src.lock_type,
        src.std_weight_per_20in, src.unit, src.reorder_threshold, image, now, now, src.labour_per_gram, src.weight_columns,
        JSON.stringify(images));

      saveVariants(id, getVariants(src.id).map(v => ({ ...v, stock_qty: 0 })), req.user.id);
      saveWeightOptions(id, getWeightOptions(src.id));
      saveTiers(id, getTiers(src.id).map(t => ({ ...t, qty_unit: t.qty_unit || 'pcs', order_type: t.order_type || 'ALL' })));

      const attrs = db.prepare('SELECT attribute_id, value FROM product_attribute_values WHERE product_id = ?').all(src.id);
      const insertAttr = db.prepare('INSERT INTO product_attribute_values (id, product_id, attribute_id, value) VALUES (?, ?, ?, ?)');
      for (const a of attrs) insertAttr.run(newRowId('pav'), id, a.attribute_id, a.value);
    })();
  } catch (err) {
    removeUpload(image);
    return res.status(400).json({ error: err.message || 'Failed to duplicate product' });
  }

  logAudit(req.user.id, 'DUPLICATE_PRODUCT', 'products', id, `Duplicated ${src.name} (${src.sku}) as ${name} (${sku})`, req);
  res.status(201).json(productPayload(id));
});

// POST /api/products/:id/inventory { std_weight_g, size_inches, qty } (both administrators)
// Adds pieces to one ready stock row (creating it when the weight × size is new) and to overall stock;
// a negative qty takes pieces off the shelf.
router.post('/:id/inventory', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  const product = db.prepare("SELECT * FROM products WHERE id = ? AND status != 'archived'").get(req.params.id);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  const std = round2(parseFloat(req.body.std_weight_g) * 1000) / 1000;
  const size = parseFloat(req.body.size_inches);
  const qty = Number(req.body.qty);
  if (!(std > 0)) return res.status(400).json({ error: 'Choose a standard weight' });
  if (!(size >= 1 && size <= 60)) return res.status(400).json({ error: 'Enter a size between 1 and 60 inches' });
  if (!Number.isInteger(qty) || qty === 0) return res.status(400).json({ error: 'Enter the number of pieces to add (a minus number removes pieces)' });

  const now = new Date().toISOString();
  const findRow = () => db.prepare('SELECT * FROM product_variants WHERE product_id = ? AND ABS(std_weight_g - ?) < 0.001 AND ABS(size_inches - ?) < 0.001')
    .get(product.id, std, size);
  const insertRow = (rowStd, rowSize, stock) => db.prepare(`
    INSERT INTO product_variants (id, product_id, std_weight_g, size_inches, weight_g, stock_qty, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(newRowId('var'), product.id, rowStd, rowSize, round2((rowStd * rowSize / 20) * 1000) / 1000, stock, now, now);

  try {
    db.transaction(() => {
      // A product still tracked as one overall count keeps that count as a 20" row of its standard weight
      const hasRows = db.prepare('SELECT COUNT(*) as c FROM product_variants WHERE product_id = ?').get(product.id).c > 0;
      const legacy = Math.max(0, (product.physical_stock || 0) - (product.reserved_stock || 0));
      if (!hasRows && legacy > 0) insertRow(product.std_weight_per_20in || 20, 20, legacy);

      const row = findRow();
      const nextQty = (row ? row.stock_qty : 0) + qty;
      if (nextQty < 0) throw new Error(`Only ${row ? row.stock_qty : 0} pcs of ${std} g × ${size}" are in stock`);
      if (row) {
        db.prepare('UPDATE product_variants SET stock_qty = ?, updated_at = ? WHERE id = ?').run(nextQty, now, row.id);
      } else {
        insertRow(std, size, nextQty);
      }

      const readyTotal = db.prepare('SELECT COALESCE(SUM(stock_qty), 0) as t FROM product_variants WHERE product_id = ?').get(product.id).t;
      const newPhysical = (product.reserved_stock || 0) + readyTotal;
      db.prepare('UPDATE products SET physical_stock = ?, updated_at = ? WHERE id = ?').run(newPhysical, now, product.id);
      db.prepare(`
        INSERT INTO inventory_movements (id, product_id, change_qty, movement_type, reason, user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('mov_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6), product.id, newPhysical - product.physical_stock,
        qty > 0 ? 'INTAKE' : 'ADJUSTMENT', `${qty > 0 ? 'Added' : 'Removed'} ${Math.abs(qty)} pcs of ${std} g × ${size}"`, req.user.id, now);
    })();
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not update inventory' });
  }

  const message = `${qty > 0 ? 'Added' : 'Removed'} ${Math.abs(qty)} pcs of ${std} g × ${size}"`;
  logAudit(req.user.id, 'ADD_INVENTORY', 'products', product.id, `${message} for ${product.name}`, req);
  res.status(201).json({ ...productPayload(product.id), message });
});

// POST /api/products/bulk-inventory { items: [{ product_id, std_weight_g, size_inches, qty }] } (both administrators)
router.post('/bulk-inventory', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Please provide at least one inventory entry' });
  }

  const now = new Date().toISOString();
  let totalPiecesAdded = 0;
  let totalNetGrams = 0;
  const processedProducts = new Set();

  try {
    db.transaction(() => {
      for (const item of items) {
        const product = db.prepare("SELECT * FROM products WHERE id = ? AND status != 'archived'").get(item.product_id);
        if (!product) {
          throw new Error(`Product not found: ${item.product_id}`);
        }
        const std = round2(parseFloat(item.std_weight_g) * 1000) / 1000;
        const size = parseFloat(item.size_inches);
        const qty = Number(item.qty);

        if (!(std > 0)) throw new Error(`Invalid standard weight for ${product.name}`);
        if (!(size >= 1 && size <= 60)) throw new Error(`Size must be between 1 and 60 inches for ${product.name}`);
        if (!Number.isInteger(qty) || qty === 0) throw new Error(`Invalid quantity for ${product.name}`);

        const findRow = () => db.prepare('SELECT * FROM product_variants WHERE product_id = ? AND ABS(std_weight_g - ?) < 0.001 AND ABS(size_inches - ?) < 0.001')
          .get(product.id, std, size);
        const insertRow = (rowStd, rowSize, stock) => db.prepare(`
          INSERT INTO product_variants (id, product_id, std_weight_g, size_inches, weight_g, stock_qty, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(newRowId('var'), product.id, rowStd, rowSize, round2((rowStd * rowSize / 20) * 1000) / 1000, stock, now, now);

        const hasRows = db.prepare('SELECT COUNT(*) as c FROM product_variants WHERE product_id = ?').get(product.id).c > 0;
        const legacy = Math.max(0, (product.physical_stock || 0) - (product.reserved_stock || 0));
        if (!hasRows && legacy > 0) insertRow(product.std_weight_per_20in || 20, 20, legacy);

        const row = findRow();
        const nextQty = (row ? row.stock_qty : 0) + qty;
        if (nextQty < 0) throw new Error(`Cannot remove ${Math.abs(qty)} pcs of ${product.name} (${std}g x ${size}"). Current stock is ${row ? row.stock_qty : 0}`);

        if (row) {
          db.prepare('UPDATE product_variants SET stock_qty = ?, updated_at = ? WHERE id = ?').run(nextQty, now, row.id);
        } else {
          insertRow(std, size, nextQty);
        }

        const readyTotal = db.prepare('SELECT COALESCE(SUM(stock_qty), 0) as t FROM product_variants WHERE product_id = ?').get(product.id).t;
        const newPhysical = (product.reserved_stock || 0) + readyTotal;
        db.prepare('UPDATE products SET physical_stock = ?, updated_at = ? WHERE id = ?').run(newPhysical, now, product.id);

        const pieceWeight = (std * size) / 20;
        totalPiecesAdded += qty;
        totalNetGrams += pieceWeight * qty;
        processedProducts.add(product.name);

        db.prepare(`
          INSERT INTO inventory_movements (id, product_id, change_qty, movement_type, reason, user_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run('mov_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6), product.id, qty,
          qty > 0 ? 'INTAKE' : 'ADJUSTMENT', `Bulk entry: ${qty > 0 ? 'Added' : 'Removed'} ${Math.abs(qty)} pcs of ${std}g × ${size}"`, req.user.id, now);
      }
    })();
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not process bulk inventory' });
  }

  const message = `Successfully updated inventory: added ${totalPiecesAdded} pcs (${round2(totalNetGrams)}g) across ${items.length} items`;
  logAudit(req.user.id, 'BULK_ADD_INVENTORY', 'products', null, message, req);
  res.status(201).json({ success: true, count: items.length, total_pieces: totalPiecesAdded, total_grams: round2(totalNetGrams), message });
});

// DELETE /api/products/:id (System Admin only - delete or archive product)
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const ordersCount = db.prepare('SELECT COUNT(*) as c FROM order_items WHERE product_id = ?').get(id).c;
  try {
    if (ordersCount === 0) {
      // The stock ledger references the product, so it must go first or the delete violates the foreign key
      db.transaction(() => {
        db.prepare('DELETE FROM inventory_movements WHERE product_id = ?').run(id);
        db.prepare('DELETE FROM product_attribute_values WHERE product_id = ?').run(id);
        db.prepare('DELETE FROM products WHERE id = ?').run(id);
      })();
      productImages(product).forEach(removeUpload);
    } else {
      db.prepare("UPDATE products SET status = 'archived', updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
    }
  } catch (err) {
    console.error('Product delete failed:', err);
    return res.status(500).json({ error: `Could not delete product: ${err.message}` });
  }

  logAudit(req.user.id, 'DELETE_PRODUCT', 'products', id, `Deleted/Archived product: ${product.name} (orders: ${ordersCount})`, req, product, null);

  res.json({
    success: true,
    archived: ordersCount > 0,
    message: ordersCount > 0
      ? `Product "${product.name}" has order history, so it was archived instead of deleted`
      : `Product "${product.name}" deleted successfully`
  });
});

module.exports = router;
