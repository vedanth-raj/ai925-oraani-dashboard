const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const archiverPkg = require('archiver');
const { db } = require('../db/database');
const { authenticateToken, requireAdminOrBusinessAdmin, logAudit } = require('../middleware/auth');
const { round2, getCurrentSilverRate, getVariants, getTiers, getWeightOptions, productImages, unitWeightFor, makingFor, priceBreakdown } = require('../utils/pricing');
const { parseProductTables, saveVariants, saveWeightOptions, summaryFromOptions } = require('../services/productTables');
const { absFromRel } = require('../utils/files');
const { getNextOrderNumber } = require('../services/orders');

function createZipArchive(options = { zlib: { level: 9 } }) {
  if (typeof archiverPkg === 'function') return archiverPkg('zip', options);
  if (archiverPkg.ZipArchive) return new archiverPkg.ZipArchive(options);
  if (archiverPkg.Archiver) return new archiverPkg.Archiver('zip', options);
  throw new Error('Unsupported archiver module format');
}

// UTF-8 Byte Order Mark for guaranteed Excel & mobile CSV encoding recognition
const UTF8_BOM = '﻿';

// Helper to escape CSV values
function escapeCsv(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

// Headers are matched on letters and digits only, so "Std Weight (g)" and "std weight g" are the same column
const headerKey = h => String(h).toLowerCase().replace(/[^a-z0-9]/g, '');

function sendCsv(res, filename, headers, rows) {
  const lines = [headers.join(','), ...rows.map(r => r.map(escapeCsv).join(','))];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(UTF8_BOM + lines.join('\r\n'));
}

const num = n => (n === null || n === undefined || n === '' ? '' : Number(n));
const typeTag = { READY_STOCK: 'Ready ', ON_ORDER: 'Order ', ALL: '' };

// Making slabs of a standard weight: "0-100=12; 101-500=10; 501+=8" (a "Ready " / "Order " prefix limits a slab to that purchase type)
function formatSlabs(slabs) {
  return (slabs || [])
    .map(s => `${typeTag[s.order_type] || ''}${s.min_g}${s.max_g === null ? '+' : `-${s.max_g}`}=${s.making}`)
    .join('; ');
}

// Ready stock of a standard weight: "16=5; 18=3; 20=10" (size in inches = pieces)
function formatReady(variants) {
  return variants.map(v => `${v.size_inches}=${v.stock_qty}`).join('; ');
}

// Custom standard weight columns: "Colour=Rose; Finish=Matte"
function formatExtra(extra, columns) {
  return columns.filter(c => extra && extra[c]).map(c => `${c}=${extra[c]}`).join('; ');
}

function weightColumnsOf(product) {
  try {
    const cols = JSON.parse(product.weight_columns || '[]');
    return Array.isArray(cols) ? cols.filter(c => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

const sameNum = (a, b) => Math.abs(Number(a) - Number(b)) < 0.001;

// ============================================================================
// CSV EXPORT (each file can be edited and uploaded again through the matching import)
// ============================================================================

const ORDER_HEADERS = [
  'Order #', 'Date', 'Order Type', 'Status', 'Operational Status', 'Payment Status', 'Payment Plan',
  'Company', 'POC Name', 'Phone', 'GSTIN', 'City', 'Zone', 'Sales Rep', 'Created By',
  'Product SKU', 'Product Name', 'Std Weight (g)', 'Size (in)', 'Pieces', 'Delivered Pieces',
  'Unit Weight (g)', 'Net Weight (g)', 'Delivered Weight (g)', 'Making (₹/g)', 'Line Amount (₹)',
  'Order Pieces', 'Order Net Weight (g)', 'Order Delivered Pieces', 'Order Delivered Weight (g)',
  'Silver Rate (₹/g)', 'Silver Amount (₹)', 'Making Amount (₹)', 'GST Amount (₹)', 'Delivery Charge (₹)',
  'Discount (₹)', 'Order Total (₹)', 'Paid (₹)', 'Advance (₹)', 'Notes', 'Closed At'
];

// GET /api/export/orders.csv (Admin & Business Admin): one row per order item, order details repeated on each
router.get('/orders.csv', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  const orders = db.prepare(`
    SELECT o.*, c.company_name, c.poc_name, c.phone, c.gstin, c.city, c.zone,
      u.full_name as created_by, sr.full_name as sales_rep_name
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    JOIN users u ON o.creator_id = u.id
    LEFT JOIN users sr ON o.sales_rep_id = sr.id
    ORDER BY o.order_date DESC, o.order_number DESC
  `).all();
  const itemsStmt = db.prepare(`
    SELECT oi.*, p.sku, p.name as product_name
    FROM order_items oi JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id = ? ORDER BY oi.created_at ASC
  `);

  const rows = [];
  for (const o of orders) {
    const head = [
      o.order_number, o.order_date, o.order_type || 'STANDARD', o.status, o.operational_status, o.payment_status || 'UNPAID', o.payment_plan || '',
      o.company_name, o.poc_name, o.phone, o.gstin || '', o.city, o.zone, o.sales_rep_name || '', o.created_by
    ];
    const tail = [
      o.total_pieces, num(o.expected_weight), o.delivered_pieces, num(o.delivered_weight),
      num(o.silver_rate), num(o.silver_amount), num(o.labour_amount), num(o.gst_amount), num(o.delivery_charge),
      num(o.discount_amount), num(o.total_amount), num(o.paid_amount), num(o.advance_amount), o.special_notes || '', o.closed_at || ''
    ];
    const items = itemsStmt.all(o.id);
    if (items.length === 0) {
      rows.push([...head, '', '', '', '', '', '', '', '', '', '', '', ...tail]);
      continue;
    }
    for (const it of items) {
      rows.push([
        ...head,
        it.sku, it.product_name, num(it.std_weight_g), num(it.size_inches), it.requested_pieces, it.delivered_pieces,
        num(it.unit_weight), num(it.expected_weight), num(it.delivered_weight), num(it.labour_per_gram), num(it.line_amount),
        ...tail
      ]);
    }
  }

  logAudit(req.user.id, 'EXPORT_CSV', 'orders', null, 'Exported orders CSV', req);
  sendCsv(res, 'ai925_orders.csv', ORDER_HEADERS, rows);
});

const PRODUCT_HEADERS = [
  'SKU', 'Name', 'Category', 'Description', 'Status',
  'Std Weight (g per 20in)', 'Weight SKU Code', 'Wire Size', 'Endings', 'Lock Type', 'Making Charge (₹/g)', 'Making Slabs (net g)', 'Extra Details',
  'Ready Stock (size in = pcs)', 'Ready Stock Total (pcs)', 'Reserved Stock (pcs)', 'Images'
];

// GET /api/export/products.csv (Admin & Business Admin): one row per standard weight, product details repeated on each
router.get('/products.csv', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  const products = db.prepare(`
    SELECT p.*, c.name as category
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.status != 'archived'
    ORDER BY p.name ASC
  `).all();

  const rows = [];
  for (const p of products) {
    const columns = weightColumnsOf(p);
    const variants = getVariants(p.id);
    const options = getWeightOptions(p.id);
    // Ready stock rows of a weight that has no saved standard weight entry still get a row of their own
    for (const v of variants) {
      if (!options.some(o => sameNum(o.std_weight_g, v.std_weight_g))) {
        options.push({ std_weight_g: v.std_weight_g, making_charge: null, sku_code: '', wire_size: '', endings: '', lock_type: '', extra: {}, weight_slabs: [] });
      }
    }
    if (options.length === 0) {
      options.push({ std_weight_g: p.std_weight_per_20in, making_charge: p.labour_per_gram, sku_code: p.sku, wire_size: p.wire_size, endings: p.endings, lock_type: p.lock_type, extra: {}, weight_slabs: [] });
    }
    const images = productImages(p).join('; ');

    for (const o of options) {
      const ready = variants.filter(v => sameNum(v.std_weight_g, o.std_weight_g));
      rows.push([
        p.sku, p.name, p.category || '', p.description || '', p.status,
        num(o.std_weight_g), o.sku_code || '', o.wire_size || '', o.endings || '', o.lock_type || '', num(o.making_charge),
        formatSlabs(o.weight_slabs), formatExtra(o.extra, columns),
        // A product still tracked as one overall count (no ready stock rows) shows that count instead
        variants.length === 0 ? '' : formatReady(ready),
        variants.length === 0 ? Math.max(0, (p.physical_stock || 0) - (p.reserved_stock || 0)) : ready.reduce((s, v) => s + v.stock_qty, 0),
        p.reserved_stock || 0,
        images
      ]);
    }
  }

  logAudit(req.user.id, 'EXPORT_CSV', 'products', null, 'Exported products CSV', req);
  sendCsv(res, 'ai925_products.csv', PRODUCT_HEADERS, rows);
});

const CUSTOMER_HEADERS = [
  'Company', 'POC Name', 'Phone', 'Alternate Phone', 'Additional Numbers', 'GSTIN', 'Email', 'Address', 'PIN Code',
  'City', 'State', 'Country', 'Zone', 'Category', 'Notes', 'Location Address', 'Latitude', 'Longitude',
  'Portal Account', 'Created By', 'Total Orders', 'Total Order Value (₹)', 'Created At'
];

// GET /api/export/customers.csv (Admin & Business Admin)
router.get('/customers.csv', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  const customers = db.prepare(`
    SELECT c.*, u.full_name as created_by,
      (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) as total_orders,
      (SELECT COALESCE(SUM(o.total_amount), 0) FROM orders o WHERE o.customer_id = c.id) as total_value,
      (SELECT ca.status || ' · ' || ca.email FROM customer_accounts ca WHERE ca.customer_id = c.id ORDER BY ca.created_at DESC LIMIT 1) as portal_account
    FROM customers c
    LEFT JOIN users u ON c.created_by_id = u.id
    WHERE c.is_archived = 0
    ORDER BY c.company_name ASC
  `).all();

  const rows = customers.map(c => {
    let additionalPhones = '';
    if (c.additional_phones) {
      try {
        const arr = JSON.parse(c.additional_phones);
        additionalPhones = Array.isArray(arr) ? arr.join('; ') : String(c.additional_phones);
      } catch (_) {
        additionalPhones = c.additional_phones;
      }
    }
    return [
      c.company_name, c.poc_name, c.phone, c.alternate_phone || '', additionalPhones, c.gstin || '', c.email, c.address, c.pin_code,
      c.city, c.state, c.country || 'India', c.zone, c.category || 'Wholesaler', c.notes || '', c.location_address || '',
      num(c.latitude), num(c.longitude), c.portal_account || '', c.created_by || '', c.total_orders, round2(c.total_value), c.created_at
    ];
  });

  logAudit(req.user.id, 'EXPORT_CSV', 'customers', null, 'Exported customers CSV', req);
  sendCsv(res, 'ai925_customers.csv', CUSTOMER_HEADERS, rows);
});

// GET /api/export/order-images.zip (Admin & Business Admin)
// In the product image the image file should be saved with the name as the order ID.
// If there are multiple files for the same order ID, then use a subname of 1 or 2, with the order ID, and so on.
router.get('/order-images.zip', authenticateToken, requireAdminOrBusinessAdmin, async (req, res) => {
  try {
    const images = db.prepare(`
      SELECT
        si.id,
        si.order_id,
        si.file_path,
        si.original_filename,
        o.order_number
      FROM shipment_images si
      JOIN orders o ON si.order_id = o.id
      ORDER BY si.order_id ASC, si.created_at ASC
    `).all();

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="ai925_order_images.zip"');

    const archive = createZipArchive({ zlib: { level: 9 } });
    archive.pipe(res);

    // Group images by order_id
    const orderGroups = new Map();
    for (const img of images) {
      if (!orderGroups.has(img.order_id)) {
        orderGroups.set(img.order_id, []);
      }
      orderGroups.get(img.order_id).push(img);
    }

    const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

    for (const [orderId, imgList] of orderGroups.entries()) {
      const orderNum = imgList[0].order_number ? imgList[0].order_number.replace(/[^a-zA-Z0-9]/g, '') : orderId;

      imgList.forEach((img, idx) => {
        let ext = path.extname(img.original_filename || img.file_path || '.jpg') || '.jpg';
        let entryName = '';

        if (imgList.length === 1) {
          entryName = `${orderNum}${ext}`;
        } else {
          entryName = `${orderNum}_${idx + 1}${ext}`;
        }

        const fullPath = path.isAbsolute(img.file_path) ? img.file_path : path.join(uploadsDir, img.file_path);
        if (fs.existsSync(fullPath)) {
          archive.file(fullPath, { name: entryName });
        }
      });
    }

    logAudit(req.user.id, 'EXPORT_ORDER_IMAGES', 'orders', null, `Exported ${images.length} order images in ZIP`, req);

    await archive.finalize();
  } catch (err) {
    console.error('Order images export failed:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to export order images: ' + err.message });
    }
  }
});

