// Customer portal API: self sign-up, verification status, catalog, seller requests, checkout, dummy payment
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { db } = require('../db/database');
const {
  generateCustomerToken,
  authenticateCustomer,
  requireApprovedCustomer,
  canViewMode,
  resolveRequestBrand,
  checkCustomerBrandAccess,
  rateLimitLogin,
  clearLoginAttempts
} = require('../middleware/auth');
const { uploadsSubdir, storeUploadedFile, removeUpload, imageFileFilter } = require('../utils/files');
const { round2, getCurrentSilverRate, getVariants, getTiers, getWeightOptions, productPricing, MIN_ORDER_GRAMS, productImages, getStatePremium, getAllWeightSlabDiscounts, getWeightSlabDiscount, detectStateFromText } = require('../utils/pricing');
const { buildPricedItems, sumPricing, insertOrder } = require('../services/orders');
const { PAYMENT_METHODS, paymentOptions, payWithPlan } = require('../services/payments');
const { customerPin, deliveryChargeFor, getPaymentTerms } = require('../services/commerce');
const { encrypt } = require('../utils/secrets');
const { generateAndSendOtp, verifyOtp } = require('../services/otpService');
const { lookupPincode } = require('../services/pincodeService');
const { getRazorpayConfig, createRazorpayOrder, verifyPaymentSignature, verifyWebhookSignature } = require('../services/razorpay');

const ID_CARDS_DIR = uploadsSubdir('id_cards');

