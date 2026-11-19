const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { db } = require('../server/db/database');
const { deleteCustomerCompletely } = require('../server/services/customerCascade');

console.log('=== RUNNING TESTS FOR CUSTOMER CASCADE WIPE & PWA BRAND ICONS ===');

// Test 1: PWA Asset verification
console.log('\n>>> Testing PWA Manifests and Brand Icons...');
const publicDir = path.resolve(__dirname, '../client/public');

const aiManifestPath = path.join(publicDir, 'manifest.json');
const oraaniManifestPath = path.join(publicDir, 'oraani-manifest.json');

assert(fs.existsSync(aiManifestPath), 'manifest.json must exist');
assert(fs.existsSync(oraaniManifestPath), 'oraani-manifest.json must exist');

const aiManifest = JSON.parse(fs.readFileSync(aiManifestPath, 'utf8'));
const oraaniManifest = JSON.parse(fs.readFileSync(oraaniManifestPath, 'utf8'));

assert.strictEqual(aiManifest.short_name, 'AI925');
assert(aiManifest.icons.some(i => i.src === '/icon-512.png'));
console.log('[PASS] AI 925 manifest verified with AI925 icons');

assert.strictEqual(oraaniManifest.name, 'Oraani');
assert.strictEqual(oraaniManifest.start_url, '/oraani');
assert(oraaniManifest.icons.some(i => i.src === '/oraani-icon-512.png'));
assert(oraaniManifest.icons.some(i => i.src === '/oraani-icon-192.png'));
console.log('[PASS] Oraani manifest verified with Oraani icons and /oraani start_url');

assert(fs.existsSync(path.join(publicDir, 'oraani-icon-512.png')), 'oraani-icon-512.png must exist');
assert(fs.existsSync(path.join(publicDir, 'oraani-icon-192.png')), 'oraani-icon-192.png must exist');
assert(fs.existsSync(path.join(publicDir, 'oraani-apple-touch-icon.png')), 'oraani-apple-touch-icon.png must exist');
console.log('[PASS] All Oraani PNG icon files present in public folder');

// Test 2: Foreign Key Cascade Wipe Simulation (the exact error scenario reported by user)
console.log('\n>>> Testing Cascade Wipe on Customer Account Deletion without Foreign Key Error...');

const testPhone = '98' + Math.floor(10000000 + Math.random() * 90000000);
const testEmail = 'priya_' + Date.now() + '@example.com';
const now = new Date().toISOString();

// Setup:
// 1. Create a customer in customers table
const testCustId = 'cust_test_cascade_' + Date.now();
db.prepare(`
  INSERT INTO customers (id, company_name, poc_name, phone, email, state, created_at, updated_at)
  VALUES (?, 'Test Cascade Jewels', 'Priya Shah', ?, ?, 'Maharashtra', ?, ?)
`).run(testCustId, testPhone, testEmail, now, now);

// 2. Create customer account in customer_accounts with status PENDING and customer_id = NULL
// (this reproduces the exact bug where account.customer_id is null but customer with cleanPhone exists and has orders)
const testAcctId = 'acct_test_cascade_' + Date.now();
db.prepare(`
  INSERT INTO customer_accounts (id, full_name, company_name, phone, email, password_hash, address, status, brand, created_at, updated_at)
  VALUES (?, 'Priya Shah', 'Test Cascade Jewels', ?, ?, 'dummyhash123', 'Mumbai', 'PENDING', 'ORAANI', ?, ?)
`).run(testAcctId, testPhone, testEmail, now, now);

// 3. Create orders, order_items, deliveries, delivery_items, payments, shipment_images, inventory_movements for this customer
const testOrdId = 'ord_test_cascade_' + Date.now();
const testItem = 'item_test_cascade_' + Date.now();
const testDel = 'del_test_cascade_' + Date.now();

// Find an existing user and product to satisfy FK
const user = db.prepare('SELECT id FROM users LIMIT 1').get();
const prod = db.prepare('SELECT id FROM products LIMIT 1').get();

const testOrdNum = '#' + Math.floor(100000 + Math.random() * 900000);

db.prepare(`
  INSERT INTO orders (id, order_number, customer_id, creator_id, sales_rep_id, status, operational_status, total_pieces, expected_weight, silver_rate, total_amount, payment_status, order_date, created_at, updated_at, brand)
  VALUES (?, ?, ?, ?, ?, 'OPEN', 'Pending', 1, 10, 80, 1000, 'UNPAID', '2026-11-20', ?, ?, 'ORAANI')
`).run(testOrdId, testOrdNum, testCustId, user.id, user.id, now, now);