// ============================================================================
// CSV IMPORT ENGINE (Customers, Products, Orders matching download format)
// ============================================================================

// Standard RFC 4180 CSV parser supporting multiline & escaped quotes
function parseCsv(text) {
  if (!text) return [];
  // Strip BOM
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  const rows = [];
  let currentRow = [];
  let currentVal = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"') {
        if (next === '"') {
          currentVal += '"';
          i++; // skip next quote
        } else {
          inQuotes = false;
        }
      } else {
        currentVal += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        currentRow.push(currentVal.trim());
        currentVal = '';
      } else if (c === '\r') {
        if (next === '\n') i++;
        currentRow.push(currentVal.trim());
        if (currentRow.some(val => val.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentVal = '';
      } else if (c === '\n') {
        currentRow.push(currentVal.trim());
        if (currentRow.some(val => val.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentVal = '';
      } else {
        currentVal += c;
      }
    }
  }

  if (currentVal.length > 0 || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    if (currentRow.some(val => val.length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length < 2) return [];

  const headers = rows[0].map(headerKey);
  const parsedRecords = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const record = {};
    headers.forEach((header, idx) => {
      record[header] = row[idx] !== undefined ? row[idx] : '';
    });
    parsedRecords.push(record);
  }

  return parsedRecords;
}

// First non-empty value among a record's columns, looked up by header text (aliases cover older files)
function field(rec, ...headers) {
  for (const h of headers) {
    const v = rec[headerKey(h)];
    if (v !== undefined && v !== '') return v;
  }
  return '';
}

// Whether the file has a column at all (an empty cell still counts)
const hasColumn = (records, ...headers) => headers.some(h => records.length > 0 && headerKey(h) in records[0]);

function numField(rec, ...headers) {
  const v = field(rec, ...headers);
  if (v === '') return null;
  const n = parseFloat(String(v).replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// "a=b; c=d" pairs (also accepts ":" and "|" from hand-edited files)
function parsePairs(textValue) {
  return String(textValue || '')
    .split(/[;|\n]/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const m = part.match(/^(.*?)\s*[=:]\s*(.*)$/);
      return m ? [m[1].trim(), m[2].trim()] : [part, ''];
    });
}

const SLAB_TYPE_WORDS = { ready: 'READY_STOCK', order: 'ON_ORDER', both: 'ALL', all: 'ALL' };

// "Ready 0-100=12; 101+=10" -> [{ min_g, max_g, making, order_type }] (throws on a slab it cannot read)
function parseSlabs(textValue, std) {
  return String(textValue || '').split(/[;|\n]/).map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/^(?:(ready|order|both|all)\s*:?\s*)?(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?)|\+)\s*g?\s*=\s*(\d+(?:\.\d+)?)$/i);
    if (!m) throw new Error(`Cannot read making slab "${s}" of ${std} g (use e.g. 0-100=12; 101+=10)`);
    return {
      order_type: m[1] ? SLAB_TYPE_WORDS[m[1].toLowerCase()] : 'ALL',
      min_g: parseFloat(m[2]),
      max_g: m[3] === undefined ? null : parseFloat(m[3]),
      making: parseFloat(m[4])
    };
  });
}