const uploadIdCard = multer({
  dest: ID_CARDS_DIR,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFileFilter('the GST / ID card')
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCOUNT_TYPES = ['Retailer', 'Wholesaler', 'Both'];

const MODE_NAME = { READY_STOCK: 'Ready Stock', ON_ORDER: 'On Order Purchase' };
function sectionClosed(res, mode) {
  return res.status(403).json({ error: `${MODE_NAME[mode]} is not available on your account. Please contact the seller.`, section_closed: true });
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

const newId = prefix => prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);

function publicAccount(id) {
  const account = db.prepare(`
    SELECT id, full_name, company_name, phone, email, address, pin_code, state, gstin, id_card_path, status,
      biz_approved_at, sys_approved_at, rejected_reason, customer_id, password_changed_at, created_at,
      account_type, can_view_ready, can_view_order, brand
    FROM customer_accounts WHERE id = ?
  `).get(id);
  if (!account) return account;
  account.can_view_ready = account.can_view_ready !== 0;
  account.can_view_order = account.can_view_order !== 0;
  const rawBrand = (account.brand || 'AI925').toUpperCase();
  account.brand = ['AI925', 'ORAANI', 'BOTH'].includes(rawBrand) ? rawBrand : 'AI925';
  account.can_access_ai925 = account.brand === 'AI925' || account.brand === 'BOTH';
  account.can_access_oraani = account.brand === 'ORAANI' || account.brand === 'BOTH';

  let customerState = account.state || null;
  if (!customerState && account.customer_id) {
    const cust = db.prepare('SELECT state FROM customers WHERE id = ?').get(account.customer_id);
    customerState = cust ? cust.state : null;
  }
  if (!customerState && account.address) {
    customerState = detectStateFromText(account.address);
  }
  account.state = customerState;
  account.state_premium_pct = getStatePremium(customerState);

  // Latest profile change request, so the Account screen can show "awaiting approval" or why it was rejected
  const change = db.prepare(`
    SELECT id, changes, password_hash IS NOT NULL as changes_password, status, rejected_reason, created_at, reviewed_at
    FROM customer_change_requests WHERE customer_account_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(id);
  account.change_request = change
    ? { ...change, changes: JSON.parse(change.changes || '{}'), changes_password: Boolean(change.changes_password) }
    : null;
  return account;
}

function normalizePin(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length === 6 ? digits : null;
}

// POST /api/portal/register (name, phone, email, address mandatory; GST / ID card image optional)
router.post('/register', uploadIdCard.single('id_card'), (req, res) => {
  const tempCard = req.file ? '/uploads/id_cards/' + req.file.filename : null;
  const fail = (status, error) => {
    removeUpload(tempCard);
    return res.status(status).json({ error });
  };

  const fullName = String(req.body.full_name || '').trim();
  const companyName = String(req.body.company_name || '').trim();
  const phone = normalizePhone(req.body.phone);
  const email = String(req.body.email || '').trim().toLowerCase();
  const address = String(req.body.address || '').trim();
  const pinRaw = String(req.body.pin_code || '').trim();
  const pinCode = normalizePin(pinRaw);
  const stateRaw = String(req.body.state || '').trim();
  const state = stateRaw || detectStateFromText(address);
  const password = String(req.body.password || '');
  const accountType = String(req.body.account_type || '').trim();
  const brand = String(req.body.brand || '').toUpperCase() === 'ORAANI' ? 'ORAANI' : 'AI925';
  const gstin = String(req.body.gstin || '').trim().toUpperCase();

  if (!fullName) return fail(400, 'Name is required');
  if (!ACCOUNT_TYPES.includes(accountType)) return fail(400, 'Choose Retailer, Wholesaler or Both');
  if (pinRaw && !pinCode) return fail(400, 'Enter a valid 6-digit PIN code');
  if (phone.length !== 10) return fail(400, 'Enter a valid 10-digit mobile number');
  if (!EMAIL_RE.test(email)) return fail(400, 'Enter a valid email address');
  if (!address) return fail(400, 'Address is required');
  if (password.length < 6) return fail(400, 'Password must be at least 6 characters');

  // Mandatory business verification: Must provide either GSTIN or Business Card / ID file
  if (!gstin && !req.file) {
    return fail(400, 'Business verification is mandatory: Please enter your GST registration number OR upload your business card / ID proof.');
  }

  const clash = db.prepare(`
    SELECT phone, email FROM customer_accounts 
    WHERE phone = ? 
       OR REPLACE(REPLACE(phone, ' ', ''), '+91', '') = ?
       OR LOWER(email) = ?
  `).get(phone, phone, email);

  if (clash) {
    return fail(400, (clash.phone === phone || clash.phone?.endsWith(phone))
      ? 'An account with this mobile number already exists. Please sign in.'
      : 'An account with this email already exists. Please sign in.');
  }

  const id = 'cacc_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  const now = new Date().toISOString();
  const idCardPath = req.file ? storeUploadedFile(req.file, ID_CARDS_DIR, `${companyName || fullName} ID Card`) : null;

  const passwordEnc = encrypt(password);
  db.transaction(() => {
    db.prepare(`
      INSERT INTO customer_accounts (
        id, full_name, company_name, phone, email, address, pin_code, state, gstin, password_hash, password_enc, id_card_path,
        account_type, brand, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
    `).run(id, fullName, companyName || null, phone, email, address, pinCode, state, gstin || null, bcrypt.hashSync(password, 10), passwordEnc, idCardPath,
      accountType, brand, now, now);
    db.prepare(`
      INSERT INTO customer_password_history (id, customer_account_id, password_enc, source, created_at)
      VALUES (?, ?, ?, 'REGISTERED', ?)
    `).run(newId('pwh'), id, passwordEnc, now);
  })();

  const account = publicAccount(id);
  res.status(201).json({
    token: generateCustomerToken(account),
    account,
    message: 'Your profile is under verification. Once it is verified you will be informed.'
  });
});

// POST /api/portal/login (mobile number or email + password)
router.post('/login', rateLimitLogin, (req, res) => {
  const identifier = String(req.body.identifier || '').trim();
  const password = String(req.body.password || '');
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Enter your mobile number or email and password' });
  }

  const row = identifier.includes('@')
    ? db.prepare('SELECT * FROM customer_accounts WHERE LOWER(email) = ?').get(identifier.toLowerCase())
    : db.prepare('SELECT * FROM customer_accounts WHERE phone = ?').get(normalizePhone(identifier));

  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Invalid mobile/email or password' });
  }

  const targetBrand = resolveRequestBrand(req);
  const accountBrand = (row.brand || 'AI925').toUpperCase();
  if (accountBrand !== 'BOTH' && accountBrand !== targetBrand) {
    const allowedName = accountBrand === 'ORAANI' ? 'Oraani' : 'AI 925';
    const currentName = targetBrand === 'ORAANI' ? 'Oraani' : 'AI 925';
    return res.status(403).json({
      error: `Your account is not enabled for ${currentName}. It is only authorized for ${allowedName}.`,
      brand_restricted: true,
      allowed_brand: accountBrand
    });
  }

  clearLoginAttempts(req.ip || req.connection?.remoteAddress);
  const account = publicAccount(row.id);
  res.json({ token: generateCustomerToken(account), account });
});

// POST /api/portal/otp/send { destination, purpose, brand }
router.post('/otp/send', async (req, res) => {
  try {
    const { destination, purpose = 'LOGIN', brand } = req.body || {};
    if (!destination) return res.status(400).json({ error: 'Mobile or email destination is required' });
    const targetBrand = resolveRequestBrand(req);

    const dest = String(destination).trim().toLowerCase();
    const row = dest.includes('@')
      ? db.prepare('SELECT * FROM customer_accounts WHERE LOWER(email) = ?').get(dest)
      : db.prepare('SELECT * FROM customer_accounts WHERE phone = ?').get(normalizePhone(dest));

    if (row && purpose === 'LOGIN') {
      const accountBrand = (row.brand || 'AI925').toUpperCase();
      if (accountBrand !== 'BOTH' && accountBrand !== targetBrand) {
        const allowedName = accountBrand === 'ORAANI' ? 'Oraani' : 'AI 925';
        const currentName = targetBrand === 'ORAANI' ? 'Oraani' : 'AI 925';
        return res.status(403).json({
          error: `Your account is not enabled for ${currentName}. It is only authorized for ${allowedName}.`,
          brand_restricted: true,
          allowed_brand: accountBrand
        });
      }
    }

    const result = await generateAndSendOtp({ destination, purpose, brand: targetBrand });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to send OTP' });
  }
});

// POST /api/portal/otp/verify { destination, otp, purpose }
router.post('/otp/verify', (req, res) => {
  const { destination, otp, purpose = 'LOGIN' } = req.body || {};
  if (!destination || !otp) {
    return res.status(400).json({ error: 'Destination and 6-digit code are required' });
  }
  const v = verifyOtp({ destination, otp, purpose });
  if (!v.valid) {
    return res.status(400).json({ error: v.error });
  }
  res.json({ ok: true, message: 'OTP verified successfully' });
});

// POST /api/portal/otp/login { destination, otp } (Sign in using verified OTP)
router.post('/otp/login', rateLimitLogin, (req, res) => {
  const { destination, otp } = req.body || {};
  if (!destination || !otp) {
    return res.status(400).json({ error: 'Destination and 6-digit code are required' });
  }

  const v = verifyOtp({ destination, otp, purpose: 'LOGIN' });
  if (!v.valid) {
    return res.status(400).json({ error: v.error });
  }

  const dest = String(destination).trim().toLowerCase();
  const row = dest.includes('@')
    ? db.prepare('SELECT * FROM customer_accounts WHERE LOWER(email) = ?').get(dest)
    : db.prepare('SELECT * FROM customer_accounts WHERE phone = ?').get(normalizePhone(dest));

  if (!row) {
    return res.status(404).json({ error: 'No account found with this email or mobile. Please register first.' });
  }

  const targetBrand = resolveRequestBrand(req);
  const accountBrand = (row.brand || 'AI925').toUpperCase();
  if (accountBrand !== 'BOTH' && accountBrand !== targetBrand) {
    const allowedName = accountBrand === 'ORAANI' ? 'Oraani' : 'AI 925';
    const currentName = targetBrand === 'ORAANI' ? 'Oraani' : 'AI 925';
    return res.status(403).json({
      error: `Your account is not enabled for ${currentName}. It is only authorized for ${allowedName}.`,
      brand_restricted: true,
      allowed_brand: accountBrand
    });
  }

  clearLoginAttempts(req.ip || req.connection?.remoteAddress);
  const account = publicAccount(row.id);
  res.json({ token: generateCustomerToken(account), account });
});

// GET /api/portal/pincode/:pincode (Public lookup for auto-filling State & City from PIN code)
router.get('/pincode/:pincode', async (req, res) => {
  const { pincode } = req.params;
  const result = await lookupPincode(pincode);
  if (!result || !result.state) {
    return res.status(404).json({ error: 'PIN code not found' });
  }
  res.json(result);
});

// GET /api/portal/me (verification status lives here)
router.get('/me', authenticateCustomer, (req, res) => {
  if (!checkCustomerBrandAccess(req.customer, req)) {
    const targetBrand = resolveRequestBrand(req);
    const accountBrand = (req.customer.brand || 'AI925').toUpperCase();
    const currentName = targetBrand === 'ORAANI' ? 'Oraani' : 'AI 925';
    const allowedName = accountBrand === 'ORAANI' ? 'Oraani' : 'AI 925';
    return res.status(403).json({
      error: `Your account is not enabled for ${currentName}. It is only authorized for ${allowedName}.`,
      brand_restricted: true,
      allowed_brand: accountBrand
    });
  }
  res.json({ account: publicAccount(req.customer.id) });
});

// POST /api/portal/presence { latitude?, longitude? } (heartbeat while the app is open; location when the device shares it)
router.post('/presence', authenticateCustomer, (req, res) => {
  const lat = Number(req.body?.latitude);
  const lng = Number(req.body?.longitude);
  const hasLocation = req.body?.latitude !== undefined && req.body?.longitude !== undefined;
  if (hasLocation) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ error: 'Invalid location' });
    }
    db.prepare('UPDATE customer_accounts SET last_latitude = ?, last_longitude = ?, last_location_at = ? WHERE id = ?')
      .run(lat, lng, new Date().toISOString(), req.customer.id);
  }
  res.json({ ok: true });
});

// Ready stock rows for a product (standard weight × size), or a single 20" row from overall stock when none are set
function readySizes(product, variants) {
  if (variants.length > 0) return variants;
  return [{
    id: null,
    std_weight_g: product.std_weight_per_20in || 20,
    size_inches: 20,
    weight_g: product.std_weight_per_20in || 20,
    stock_qty: Math.max(0, (product.physical_stock || 0) - (product.reserved_stock || 0)),
    derived: true
  }];
}

// What a customer sees of a standard weight option (wire size and endings stay internal)
function publicWeightOption(o) {
  return {
    std_weight_g: o.std_weight_g,
    making_charge: o.making_charge,
    weight_slabs: o.weight_slabs || [],
    sku_code: o.sku_code,
    lock_type: o.lock_type,
    thickness: o.thickness || (o.wire_size ? (o.wire_size.includes('mm') ? o.wire_size : o.wire_size + ' mm') : null)
  };
}

function catalogProduct(p, rate, statePremiumPct = 0) {
  const variants = getVariants(p.id);
  const tiers = getTiers(p.id);
  const sizes = readySizes(p, variants);
  const defaultThk = p.thickness || (p.wire_size ? (p.wire_size.includes('mm') ? p.wire_size : p.wire_size + ' mm') : '2.0 mm');
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    category_name: p.category_name,
    description: p.description,
    lock_type: p.lock_type,
    thickness: defaultThk,
    image_path: p.image_path,
    image_paths: productImages(p),
    video_path: p.video_path || null,
    std_weight_per_20in: p.std_weight_per_20in,
    labour_per_gram: p.labour_per_gram || 0,
    state_premium_pct: statePremiumPct,
    sizes,
    tiers,
    weight_options: getWeightOptions(p.id).map(publicWeightOption),
    ready_stock: sizes.reduce((s, v) => s + (v.stock_qty || 0), 0),
    pricing: productPricing(p, rate, variants, tiers)
  };
}

// GET /api/portal/products?mode=ready|order&search=&category=
router.get('/products', authenticateCustomer, requireApprovedCustomer, (req, res) => {
  const { mode, search, category } = req.query;
  const canReady = canViewMode(req.customer, 'READY_STOCK');
  const canOrder = canViewMode(req.customer, 'ON_ORDER');

  if (!canReady && !canOrder) {
    return res.status(403).json({ error: 'Catalog is not available on your account. Please contact the seller.', section_closed: true });
  }

  if (mode === 'ready' && !canReady) return sectionClosed(res, 'READY_STOCK');
  if (mode === 'order' && !canOrder) return sectionClosed(res, 'ON_ORDER');
  let query = `
    SELECT p.*, c.name as category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.status = 'active'
  `;
  const params = [];
  if (search) {
    query += ' AND (p.name LIKE ? OR p.sku LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (category && category !== 'All') {
    query += ' AND c.name = ?';
    params.push(category);
  }
  query += ' ORDER BY p.name ASC';

  const rate = getCurrentSilverRate();
  const customerAcct = publicAccount(req.customer.id);
  const statePremiumPct = customerAcct ? (customerAcct.state_premium_pct || 0) : 0;
  let products = db.prepare(query).all(...params).map(p => catalogProduct(p, rate.rate_per_gram, statePremiumPct));
  if (mode === 'ready') {
    products = products.filter(p => p.ready_stock > 0);
  }

  const categories = db.prepare('SELECT name FROM categories WHERE is_archived = 0 ORDER BY created_at ASC').all().map(c => c.name);
  const discounts = getAllWeightSlabDiscounts().filter(d => Boolean(d.is_active));
  res.json({ products, categories, silver_rate: rate, weight_slab_discounts: discounts, state_premium_pct: statePremiumPct });
});

// GET /api/portal/products/:id
router.get('/products/:id', authenticateCustomer, requireApprovedCustomer, (req, res) => {
  const { mode } = req.query;
  if (mode === 'READY_STOCK' || mode === 'ON_ORDER') {
    if (!canViewMode(req.customer, mode)) return sectionClosed(res, mode);
  } else if (!canViewMode(req.customer, 'READY_STOCK') && !canViewMode(req.customer, 'ON_ORDER')) {
    return sectionClosed(res, 'READY_STOCK');
  }
  const p = db.prepare(`
    SELECT p.*, c.name as category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.id = ? AND p.status = 'active'
  `).get(req.params.id);
  if (!p) {
    return res.status(404).json({ error: 'Product not found' });
  }
  const rate = getCurrentSilverRate();
  const customerAcct = publicAccount(req.customer.id);
  const statePremiumPct = customerAcct ? (customerAcct.state_premium_pct || 0) : 0;
  const discounts = getAllWeightSlabDiscounts().filter(d => Boolean(d.is_active));
  res.json({ product: catalogProduct(p, rate.rate_per_gram, statePremiumPct), silver_rate: rate, weight_slab_discounts: discounts, state_premium_pct: statePremiumPct });
});

// POST /api/portal/stock-requests ("Request from seller" for an unavailable size)
router.post('/stock-requests', authenticateCustomer, requireApprovedCustomer, (req, res) => {
  const { product_id, size_inches, quantity, notes } = req.body;
  const product = db.prepare("SELECT id, name FROM products WHERE id = ? AND status != 'archived'").get(product_id);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  const size = size_inches !== undefined && size_inches !== null && size_inches !== '' ? parseFloat(size_inches) : null;
  const qty = Math.max(1, parseInt(quantity, 10) || 1);

  const id = 'sreq_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO stock_requests (id, customer_account_id, product_id, size_inches, quantity, notes, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
  `).run(id, req.customer.id, product.id, size, qty, String(notes || '').trim(), now, now);

  res.status(201).json({
    request: db.prepare('SELECT * FROM stock_requests WHERE id = ?').get(id),
    message: `Request sent to the seller for ${product.name}${size ? ` (${size} in)` : ''}`
  });
});

// GET /api/portal/stock-requests
router.get('/stock-requests', authenticateCustomer, requireApprovedCustomer, (req, res) => {
  const requests = db.prepare(`
    SELECT sr.*, p.name as product_name, p.sku as product_sku
    FROM stock_requests sr
    JOIN products p ON sr.product_id = p.id
    WHERE sr.customer_account_id = ?
    ORDER BY sr.created_at DESC
  `).all(req.customer.id);
  res.json({ requests });
});

// Pick the staff user recorded as creator of a portal order (orders.creator_id must reference a user)
function portalOrderOwners(account, customer) {
  const assigned = db.prepare(`
    SELECT rca.user_id FROM rep_company_assignments rca
    JOIN users u ON rca.user_id = u.id AND u.is_active = 1
    WHERE LOWER(rca.company_name) = LOWER(?)
    LIMIT 1
  `).get(customer.company_name);
  const sysAdmin = account.sys_approved_by_id
    ? db.prepare('SELECT id FROM users WHERE id = ?').get(account.sys_approved_by_id)
    : null;
  const creator = sysAdmin || db.prepare("SELECT id FROM users WHERE role = 'ADMIN' AND is_active = 1 ORDER BY created_at ASC LIMIT 1").get();
  return { creatorId: creator ? creator.id : null, salesRepId: assigned ? assigned.user_id : null };
}

// POST /api/portal/checkout { mode: 'READY_STOCK' | 'ON_ORDER', items: [{ product_id, std_weight_g, size_inches, pieces }], notes }
router.post('/checkout', authenticateCustomer, requireApprovedCustomer, (req, res) => {
  const { mode, items, notes } = req.body;
  if (mode !== 'READY_STOCK' && mode !== 'ON_ORDER') {
    return res.status(400).json({ error: 'Choose Ready Stock or On Order Purchase' });
  }
  if (!canViewMode(req.customer, mode)) return sectionClosed(res, mode);
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Your cart is empty' });
  }

  const rate = getCurrentSilverRate().rate_per_gram;
  if (rate === null) {
    return res.status(400).json({ error: "Today's silver rate has not been published yet. Please try again shortly." });
  }

  const account = db.prepare('SELECT * FROM customer_accounts WHERE id = ?').get(req.customer.id);
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(account.customer_id);
  if (!customer) {
    return res.status(400).json({ error: 'Your customer profile is not linked yet. Please contact the seller.' });
  }
  const { creatorId, salesRepId } = portalOrderOwners(account, customer);
  if (!creatorId) {
    return res.status(500).json({ error: 'No active administrator is available to receive orders' });
  }

  // Group cart lines per product (price slabs apply per product)
  const grouped = {};
  for (const it of items) {
    const pcs = parseInt(it.pieces, 10) || 0;
    if (pcs <= 0) continue;
    if (!grouped[it.product_id]) grouped[it.product_id] = { product_id: it.product_id, sizes: [] };
    const size = parseFloat(it.size_inches);
    if (it.size_inches !== undefined && it.size_inches !== null && it.size_inches !== '' && !(size >= 1 && size <= 60)) {
      return res.status(400).json({ error: 'Sizes must be between 1 and 60 inches' });
    }
    const std = parseFloat(it.std_weight_g);
    grouped[it.product_id].sizes.push({ std_weight_g: std > 0 ? std : null, size_inches: parseFloat(it.size_inches) || 20, pieces: pcs });
  }
  const productEntries = Object.values(grouped);
  if (productEntries.length === 0) {
    return res.status(400).json({ error: 'Your cart is empty' });
  }

  try {
    const result = db.transaction(() => {
      const stockUpdates = [];
      for (const entry of productEntries) {
        const prod = db.prepare("SELECT * FROM products WHERE id = ? AND status = 'active'").get(entry.product_id);
        if (!prod) throw new Error('A product in your cart is no longer available');
        if (mode === 'READY_STOCK') {
          const sizes = readySizes(prod, getVariants(prod.id));
          for (const row of entry.sizes) {
            const size = sizes.find(v => Math.abs(v.size_inches - row.size_inches) < 0.001
              && (row.std_weight_g === null || Math.abs(v.std_weight_g - row.std_weight_g) < 0.001));
            if (size && row.std_weight_g === null) row.std_weight_g = size.std_weight_g;
            const available = size ? size.stock_qty : 0;
            const label = `${prod.name} ${row.std_weight_g ? `${row.std_weight_g} g ` : ''}${row.size_inches} in`;
            if (row.pieces > available) {
              throw new Error(`${label}: only ${available} pcs in ready stock`);
            }
            if (size && size.id) stockUpdates.push({ variantId: size.id, pieces: row.pieces });
          }
        }
      }

      const customerState = customer ? customer.state : null;
      const statePremiumPct = getStatePremium(customerState);
      const lines = buildPricedItems(productEntries, rate, mode, statePremiumPct);
      const netGrams = lines.reduce((s, l) => s + l.expected_weight, 0);
      const minGrams = MIN_ORDER_GRAMS[mode];
      if (netGrams < minGrams) {
        throw new Error(`Minimum ${mode === 'ON_ORDER' ? 'On Order' : 'Ready Stock'} order is ${minGrams} g of silver (your cart has ${parseFloat(netGrams.toFixed(2))} g)`);
      }
      const delivery = deliveryChargeFor({ pin: customerPin(account, customer), zone: customer.zone, orderValue: sumPricing(lines).total_amount, weightGrams: netGrams });
      const created = insertOrder({
        customer,
        creatorId,
        salesRepId,
        lines,
        specialNotes: String(notes || '').trim(),
        orderType: mode,
        customerAccountId: account.id,
        silverRate: rate,
        movementUserId: creatorId,
        deliveryCharge: delivery.charge,
        brand: account.brand === 'BOTH' ? resolveRequestBrand(req) : (account.brand || 'AI925')
      });

      for (const u of stockUpdates) {
        db.prepare('UPDATE product_variants SET stock_qty = stock_qty - ?, updated_at = ? WHERE id = ?')
          .run(u.pieces, new Date().toISOString(), u.variantId);
      }
      return created;
    })();

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(result.orderId);
    res.status(201).json({
      order,
      payment_options: paymentOptions(order),
      message: mode === 'ON_ORDER'
        ? `On-order request ${order.order_number} sent to the System Administrator`
        : `Order ${order.order_number} placed from ready stock`
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Checkout failed' });
  }
});

function ownOrder(req, res) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND customer_id = ?').get(req.params.id, req.customer.customer_id);
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return null;
  }
  return order;
}

// GET /api/portal/orders
router.get('/orders', authenticateCustomer, requireApprovedCustomer, (req, res) => {
  const orders = db.prepare(`
    SELECT id, order_number, order_date, status, operational_status, order_type, total_pieces,
      expected_weight, delivered_pieces, delivered_weight, silver_rate, silver_amount, labour_amount,
      gst_amount, total_amount, payment_status, paid_amount, delivery_charge, discount_amount, payment_plan, created_at,
      (SELECT COUNT(*) FROM shipment_images si WHERE si.order_id = orders.id) as image_count
    FROM orders WHERE customer_id = ?
    ORDER BY created_at DESC
  `).all(req.customer.customer_id);
  res.json({ orders });
});

// GET /api/portal/orders/:id
router.get('/orders/:id', authenticateCustomer, requireApprovedCustomer, (req, res) => {
  const order = ownOrder(req, res);
  if (!order) return;
  const items = db.prepare(`
    SELECT oi.*, p.name as product_name, p.sku as product_sku, p.image_path
    FROM order_items oi JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id = ? ORDER BY oi.created_at ASC
  `).all(order.id);
  const payments = db.prepare('SELECT id, amount, method, status, gateway_ref, created_at FROM payments WHERE order_id = ? ORDER BY created_at DESC').all(order.id);
  // Bill, package and shipment photos the team uploaded for this order
  const images = db.prepare(`
    SELECT id, file_path, COALESCE(image_type, 'shipment') as image_type, caption, created_at
    FROM shipment_images WHERE order_id = ? ORDER BY created_at ASC
  `).all(order.id);
  res.json({ order, items, payments, images, payment_options: paymentOptions(order) });
});

// GET /api/portal/payment-config
router.get('/payment-config', authenticateCustomer, (req, res) => {
  const targetBrand = resolveRequestBrand(req);
  const rzp = getRazorpayConfig();
  const isOraani = targetBrand === 'ORAANI' || (req.customer && req.customer.brand === 'ORAANI');
  res.json({
    brand: targetBrand,
    razorpay_enabled: Boolean(isOraani && rzp.is_active),
    razorpay_key_id: isOraani && rzp.is_active ? (rzp.key_id || 'rzp_test_simulated') : null,
    is_test_mode: rzp.is_test_mode,
    is_configured: rzp.is_configured
  });
});

// POST /api/portal/orders/:id/pay (Standard / dummy payment gateway for AI925 and non-Razorpay flows)
router.post('/orders/:id/pay', authenticateCustomer, requireApprovedCustomer, (req, res) => {
  const order = ownOrder(req, res);
  if (!order) return;
  const { method, plan } = req.body;
  if (!PAYMENT_METHODS.includes(method) || method === 'CASH') {
    return res.status(400).json({ error: 'Choose UPI, Card or Net Banking' });
  }
  try {
    const payment = payWithPlan({ order, method, plan, paidByType: 'CUSTOMER', paidById: req.customer.id });
    res.status(201).json({ payment, order: db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id), message: 'Payment successful' });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Payment failed' });
  }
});