db.prepare(`
  INSERT INTO order_items (id, order_id, product_id, size_inches, requested_pieces, allocated_pieces, expected_weight, unit_weight, labour_per_gram, line_amount, created_at)
  VALUES (?, ?, ?, 20, 1, 1, 10, 10, 10, 1000, ?)
`).run(testItem, testOrdId, prod.id, now);

db.prepare(`
  INSERT INTO deliveries (id, order_id, dispatched_by_id, tracking_number, courier_name, delivery_date, created_at)
  VALUES (?, ?, ?, 'TRACK123', 'BlueDart', '2026-11-20', ?)
`).run(testDel, testOrdId, user.id, now);

const rid = () => Math.random().toString(36).substring(2, 8);

db.prepare(`
  INSERT INTO delivery_items (id, delivery_id, order_item_id, delivered_pieces, actual_weight_g)
  VALUES (?, ?, ?, 1, 10.0)
`).run('ditem_' + rid(), testDel, testItem);

db.prepare(`
  INSERT INTO payments (id, order_id, amount, method, status, gateway_ref, paid_by_type, created_at)
  VALUES (?, ?, 500, 'CASH', 'SUCCESS', 'REF123', 'STAFF', ?)
`).run('pay_' + rid(), testOrdId, now);

db.prepare(`
  INSERT INTO shipment_images (id, order_id, delivery_id, file_path, original_filename, mime_type, file_size, uploaded_by_id, created_at)
  VALUES (?, ?, ?, '/uploads/test.jpg', 'test.jpg', 'image/jpeg', 1024, ?, ?)
`).run('img_' + rid(), testOrdId, testDel, user.id, now);

db.prepare(`
  INSERT INTO inventory_movements (id, product_id, movement_type, change_qty, related_order_id, user_id, created_at)
  VALUES (?, ?, 'ALLOCATION', -1, ?, ?, ?)
`).run('mov_' + rid(), prod.id, testOrdId, user.id, now);

console.log('Setup completed: Customer, Account (customer_id=NULL), Orders, Deliveries, Movements created.');

// Now execute the deletion using deleteCustomerCompletely!
const wipeResult = deleteCustomerCompletely({ customerAccountId: testAcctId, phone: testPhone });
console.log('Cascade deletion executed successfully:', wipeResult);

// Verify everything is deleted and no dangling records exist
const checkAcct = db.prepare('SELECT id FROM customer_accounts WHERE id = ?').get(testAcctId);
const checkCust = db.prepare('SELECT id FROM customers WHERE id = ?').get(testCustId);
const checkOrd = db.prepare('SELECT id FROM orders WHERE id = ?').get(testOrdId);
const checkItem = db.prepare('SELECT id FROM order_items WHERE id = ?').get(testItem);
const checkDel = db.prepare('SELECT id FROM deliveries WHERE id = ?').get(testDel);

assert(!checkAcct, 'Customer account must be completely deleted');
assert(!checkCust, 'Customer record must be completely deleted');
assert(!checkOrd, 'Order record must be completely deleted');
assert(!checkItem, 'Order items must be completely deleted');
assert(!checkDel, 'Deliveries must be completely deleted');

console.log('[PASS] Full cascade deletion completed without SqliteError FOREIGN KEY constraint failed');

// 4. Verify customer can immediately sign up as new with the same phone
const newAcctId = 'acct_new_' + Date.now();
db.prepare(`
  INSERT INTO customer_accounts (id, full_name, company_name, phone, email, password_hash, address, status, brand, created_at, updated_at)
  VALUES (?, 'Priya Shah New', 'New Firm', ?, 'priya.new@example.com', 'dummyhash123', 'Mumbai', 'PENDING', 'ORAANI', ?, ?)
`).run(newAcctId, testPhone, now, now);

const verifiedNew = db.prepare('SELECT id, status FROM customer_accounts WHERE phone = ?').get(testPhone);
assert(verifiedNew && verifiedNew.id === newAcctId, 'Customer successfully signed up as brand new with the same phone');
console.log('[PASS] Same phone number is immediately available for new sign-up and approval');

// Clean up test new account
db.prepare('DELETE FROM customer_accounts WHERE id = ?').run(newAcctId);

console.log('\n=== ALL TESTS PASSED PERFECTLY! ===');