// "16=5; 18=3" -> [{ size_inches, stock_qty }] (throws on a size it cannot read)
function parseReadyStock(textValue, std) {
  return parsePairs(textValue).map(([size, qty]) => {
    const s = parseFloat(String(size).replace(/["in\s]/gi, ''));
    const q = parseInt(qty, 10);
    if (!(s > 0) || !Number.isInteger(q)) throw new Error(`Cannot read ready stock "${size}=${qty}" of ${std} g (use e.g. 16=5; 18=3)`);
    return { std_weight_g: std, size_inches: s, stock_qty: q };
  });
}

const multerCsv = require('multer')({
  storage: require('multer').memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

// Helper to extract CSV string from request (either multipart file or JSON body)
function getCsvTextFromReq(req) {
  if (req.file && req.file.buffer) {
    return req.file.buffer.toString('utf8');
  }
  if (req.body && req.body.csv_data) {
    return req.body.csv_data;
  }
  return null;
}

function readCsvRequest(req, res) {
  const csvText = getCsvTextFromReq(req);
  if (!csvText) {
    res.status(400).json({ error: 'Please provide CSV file or csv_data string' });
    return null;
  }
  const records = parseCsv(csvText);
  if (records.length === 0) {
    res.status(400).json({ error: 'No valid data rows found in CSV' });
    return null;
  }
  return records;
}

const newId = prefix => prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);

const ZONES = ['North', 'South', 'East', 'West'];
const CUSTOMER_CATEGORIES = ['Wholesaler', 'Retailer', 'Both', 'E-commerce', 'Importer', 'Exporter'];
const matchList = (list, v) => list.find(x => x.toLowerCase() === String(v || '').trim().toLowerCase()) || null;

// POST /api/export/import/customers (Upload customers CSV). A customer already on file (same company and POC)
// is updated with the filled-in cells; anyone else is added.
router.post('/import/customers', authenticateToken, requireAdminOrBusinessAdmin, multerCsv.single('file'), (req, res) => {
  const records = readCsvRequest(req, res);
  if (!records) return;

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];
  const now = new Date().toISOString();

  const insertStmt = db.prepare(`
    INSERT INTO customers (
      id, poc_name, company_name, phone, alternate_phone, additional_phones, gstin,
      email, address, pin_code, city, state, zone, notes, category, country, location_address, latitude, longitude,
      created_by_id, rep_edit_count, is_archived, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
  `);
  const updateStmt = db.prepare(`
    UPDATE customers SET
      phone = COALESCE(?, phone), alternate_phone = COALESCE(?, alternate_phone), additional_phones = COALESCE(?, additional_phones),
      gstin = COALESCE(?, gstin), email = COALESCE(?, email), address = COALESCE(?, address), pin_code = COALESCE(?, pin_code),
      city = COALESCE(?, city), state = COALESCE(?, state), zone = COALESCE(?, zone), notes = COALESCE(?, notes),
      category = COALESCE(?, category), country = COALESCE(?, country), location_address = COALESCE(?, location_address),
      latitude = COALESCE(?, latitude), longitude = COALESCE(?, longitude), updated_at = ?
    WHERE id = ?
  `);

  const tx = db.transaction(() => {
    records.forEach((rec, i) => {
      const company = field(rec, 'Company', 'Company Name');
      const poc = field(rec, 'POC Name', 'POC') || company;
      if (!company) {
        skipped++;
        errors.push(`Row ${i + 2}: company name is missing`);
        return;
      }
      const orNull = v => (v === '' ? null : v);
      const addPhones = field(rec, 'Additional Numbers', 'Additional Phones');
      const values = {
        phone: orNull(field(rec, 'Phone')),
        alternate_phone: orNull(field(rec, 'Alternate Phone')),
        additional_phones: addPhones ? JSON.stringify(addPhones.split(/[;,]/).map(p => p.trim()).filter(Boolean)) : null,
        gstin: orNull(field(rec, 'GSTIN').toUpperCase()),
        email: orNull(field(rec, 'Email')),
        address: orNull(field(rec, 'Address')),
        pin_code: orNull(field(rec, 'PIN Code', 'PIN')),
        city: orNull(field(rec, 'City')),
        state: orNull(field(rec, 'State')),
        zone: matchList(ZONES, field(rec, 'Zone')),
        notes: orNull(field(rec, 'Notes')),
        category: matchList(CUSTOMER_CATEGORIES, field(rec, 'Category')),
        country: orNull(field(rec, 'Country')),
        location_address: orNull(field(rec, 'Location Address')),
        latitude: numField(rec, 'Latitude'),
        longitude: numField(rec, 'Longitude')
      };

      const existing = db.prepare(`
        SELECT id FROM customers
        WHERE LOWER(company_name) = LOWER(?) AND LOWER(poc_name) = LOWER(?) AND is_archived = 0
      `).get(company, poc);

      if (existing) {
        updateStmt.run(values.phone, values.alternate_phone, values.additional_phones, values.gstin, values.email, values.address,
          values.pin_code, values.city, values.state, values.zone, values.notes, values.category, values.country,
          values.location_address, values.latitude, values.longitude, now, existing.id);
        updated++;
        return;
      }

      insertStmt.run(
        newId('cust'), poc, company, values.phone || '', values.alternate_phone, values.additional_phones, values.gstin,
        values.email || '', values.address || '', values.pin_code || '', values.city || '', values.state || '', values.zone || 'West',
        values.notes || 'Imported via CSV', values.category || 'Wholesaler', values.country || 'India', values.location_address,
        values.latitude, values.longitude, req.user.id, now, now
      );
      imported++;
    });
  });

  tx();

  logAudit(req.user.id, 'IMPORT_CSV', 'customers', null, `Imported ${imported} customers and updated ${updated} from CSV (${skipped} skipped)`, req);
  res.json({ success: true, imported, updated, skipped, errors, total_rows: records.length });
});

function findOrCreateCategory(name, now) {
  let cat = db.prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?)').get(name);
  if (!cat) {
    cat = { id: newId('cat') };
    db.prepare('INSERT INTO categories (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(cat.id, name, now, now);
  }
  return cat.id;
}

// Uploaded product photos named in the file that are still on disk
function existingImages(textValue) {
  return String(textValue || '').split(/[;|\n]/).map(p => p.trim())
    .filter(p => p.startsWith('/uploads/products/') && fs.existsSync(absFromRel(p) || ''));
}

// POST /api/export/import/products (Upload products CSV). Rows are grouped by SKU, one row per standard weight
// (the export format). A product already on file is updated; columns missing from the file keep what is saved.
router.post('/import/products', authenticateToken, requireAdminOrBusinessAdmin, multerCsv.single('file'), (req, res) => {
  const records = readCsvRequest(req, res);
  if (!records) return;

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];
  const now = new Date().toISOString();

  const STD = ['Std Weight (g per 20in)', 'Std Weight/20in (g)', 'Std Weight per 20in', 'Std Weight (g)', 'Weight'];
  const has = {
    std: hasColumn(records, ...STD),
    making: hasColumn(records, 'Making Charge (₹/g)', 'Making Charge'),
    slabs: hasColumn(records, 'Making Slabs (net g)', 'Making Slabs'),
    extra: hasColumn(records, 'Extra Details'),
    ready: hasColumn(records, 'Ready Stock (size in = pcs)', 'Ready Stock'),
    skuCode: hasColumn(records, 'Weight SKU Code'),
    wire: hasColumn(records, 'Wire Size'),
    endings: hasColumn(records, 'Endings'),
    lock: hasColumn(records, 'Lock Type')
  };

  // Group rows by SKU, keeping file order
  const groups = new Map();
  records.forEach((rec, i) => {
    const sku = field(rec, 'SKU');
    if (!sku) {
      skipped++;
      errors.push(`Row ${i + 2}: SKU is missing`);
      return;
    }
    const key = sku.toLowerCase();
    if (!groups.has(key)) groups.set(key, { sku, rows: [] });
    groups.get(key).rows.push(rec);
  });

  for (const { sku, rows } of groups.values()) {
    try {
      db.transaction(() => {
        const first = rows[0];
        const existing = db.prepare('SELECT * FROM products WHERE LOWER(sku) = LOWER(?)').get(sku);
        const savedOptions = existing ? getWeightOptions(existing.id) : [];
        const savedColumns = existing ? weightColumnsOf(existing) : [];

        // Standard weights: one per row (a file without the column describes a single weight)
        const columns = has.extra ? [] : [...savedColumns];
        const options = [];
        const ready = [];
        for (const rec of rows) {
          const std = numField(rec, ...STD) ?? (existing ? existing.std_weight_per_20in : 20);
          const saved = savedOptions.find(o => sameNum(o.std_weight_g, std)) || {};
          const extra = has.extra ? Object.fromEntries(parsePairs(field(rec, 'Extra Details')).filter(([k, v]) => k && v)) : saved.extra || {};
          for (const k of Object.keys(extra)) if (!columns.includes(k)) columns.push(k);
          options.push({
            std_weight_g: std,
            making_charge: has.making ? numField(rec, 'Making Charge (₹/g)', 'Making Charge') : saved.making_charge ?? existing?.labour_per_gram ?? null,
            weight_slabs: has.slabs ? parseSlabs(field(rec, 'Making Slabs (net g)', 'Making Slabs'), std) : saved.weight_slabs || [],
            sku_code: has.skuCode ? field(rec, 'Weight SKU Code') : saved.sku_code ?? sku,
            wire_size: has.wire ? field(rec, 'Wire Size') : saved.wire_size ?? '',
            endings: has.endings ? field(rec, 'Endings') : saved.endings ?? '',
            lock_type: has.lock ? field(rec, 'Lock Type') : saved.lock_type ?? 'Fish Lock',
            extra
          });
          if (has.ready) ready.push(...parseReadyStock(field(rec, 'Ready Stock (size in = pcs)', 'Ready Stock'), std));
        }

        const tables = parseProductTables({ weight_columns: columns, weight_options: options, variants: has.ready ? ready : undefined });
        const summary = summaryFromOptions(tables.options);
        const name = field(first, 'Product Name', 'Name') || existing?.name || sku;
        const categoryName = field(first, 'Category');
        const categoryId = categoryName ? findOrCreateCategory(categoryName, now) : existing?.category_id || findOrCreateCategory('General', now);
        const statusIn = field(first, 'Status').toLowerCase();
        const status = ['active', 'inactive', 'archived'].includes(statusIn) ? statusIn : existing?.status || 'active';
        const description = hasColumn(records, 'Description') ? field(first, 'Description') : existing?.description || '';
        const images = existingImages(field(first, 'Images'));
        // Files without ready stock rows (older format) carry one overall stock count
        const legacyStock = numField(first, 'Physical Stock', 'Stock');

        if (existing) {
          db.prepare(`
            UPDATE products SET name = ?, category_id = ?, description = ?, status = ?, wire_size = ?, endings = ?, lock_type = ?,
              std_weight_per_20in = ?, labour_per_gram = COALESCE(?, labour_per_gram), weight_columns = ?, updated_at = ?
            WHERE id = ?
          `).run(name, categoryId, description, status, summary.wire_size, summary.endings, summary.lock_type || existing.lock_type,
            summary.std_weight_per_20in, summary.labour_per_gram, JSON.stringify(tables.columns), now, existing.id);
          if (images.length > 0) {
            db.prepare('UPDATE products SET image_path = ?, image_paths = ? WHERE id = ?').run(images[0], JSON.stringify(images), existing.id);
          }
          saveWeightOptions(existing.id, tables.options);
          if (tables.variantRows) {
            saveVariants(existing.id, tables.variantRows, req.user.id);
          } else if (legacyStock !== null && getVariants(existing.id).length === 0 && legacyStock !== existing.physical_stock) {
            db.prepare('UPDATE products SET physical_stock = ? WHERE id = ?').run(Math.max(0, Math.round(legacyStock)), existing.id);
            db.prepare(`
              INSERT INTO inventory_movements (id, product_id, change_qty, movement_type, reason, user_id, created_at)
              VALUES (?, ?, ?, 'ADJUSTMENT', 'Stock set by CSV import', ?, ?)
            `).run(newId('mov'), existing.id, Math.max(0, Math.round(legacyStock)) - existing.physical_stock, req.user.id, now);
          }
          updated++;
          return;
        }

        const id = newId('prod');
        const variantRows = tables.variantRows || [];
        const initialStock = tables.variantRows ? variantRows.reduce((s, r) => s + r.stock_qty, 0) : Math.max(0, Math.round(legacyStock || 0));
        db.prepare(`
          INSERT INTO products (
            id, name, sku, category_id, description, wire_size, endings, lock_type,
            std_weight_per_20in, physical_stock, reserved_stock, reorder_threshold, status,
            image_path, image_paths, labour_per_gram, weight_columns, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 50, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, name, sku, categoryId, description || 'Imported via CSV', summary.wire_size, summary.endings, summary.lock_type || 'Fish Lock',
          summary.std_weight_per_20in, initialStock, status, images[0] || null, JSON.stringify(images), summary.labour_per_gram || 0,
          JSON.stringify(tables.columns), now, now);
        db.prepare(`
          INSERT INTO inventory_movements (id, product_id, change_qty, movement_type, reason, user_id, created_at)
          VALUES (?, ?, ?, 'INTAKE', 'Initial stock from CSV import', ?, ?)
        `).run(newId('mov'), id, initialStock, req.user.id, now);
        saveWeightOptions(id, tables.options);
        if (variantRows.length > 0) saveVariants(id, variantRows, req.user.id);
        imported++;
      })();
    } catch (err) {
      skipped++;
      errors.push(`${sku}: ${err.message}`);
    }
  }

  logAudit(req.user.id, 'IMPORT_CSV', 'products', null, `Imported ${imported} products and updated ${updated} from CSV (${skipped} skipped)`, req);
  res.json({ success: true, imported, updated, skipped, errors, total_rows: records.length });
});

const ORDER_STATUSES = ['OPEN', 'IN_PROGRESS', 'CLOSED'];
const ORDER_TYPES = ['STANDARD', 'READY_STOCK', 'ON_ORDER'];
const PAYMENT_STATUSES = ['UNPAID', 'PARTIAL', 'PAID'];

// POST /api/export/import/orders (Upload orders CSV). Rows are grouped by Order #, one row per item (the export
// format). Orders already on file are skipped. Imported orders are records of past sales, so stock is not touched.
router.post('/import/orders', authenticateToken, requireAdminOrBusinessAdmin, multerCsv.single('file'), (req, res) => {
  const records = readCsvRequest(req, res);
  if (!records) return;

  let imported = 0;
  let skipped = 0;
  const errors = [];
  const now = new Date().toISOString();
  const userByName = name => (name ? db.prepare('SELECT id FROM users WHERE LOWER(full_name) = LOWER(?) LIMIT 1').get(name) : null);

  // Group rows by order number; a row without one is an order of its own
  const groups = new Map();
  records.forEach((rec, i) => {
    const orderNum = field(rec, 'Order #', 'Order Number');
    const key = orderNum ? orderNum.toLowerCase() : `__row${i}`;
    if (!groups.has(key)) groups.set(key, { orderNum, rows: [] });
    groups.get(key).rows.push(rec);
  });

  for (const { orderNum, rows } of groups.values()) {
    const label = orderNum || 'Order without a number';
    try {
      db.transaction(() => {
        const first = rows[0];
        if (orderNum && db.prepare('SELECT id FROM orders WHERE order_number = ?').get(orderNum)) {
          throw new Error('already exists');
        }

        const company = field(first, 'Company', 'Company Name');
        if (!company) throw new Error('company name is missing');
        const poc = field(first, 'POC Name', 'POC') || company;

        let cust = db.prepare(`
          SELECT id FROM customers WHERE LOWER(company_name) = LOWER(?) AND is_archived = 0
          ORDER BY (LOWER(poc_name) = LOWER(?)) DESC LIMIT 1
        `).get(company, poc);
        if (!cust) {
          cust = { id: newId('cust') };
          db.prepare(`
            INSERT INTO customers (id, poc_name, company_name, phone, gstin, city, zone, notes, created_by_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Imported via orders CSV', ?, ?, ?)
          `).run(cust.id, poc, company, field(first, 'Phone'), field(first, 'GSTIN').toUpperCase() || null, field(first, 'City'),
            matchList(ZONES, field(first, 'Zone')) || 'West', req.user.id, now, now);
        }

        const orderType = matchList(ORDER_TYPES, field(first, 'Order Type')) || 'STANDARD';
        const rate = numField(first, 'Silver Rate (₹/g)', 'Silver Rate') ?? getCurrentSilverRate().rate_per_gram ?? 0;

        // Items: rows naming a product SKU
        const items = [];
        for (const rec of rows) {
          const sku = field(rec, 'Product SKU');
          if (!sku) continue;
          const prod = db.prepare('SELECT * FROM products WHERE LOWER(sku) = LOWER(?)').get(sku);
          if (!prod) throw new Error(`product SKU ${sku} is not on file (import products first)`);
          const pieces = Math.round(numField(rec, 'Pieces') || 0);
          if (pieces <= 0) continue;
          const size = numField(rec, 'Size (in)', 'Size') || 20;
          const std = numField(rec, 'Std Weight (g)');
          const unit = numField(rec, 'Unit Weight (g)') ?? unitWeightFor(prod, getVariants(prod.id), size, std);
          const net = numField(rec, 'Net Weight (g)') ?? unit * pieces;
          const making = numField(rec, 'Making (₹/g)', 'Making')
            ?? makingFor({ product: prod, tiers: getTiers(prod.id), weightOptions: getWeightOptions(prod.id), stdWeight: std, mode: orderType, pieces, grams: net, stdGrams: net }).labour_per_gram;
          const price = priceBreakdown(net, rate, making);
          items.push({
            product_id: prod.id, size_inches: size, std_weight_g: std, requested_pieces: pieces,
            delivered_pieces: Math.round(numField(rec, 'Delivered Pieces') || 0),
            unit_weight: round2(unit * 1000) / 1000, expected_weight: round2(net), delivered_weight: numField(rec, 'Delivered Weight (g)') || 0,
            labour_per_gram: making, line_amount: numField(rec, 'Line Amount (₹)', 'Line Amount') ?? price.total, price
          });
        }

        // Order totals follow its items; an order without item rows (older format) takes them from its own columns
        const sum = key => round2(items.reduce((s, it) => s + it.price[key], 0));
        const itemTotal = key => items.reduce((s, it) => s + it[key], 0);
        const noItems = items.length === 0;
        const totalPieces = noItems ? Math.round(numField(first, 'Order Pieces', 'Total Pieces') || 0) : itemTotal('requested_pieces');
        const netWeight = noItems ? numField(first, 'Order Net Weight (g)', 'Expected Weight (g)', 'Expected Weight') || 0 : round2(itemTotal('expected_weight'));
        const deliveredPieces = noItems ? Math.round(numField(first, 'Order Delivered Pieces', 'Delivered Pieces') || 0) : itemTotal('delivered_pieces');
        const deliveredWeight = noItems ? numField(first, 'Order Delivered Weight (g)', 'Delivered Weight (g)') || 0 : round2(itemTotal('delivered_weight'));
        const silver = numField(first, 'Silver Amount (₹)') ?? sum('silver_amount');
        const making = numField(first, 'Making Amount (₹)') ?? sum('labour_amount');
        const gst = numField(first, 'GST Amount (₹)') ?? sum('gst_amount');
        const delivery = numField(first, 'Delivery Charge (₹)') ?? 0;
        const discount = numField(first, 'Discount (₹)') ?? 0;
        const total = numField(first, 'Order Total (₹)') ?? round2(itemTotal('line_amount') + delivery - discount);
        const paid = numField(first, 'Paid (₹)') ?? 0;
        const status = matchList(ORDER_STATUSES, field(first, 'Status')) || 'OPEN';

        const finalOrderNum = orderNum || getNextOrderNumber();

        const orderId = newId('ord');
        db.prepare(`
          INSERT INTO orders (
            id, order_number, customer_id, creator_id, sales_rep_id, status, operational_status, advance_amount, special_notes,
            total_pieces, expected_weight, delivered_pieces, delivered_weight, order_date, closed_at, created_at, updated_at,
            order_type, silver_rate, silver_amount, labour_amount, gst_amount, total_amount, payment_status, paid_amount,
            delivery_charge, discount_amount, payment_plan
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          orderId, finalOrderNum, cust.id, userByName(field(first, 'Created By'))?.id || req.user.id, userByName(field(first, 'Sales Rep'))?.id || null,
          status, field(first, 'Operational Status') || (status === 'CLOSED' ? 'Closed' : 'Imported via CSV'),
          numField(first, 'Advance (₹)', 'Advance', 'Advance Amount') || 0, field(first, 'Notes'),
          totalPieces, netWeight, deliveredPieces, deliveredWeight,
          field(first, 'Date', 'Order Date') || now.split('T')[0], field(first, 'Closed At') || (status === 'CLOSED' ? now : null), now, now,
          orderType, rate, silver, making, gst, total,
          matchList(PAYMENT_STATUSES, field(first, 'Payment Status')) || (paid >= total && total > 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID'), paid,
          delivery, discount, matchList(['ADVANCE', 'FULL'], field(first, 'Payment Plan'))
        );

        const insertItem = db.prepare(`
          INSERT INTO order_items (
            id, order_id, product_id, size_inches, std_weight_g, requested_pieces, allocated_pieces, delivered_pieces,
            expected_weight, delivered_weight, unit_weight, labour_per_gram, line_amount, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const it of items) {
          insertItem.run(newId('item'), orderId, it.product_id, it.size_inches, it.std_weight_g, it.requested_pieces, it.delivered_pieces,
            it.expected_weight, it.delivered_weight, it.unit_weight, it.labour_per_gram, it.line_amount, now);
        }
        imported++;
      })();
    } catch (err) {
      skipped++;
      errors.push(`${label}: ${err.message}`);
    }
  }

  logAudit(req.user.id, 'IMPORT_CSV', 'orders', null, `Imported ${imported} orders from CSV (${skipped} skipped)`, req);
  res.json({ success: true, imported, skipped, errors, total_rows: records.length });
});

module.exports = router;
