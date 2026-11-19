// Customer account type, section visibility, presence / last location, and the Whole Inventory API.
// Runs against a throwaway database so the real data folder is never touched.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ai925-test-'));
process.env.AI925_DATA_DIR = TMP_DIR;
process.env.AI925_DISABLE_RATE_FETCH = '1';

const express = require('express');
const { db } = require('../server/db/database');
const { seedDatabase } = require('../server/db/seed');
const { generateToken } = require('../server/middleware/auth');

seedDatabase();

const app = express();
app.use(express.json());
app.use('/api/portal', require('../server/routes/portal'));
app.use('/api/requests', require('../server/routes/requests'));
app.use('/api/customers', require('../server/routes/customers'));
app.use('/api/inventory', require('../server/routes/inventory'));

const admin = db.prepare("SELECT * FROM users WHERE role = 'ADMIN'").get();
const bizAdmin = db.prepare("SELECT * FROM users WHERE role = 'BUSINESS_ADMIN'").get();
const rep = db.prepare("SELECT * FROM users WHERE role = 'SALES_REP'").get();
const adminToken = generateToken(admin);
const bizToken = generateToken(bizAdmin);
const repToken = generateToken(rep);

let baseUrl;
async function call(method, url, token, body, isForm) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !isForm) headers['Content-Type'] = 'application/json';
  const res = await fetch(baseUrl + url, { method, headers, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

function signupForm(overrides = {}) {
  const fd = new FormData();
  const fields = {
    full_name: 'Asha Test', company_name: 'Asha Silver', phone: '9123456780', email: 'asha.test@example.com',
    address: '12 MG Road', pin_code: '400001', password: 'secret123', account_type: 'Wholesaler', ...overrides
  };
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) fd.append(k, v);
  return fd;
}

async function run() {
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  let passed = 0;
  const ok = (msg) => { passed++; console.log('  ✓', msg); };

  try {
    // ---- Account type at sign-up ----
    let r = await call('POST', '/api/portal/register', null, signupForm({ account_type: undefined }), true);
    assert.strictEqual(r.status, 400);
    r = await call('POST', '/api/portal/register', null, signupForm({ account_type: 'Distributor' }), true);
    assert.strictEqual(r.status, 400);
    ok('sign-up without a valid account type is rejected');

    r = await call('POST', '/api/portal/register', null, signupForm(), true);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.account.account_type, 'Wholesaler');
    assert.strictEqual(r.body.account.can_view_ready, true);
    assert.strictEqual(r.body.account.can_view_order, true);
    const customerToken = r.body.token;
    const accountId = r.body.account.id;
    ok('sign-up stores Retailer / Wholesaler / Both');

    // ---- Visibility chosen at verification ----
    r = await call('POST', `/api/requests/customer-accounts/${accountId}/approve`, adminToken, { can_view_ready: 'yes' });
    assert.strictEqual(r.status, 400);
    r = await call('POST', `/api/requests/customer-accounts/${accountId}/approve`, adminToken, { can_view_ready: true, can_view_order: false });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.account.status, 'APPROVED');
    assert.strictEqual(r.body.account.can_view_order, false);
    const customerId = r.body.account.customer_id;
    assert.strictEqual(db.prepare('SELECT category FROM customers WHERE id = ?').get(customerId).category, 'Wholesaler');
    ok('approval saves the visibility choice and the account type as the customer category');

    r = await call('GET', '/api/portal/products?mode=order', customerToken);
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.body.section_closed, true);
    r = await call('GET', '/api/portal/products?mode=ready', customerToken);
    assert.strictEqual(r.status, 200);
    r = await call('POST', '/api/portal/checkout', customerToken, { mode: 'ON_ORDER', items: [{ product_id: 'x', size_inches: 20, pieces: 1 }] });
    assert.strictEqual(r.status, 403);
    ok('a closed section is blocked for catalog and checkout');

    // ---- Modifiable later, by either administrator; never by a sales rep ----
    r = await call('PUT', `/api/requests/customer-accounts/${accountId}/access`, repToken, { can_view_order: true });
    assert.strictEqual(r.status, 403);
    r = await call('PUT', `/api/requests/customer-accounts/${accountId}/access`, bizToken, { can_view_order: true, can_view_ready: false });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    r = await call('GET', '/api/portal/products?mode=order', customerToken);
    assert.strictEqual(r.status, 200);
    r = await call('GET', '/api/portal/products?mode=ready', customerToken);
    assert.strictEqual(r.status, 403);
    r = await call('GET', '/api/portal/me', customerToken);
    assert.strictEqual(r.body.account.can_view_ready, false);
    ok('Business Administrator changes visibility later; sales reps cannot');

    // ---- Presence and last location ----
    db.prepare('UPDATE customer_accounts SET last_seen_at = NULL WHERE id = ?').run(accountId);
    r = await call('POST', '/api/portal/presence', customerToken, { latitude: 123, longitude: 72 });
    assert.strictEqual(r.status, 400);
    r = await call('POST', '/api/portal/presence', customerToken, { latitude: 19.076, longitude: 72.8777 });
    assert.strictEqual(r.status, 200);
    r = await call('GET', `/api/requests/customer-accounts/by-customer/${customerId}`, adminToken);
    assert.strictEqual(r.body.account.online, true);
    assert.strictEqual(r.body.account.last_latitude, 19.076);
    r = await call('GET', '/api/customers', adminToken);
    assert.strictEqual(r.body.customers.find(c => c.id === customerId).portal_online, true);
    r = await call('GET', '/api/customers', repToken);
    assert.ok(r.body.customers.every(c => c.portal_online === undefined));
    db.prepare('UPDATE customer_accounts SET last_seen_at = ? WHERE id = ?').run(new Date(Date.now() - 5 * 60 * 1000).toISOString(), accountId);
    r = await call('GET', '/api/customers', adminToken);
    assert.strictEqual(r.body.customers.find(c => c.id === customerId).portal_online, false);
    ok('presence marks the customer online, records last location, and goes offline after 2 minutes');

    // ---- Whole Inventory ----
    r = await call('GET', '/api/inventory', repToken);
    assert.strictEqual(r.status, 403);
    ok('sales reps cannot open Whole Inventory');

    const product = db.prepare("SELECT * FROM products WHERE status = 'active' LIMIT 1").get();
    db.prepare('DELETE FROM product_variants WHERE product_id = ?').run(product.id);
    const now = new Date().toISOString();
    db.prepare("INSERT INTO product_variants (id, product_id, std_weight_g, size_inches, weight_g, stock_qty, created_at, updated_at) VALUES ('var_t1', ?, 1.5, 20, 1.5, 9, ?, ?)").run(product.id, now, now);
    db.prepare("INSERT INTO product_variants (id, product_id, std_weight_g, size_inches, weight_g, stock_qty, created_at, updated_at) VALUES ('var_t2', ?, 1.5, 22, 1.65, 14, ?, ?)").run(product.id, now, now);

    r = await call('GET', '/api/inventory', bizToken);
    assert.strictEqual(r.status, 200);
    const chain = r.body.chains.find(c => c.product_id === product.id);
    assert.strictEqual(chain.rows.length, 2);
    assert.strictEqual(chain.total_pieces, 23);
    assert.strictEqual(chain.total_weight_g, 36.6); // 1.5 × 9 + 1.65 × 14
    const expectedTotal = r.body.chains.reduce((s, c) => s + c.rows.reduce((t, row) => t + row.unit_weight_g * row.stock_qty, 0), 0);
    assert.ok(Math.abs(r.body.totals.weight_g - expectedTotal) < 0.01);
    ok('inventory lists chain → weight → size → pieces with Σ(unit weight × qty)');

    r = await call('PUT', '/api/inventory', adminToken, { updates: [{ product_id: product.id, std_weight_g: 1.5, size_inches: 20, stock_qty: -1 }] });
    assert.strictEqual(r.status, 400);
    r = await call('PUT', '/api/inventory', adminToken, { updates: [
      { product_id: product.id, std_weight_g: 1.5, size_inches: 20, stock_qty: 12 },
      { product_id: product.id, std_weight_g: 2, size_inches: 24, stock_qty: 5 }
    ] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const updated = r.body.chains.find(c => c.product_id === product.id);
    assert.strictEqual(updated.total_pieces, 31);
    assert.strictEqual(db.prepare('SELECT physical_stock, reserved_stock FROM products WHERE id = ?').get(product.id).physical_stock,
      31 + (product.reserved_stock || 0));
    assert.ok(db.prepare("SELECT 1 FROM inventory_movements WHERE product_id = ? AND reason LIKE 'Whole Inventory edit%'").get(product.id));
    ok('editing sets exact counts, adds new rows, updates overall stock and the movement ledger');

    console.log(`\nPortal access & Whole Inventory: ${passed} checks passed`);
  } finally {
    server.close();
    db.close();
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }
}

run().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