// POST /api/portal/orders/:id/razorpay/create-order (Generate Razorpay Order — strictly for Oraani)
router.post('/orders/:id/razorpay/create-order', authenticateCustomer, requireApprovedCustomer, async (req, res) => {
  const order = ownOrder(req, res);
  if (!order) return;

  const orderBrand = String(order.brand || 'AI925').toUpperCase();
  if (orderBrand !== 'ORAANI') {
    return res.status(403).json({ error: 'Razorpay payment is only available for Oraani brand orders.' });
  }

  const { plan } = req.body;
  const options = paymentOptions(order);
  let amountRupees = options.due;

  if (options.choices) {
    if (plan === 'FULL') {
      amountRupees = options.full.amount;
    } else {
      amountRupees = options.advance.amount;
    }
  }

  if (!(amountRupees > 0)) {
    return res.status(400).json({ error: 'This order is already fully paid.' });
  }

  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(order.customer_id);
    const rzpOrder = await createRazorpayOrder({
      order,
      amountRupees,
      receipt: order.order_number,
      notes: {
        plan: options.choices ? (plan === 'FULL' ? 'FULL' : 'ADVANCE') : 'STANDARD',
        customer_id: order.customer_id
      }
    });

    res.json({
      razorpay_order_id: rzpOrder.id,
      amount: rzpOrder.amount, // in paise
      currency: rzpOrder.currency,
      key_id: rzpOrder.key_id,
      order_id: order.id,
      order_number: order.order_number,
      brand: 'ORAANI',
      is_simulated: rzpOrder.is_simulated,
      customer: {
        name: (customer && customer.poc_name) || req.customer.full_name,
        phone: (customer && customer.phone) || req.customer.phone,
        email: (customer && customer.email) || req.customer.email || ''
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to initiate Razorpay payment' });
  }
});

// POST /api/portal/orders/:id/razorpay/verify (Verify HMAC signature & record payment — strictly for Oraani)
router.post('/orders/:id/razorpay/verify', authenticateCustomer, requireApprovedCustomer, (req, res) => {
  const order = ownOrder(req, res);
  if (!order) return;

  const orderBrand = String(order.brand || 'AI925').toUpperCase();
  if (orderBrand !== 'ORAANI') {
    return res.status(403).json({ error: 'Razorpay is only available for Oraani brand orders.' });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan } = req.body;
  if (!razorpay_payment_id) {
    return res.status(400).json({ error: 'Missing Razorpay payment ID' });
  }

  const isValid = verifyPaymentSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature });
  if (!isValid) {
    return res.status(400).json({ error: 'Invalid Razorpay payment signature. Payment cannot be verified.' });
  }

  try {
    const payment = payWithPlan({
      order,
      method: 'RAZORPAY',
      plan,
      paidByType: 'CUSTOMER',
      paidById: req.customer.id,
      gatewayRef: razorpay_payment_id
    });

    const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
    res.status(200).json({
      payment,
      order: updated,
      message: 'Payment completed and verified successfully!'
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Payment processing failed' });
  }
});

// POST /api/portal/razorpay/webhook (Asynchronous webhook notifications from Razorpay)
router.post('/razorpay/webhook', (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const rawBody = req.rawBody || JSON.stringify(req.body);
  const isValid = verifyWebhookSignature(rawBody, signature);
  const config = getRazorpayConfig();

  if (!isValid && config.webhook_secret) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  const event = req.body && req.body.event;
  const paymentObj = req.body && req.body.payload && req.body.payload.payment && req.body.payload.payment.entity;

  if (event === 'payment.captured' && paymentObj) {
    const orderId = paymentObj.notes && paymentObj.notes.order_id;
    const paymentId = paymentObj.id;
    if (orderId && paymentId) {
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      if (order && order.brand === 'ORAANI') {
        const existing = db.prepare('SELECT * FROM payments WHERE gateway_ref = ?').get(paymentId);
        if (!existing) {
          const plan = paymentObj.notes && paymentObj.notes.plan;
          payWithPlan({
            order,
            method: 'RAZORPAY',
            plan: plan !== 'STANDARD' ? plan : undefined,
            paidByType: 'CUSTOMER',
            paidById: paymentObj.notes?.customer_id || null,
            gatewayRef: paymentId
          });
        }
      }
    }
  }

  res.status(200).json({ status: 'ok' });
});

// GET /api/portal/delivery-quote?amount=&weight_grams= (delivery charge for this customer's PIN code / weight slab at an order value)
router.get('/delivery-quote', authenticateCustomer, requireApprovedCustomer, (req, res) => {
  const account = db.prepare('SELECT * FROM customer_accounts WHERE id = ?').get(req.customer.id);
  const customer = account.customer_id ? db.prepare('SELECT * FROM customers WHERE id = ?').get(account.customer_id) : null;
  const amount = parseFloat(req.query.amount) || 0;
  const weightGrams = parseFloat(req.query.weight_grams) || 0;
  res.json({
    delivery: deliveryChargeFor({ pin: customerPin(account, customer), zone: customer ? customer.zone : null, orderValue: amount, weightGrams }),
    payment_terms: getPaymentTerms()
  });
});

// POST /api/portal/profile-requests { full_name?, company_name?, phone?, email?, address?, pin_code?, current_password, new_password? }
// Nothing changes until an administrator approves; one request can be pending at a time.
router.post('/profile-requests', authenticateCustomer, (req, res) => {
  const account = db.prepare('SELECT * FROM customer_accounts WHERE id = ?').get(req.customer.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  if (account.status !== 'APPROVED') {
    return res.status(403).json({ error: 'You can change your details once your profile is verified' });
  }
  const pending = db.prepare("SELECT id FROM customer_change_requests WHERE customer_account_id = ? AND status = 'PENDING'").get(account.id);
  if (pending) {
    return res.status(400).json({ error: 'You already have a change waiting for approval' });
  }

  const body = req.body || {};
  if (!bcrypt.compareSync(String(body.current_password || ''), account.password_hash)) {
    return res.status(400).json({ error: 'Your current password is not correct' });
  }

  const changes = {};
  const setIfChanged = (field, value) => {
    if (value !== undefined && value !== null && value !== (account[field] || '')) changes[field] = value;
  };
  if (body.full_name !== undefined) {
    const v = String(body.full_name).trim();
    if (!v) return res.status(400).json({ error: 'Name is required' });
    setIfChanged('full_name', v);
  }
  if (body.company_name !== undefined) setIfChanged('company_name', String(body.company_name).trim());
  if (body.address !== undefined) {
    const v = String(body.address).trim();
    if (!v) return res.status(400).json({ error: 'Address is required' });
    setIfChanged('address', v);
  }
  if (body.pin_code !== undefined && String(body.pin_code).trim() !== '') {
    const pin = normalizePin(body.pin_code);
    if (!pin) return res.status(400).json({ error: 'Enter a valid 6-digit PIN code' });
    setIfChanged('pin_code', pin);
  }
  if (body.phone !== undefined) {
    const phone = normalizePhone(body.phone);
    if (phone.length < 10 || phone.length > 13) return res.status(400).json({ error: 'Enter a valid mobile number (10 digits)' });
    if (phone !== account.phone && db.prepare('SELECT 1 FROM customer_accounts WHERE phone = ? AND id != ?').get(phone, account.id)) {
      return res.status(400).json({ error: 'Another account already uses this mobile number' });
    }
    setIfChanged('phone', phone);
  }
  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
    if (email !== account.email && db.prepare('SELECT 1 FROM customer_accounts WHERE LOWER(email) = ? AND id != ?').get(email, account.id)) {
      return res.status(400).json({ error: 'Another account already uses this email' });
    }
    setIfChanged('email', email);
  }

  const newPassword = String(body.new_password || '');
  if (newPassword && newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  if (Object.keys(changes).length === 0 && !newPassword) {
    return res.status(400).json({ error: 'Nothing has changed' });
  }

  db.prepare(`
    INSERT INTO customer_change_requests (id, customer_account_id, changes, password_enc, password_hash, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'PENDING', ?)
  `).run(newId('chg'), account.id, JSON.stringify(changes),
    newPassword ? encrypt(newPassword) : null, newPassword ? bcrypt.hashSync(newPassword, 10) : null, new Date().toISOString());

  res.status(201).json({ account: publicAccount(account.id), message: 'Sent for approval. Your details change once an administrator approves.' });
});

// DELETE /api/portal/profile-requests/pending (withdraw a change that is still waiting)
router.delete('/profile-requests/pending', authenticateCustomer, (req, res) => {
  db.prepare("DELETE FROM customer_change_requests WHERE customer_account_id = ? AND status = 'PENDING'").run(req.customer.id);
  res.json({ account: publicAccount(req.customer.id) });
});

const CALL_SLOTS = ['Morning (10am-1pm)', 'Afternoon (1pm-4pm)', 'Evening (4pm-7pm)'];

// POST /api/portal/call-bookings { phone, preferred_date, preferred_slot, notes } ("Book a call" for a customised order)
router.post('/call-bookings', authenticateCustomer, requireApprovedCustomer, (req, res) => {
  const account = db.prepare('SELECT * FROM customer_accounts WHERE id = ?').get(req.customer.id);
  const phone = normalizePhone(req.body.phone || account.phone);
  if (phone.length < 10 || phone.length > 13) {
    return res.status(400).json({ error: 'Enter a valid mobile number to call you on' });
  }
  const date = String(req.body.preferred_date || '').trim();
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < new Date().toISOString().split('T')[0])) {
    return res.status(400).json({ error: 'Choose today or a later date' });
  }
  const slot = CALL_SLOTS.includes(req.body.preferred_slot) ? req.body.preferred_slot : null;
  const notes = String(req.body.notes || '').trim().substring(0, 1000);
  if (!notes) {
    return res.status(400).json({ error: 'Tell us briefly what you would like made' });
  }
  const id = newId('call');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO call_bookings (id, customer_account_id, phone, preferred_date, preferred_slot, notes, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
  `).run(id, account.id, phone, date || null, slot, notes, now, now);
  res.status(201).json({
    booking: db.prepare('SELECT * FROM call_bookings WHERE id = ?').get(id),
    message: 'Call booked. Our team will call you to discuss your customised order.'
  });
});

// GET /api/portal/call-bookings
router.get('/call-bookings', authenticateCustomer, requireApprovedCustomer, (req, res) => {
  const bookings = db.prepare('SELECT * FROM call_bookings WHERE customer_account_id = ? ORDER BY created_at DESC').all(req.customer.id);
  res.json({ bookings, slots: CALL_SLOTS });
});

module.exports = router;
