const assert = require('assert');
const { db } = require('../server/db/database');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../server/middleware/auth');

console.log('========================================================');
console.log(' RUNNING AUTOMATED BUSINESS LOGIC & SECURITY SUITE');
console.log('========================================================\n');

let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       Error: ${err.message}\n`);
    failedTests++;
  }
}

// 1. INVENTORY & PRODUCT TESTS
runTest('Inventory: Physical stock and reserved stock calculation', () => {
  const prod = db.prepare('SELECT * FROM products WHERE sku = ?').get('CH018_20');
  assert(prod, 'Product CH018_20 must exist');
  assert(prod.physical_stock > 0, 'Physical stock must be positive');
  assert(prod.reserved_stock >= 0, 'Reserved stock must be non-negative');
  const available = prod.physical_stock - prod.reserved_stock;
  assert(available >= 0, 'Available-to-promise stock must be non-negative');
});

runTest('Inventory: Product custom attributes and lock types', () => {
  const attrs = db.prepare('SELECT * FROM custom_attributes').all();
  assert(attrs.length >= 3, 'Must have at least Wire Size, Endings, Lock Type attributes');
  const lockTypes = ['Fish Lock', 'Spring Lock'];
  const prod = db.prepare('SELECT * FROM products WHERE sku = ?').get('CH018_20');
  assert(lockTypes.includes(prod.lock_type), 'Lock type must be Fish Lock or Spring Lock');
});

// 2. ORDER TESTS & PARTIAL ALLOCATION
runTest('Orders: Expected weight formula is accurately calculated', () => {
  // Test case: 18 inches, 20g per 20in std weight, 75 pieces
  // Formula: (18 / 20) * 20 * 75 = 1350.0g
  const size = 18.0;
  const stdWeight = 20.0;
  const pieces = 75;
  const expWeight = (size / 20.0) * stdWeight * pieces;
  assert.strictEqual(expWeight, 1350.0, 'Expected weight for 75 pcs @ 18 in should be exactly 1350g');

  // Verify Order #7094 has exactly this in the database
  const item = db.prepare(`
    SELECT oi.* FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.order_number = '#7094' AND oi.size_inches = 18
  `).get();
  assert(item, 'Order item in #7094 must exist');
  assert.strictEqual(item.requested_pieces, 75, 'Requested pieces must be 75');
  assert.strictEqual(item.expected_weight, 1350.0, 'Expected weight must match 1350.0g');
});

runTest('Orders: Partial fulfillment tracks actual delivered weight independently', () => {
  const item = db.prepare(`
    SELECT oi.* FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.order_number = '#7094' AND oi.size_inches = 18
  `).get();
  assert.strictEqual(item.delivered_pieces, 50, 'Delivered pieces should be 50');
  assert.strictEqual(item.delivered_weight, 90.0, 'Actual delivered weight recorded should be 90.0g');
  const remaining = item.requested_pieces - item.delivered_pieces;
  assert.strictEqual(remaining, 25, 'Remaining outstanding pieces must be 25');
});

runTest('Orders: Delivery dispatch updates order status correctly', () => {
  const ord4930 = db.prepare("SELECT * FROM orders WHERE order_number = '#4930'").get();
  assert(ord4930, 'Order #4930 must exist');
  assert.strictEqual(ord4930.status, 'IN_PROGRESS', 'Partially delivered order must be IN_PROGRESS');
  assert.strictEqual(ord4930.delivered_pieces, 65, 'Delivered pieces must be 65');
  assert.strictEqual(ord4930.total_pieces, 85, 'Total pieces must be 85');
});

// 3. SALES REPRESENTATIVE SECURITY & ISOLATION TESTS
runTest('Security: Password hashing verification for Admin and Sales Rep', () => {
  const admin = db.prepare("SELECT * FROM users WHERE username = 'admin'").get();
  assert(bcrypt.compareSync('925925', admin.pin_hash), 'Admin PIN hash must verify with 925925');

  const repRavi = db.prepare("SELECT * FROM users WHERE username = 'rep_ravi'").get();
  assert(bcrypt.compareSync('123456', repRavi.pin_hash), 'Rep Ravi PIN hash must verify with 123456');
});

runTest('Security: Sales Rep isolation query constraint', () => {
  const repRavi = db.prepare("SELECT * FROM users WHERE username = 'rep_ravi'").get();
  const repGaurav = db.prepare("SELECT * FROM users WHERE username = 'rep_gaurav'").get();

  // Test orders accessible to Ravi:
  const raviOrders = db.prepare(`
    SELECT * FROM orders WHERE creator_id = ? OR sales_rep_id = ?
  `).all(repRavi.id, repRavi.id);

  // Test orders accessible to Gaurav:
  const gauravOrders = db.prepare(`
    SELECT * FROM orders WHERE creator_id = ? OR sales_rep_id = ?
  `).all(repGaurav.id, repGaurav.id);

  // Ensure Ravi cannot see Gaurav's exclusive orders
  const raviOrderIds = new Set(raviOrders.map(o => o.id));
  const hasGauravSpecificOrder = raviOrderIds.has('ord_7094');
  assert(!hasGauravSpecificOrder, "Security breach: Representative Ravi must NOT have access to Representative Gaurav's order #7094");
});

// 4. PIN CODE CACHE & REGION MAPPING TESTS
runTest('Pincode: Local SQLite cache resolution for offline mode', () => {
  const cached = db.prepare('SELECT * FROM pin_code_cache WHERE pin_code = ?').get('509001');
  assert(cached, 'PIN 509001 must be cached');
  assert.strictEqual(cached.city, 'Mahabub Nagar');
  assert.strictEqual(cached.state, 'Telangana');
  assert.strictEqual(cached.zone, 'South');
});

// 5. DATABASE INTEGRITY & WAL MODE
runTest('Database: WAL journal mode and Foreign Keys enforced', () => {
  const journalMode = db.pragma('journal_mode', { simple: true });
  assert.strictEqual(journalMode.toLowerCase(), 'wal', 'Database journal mode must be WAL');

  const foreignKeys = db.pragma('foreign_keys', { simple: true });
  assert.strictEqual(foreignKeys, 1, 'Foreign keys must be enabled');

  const integrityCheck = db.pragma('integrity_check', { simple: true });
  assert.strictEqual(integrityCheck, 'ok', 'SQLite integrity check must return ok');
});

console.log('\n--------------------------------------------------------');
console.log(` SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('--------------------------------------------------------\n');

if (failedTests > 0) {
  process.exit(1);
}
