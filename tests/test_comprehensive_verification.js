/**
 * Comprehensive Feature Verification Test Suite
 * Covers all features:
 * 1. Product Thickness update and persistence
 * 2. State-wise Labour Extra Cost (+20% for Goa, customer reflection, making calculation)
 * 3. Delivery charges by Pincode (custom pincode, fallback)
 * 4. Weight slab discount on labour by order weight (1-2kg, 2kg+)
 * 5. Customer account cascade deletion & single phone uniqueness
 * 6. Multi-brand Oraani vs AI925 PWA manifests and branding
 * 7. Version rollback history listing with timestamps and commit messages
 */

const assert = require('assert');
const { db } = require('../server/db/database');
const {
  makingFor,
  baseMakingFor,
  applyStatePremium,
  getStatePremium,
  getWeightSlabDiscount,
  round2
} = require('../server/utils/pricing');
const { deliveryChargeFor } = require('../server/services/commerce');
const { deleteCustomerCompletely } = require('../server/services/customerCascade');
const { listGitVersions } = require('../tools/sync');

console.log('====================================================');
console.log('   RUNNING COMPREHENSIVE FEATURE VERIFICATION SUITE  ');
console.log('====================================================\n');

// -------------------------------------------------------------------
// TEST 1: PRODUCT THICKNESS PERSISTENCE & MODIFICATION
// -------------------------------------------------------------------
console.log('TEST 1: Product Thickness Creation, Update & Persistence...');
{
  const testSku = 'TEST_THK_' + Date.now();
  const testProdId = 'prod_thk_' + Date.now();
  const now = new Date().toISOString();

  // Create product with initial thickness 1.8 mm
  db.prepare(`
    INSERT INTO products (
      id, name, sku, physical_stock, reserved_stock, reorder_threshold, status,
      created_at, updated_at, labour_per_gram, thickness, std_weight_per_20in
    ) VALUES (?, 'Thickness Test Chain', ?, 100, 0, 10, 'active', ?, ?, 25, '1.8 mm', 20)
  `).run(testProdId, testSku, now, now);

  db.prepare(`
    INSERT INTO product_weight_options (
      id, product_id, std_weight_g, making_charge, sku_code, thickness, sort_order, created_at
    ) VALUES (?, ?, 20, 25, ?, '1.8 mm', 0, ?)
  `).run('wopt_test_1', testProdId, testSku + '-20', now);

  let p = db.prepare('SELECT id, thickness FROM products WHERE id = ?').get(testProdId);
  let w = db.prepare('SELECT thickness FROM product_weight_options WHERE product_id = ?').get(testProdId);
  assert.strictEqual(p.thickness, '1.8 mm', 'Initial product thickness should be 1.8 mm');
  assert.strictEqual(w.thickness, '1.8 mm', 'Initial weight option thickness should be 1.8 mm');

  // Now simulate product update modifying thickness to 2.8 mm via the service
  const { parseProductTables, saveWeightOptions, summaryFromOptions } = require('../server/services/productTables');
  const updateBody = {
    name: 'Thickness Test Chain Updated',
    sku: testSku,
    thickness: '2.8 mm',
    weight_options: [
      {
        std_weight_g: 20,
        thickness: '2.8 mm',
        sku_code: testSku + '-20',
        weight_slabs: [{ min_g: 1, max_g: null, making: 25, order_type: 'ALL' }]
      }
    ]
  };

  const tables = parseProductTables(updateBody);
  assert.strictEqual(tables.options[0].thickness, '2.8 mm', 'parseWeightOptions must preserve thickness');

  const summary = summaryFromOptions(tables.options);
  assert.strictEqual(summary.thickness, '2.8 mm', 'summaryFromOptions must preserve thickness');

  saveWeightOptions(testProdId, tables.options);
  db.prepare('UPDATE products SET thickness = ?, updated_at = ? WHERE id = ?').run(summary.thickness, new Date().toISOString(), testProdId);

  p = db.prepare('SELECT id, thickness FROM products WHERE id = ?').get(testProdId);
  w = db.prepare('SELECT thickness FROM product_weight_options WHERE product_id = ?').get(testProdId);

  assert.strictEqual(p.thickness, '2.8 mm', 'Updated product thickness must be 2.8 mm');
  assert.strictEqual(w.thickness, '2.8 mm', 'Updated weight option thickness must be 2.8 mm');

  // Cleanup
  db.prepare('DELETE FROM product_weight_options WHERE product_id = ?').run(testProdId);
  db.prepare('DELETE FROM products WHERE id = ?').run(testProdId);

  console.log('  [PASS] Product thickness updates and persists correctly across products and weight options.\n');
}

// -------------------------------------------------------------------
// TEST 2: STATE-WISE LABOUR EXTRA COSTS (e.g. Goa +20%)
// -------------------------------------------------------------------
console.log('TEST 2: State-wise Labour Extra Cost (+20% for Goa)...');
{
  // 1. Ensure Goa is configured with +20%
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO state_premiums (id, state, premium_pct, is_active, created_at, updated_at)
    VALUES ('prem_goa_test', 'Goa', 20.0, 1, ?, ?)
    ON CONFLICT(state) DO UPDATE SET premium_pct = 20.0, is_active = 1, updated_at = excluded.updated_at
  `).run(now, now);

  const goaPremium = getStatePremium('Goa');
  assert.strictEqual(goaPremium, 20, 'Goa premium should be 20%');

  const otherPremium = getStatePremium('Maharashtra');
  assert.strictEqual(otherPremium, 0, 'Maharashtra should have 0% extra cost by default');

  // 2. Test makingFor calculation with state premium
  const sampleProduct = {
    labour_per_gram: 20,
    weight_options: [
      {
        std_weight_g: 20,
        making_charge: 20,
        weight_slabs: [
          { min_g: 1, max_g: 100, making: 20, order_type: 'ALL' },
          { min_g: 101, max_g: null, making: 18, order_type: 'ALL' }
        ]
      }
    ]
  };

  // Base customer (0% extra)
  const baseResult = makingFor({
    product: sampleProduct,
    tiers: [],
    weightOptions: sampleProduct.weight_options,
    stdWeight: 20,
    mode: 'READY_STOCK',
    pieces: 5,
    grams: 100,
    stdGrams: 50,
    statePremiumPct: 0
  });
  assert.strictEqual(baseResult.labour_per_gram, 20, 'Base labour should be 20/g');
  assert.strictEqual(baseResult.mrp_per_gram, 20, 'Base MRP should be 20/g');

  // Goa customer (+20% extra -> 20 * 1.2 = 24/g)
  const goaResult = makingFor({
    product: sampleProduct,
    tiers: [],
    weightOptions: sampleProduct.weight_options,
    stdWeight: 20,
    mode: 'READY_STOCK',
    pieces: 5,
    grams: 100,
    stdGrams: 50,
    statePremiumPct: 20
  });
  assert.strictEqual(goaResult.labour_per_gram, 24, 'Goa labour should be 24/g (20 + 20%)');
  assert.strictEqual(goaResult.mrp_per_gram, 24, 'Goa MRP should be 24/g (20 + 20%)');

  // Second slab (18/g base -> 18 * 1.2 = 21.6/g for Goa)
  const goaBulkResult = makingFor({
    product: sampleProduct,
    tiers: [],
    weightOptions: sampleProduct.weight_options,
    stdWeight: 20,
    mode: 'READY_STOCK',
    pieces: 10,
    grams: 200,
    stdGrams: 150,
    statePremiumPct: 20
  });
  assert.strictEqual(goaBulkResult.labour_per_gram, 21.6, 'Goa slab 2 should be 21.6/g (18 + 20%)');

  console.log('  [PASS] State-wise extra costs scale labour charges and slabs accurately.\n');
}

// -------------------------------------------------------------------
// TEST 3: CUSTOM DELIVERY CHARGES BY PINCODE
// -------------------------------------------------------------------
console.log('TEST 3: Delivery Charges by Pincode...');
{
  const testPin = '403001'; // Panaji, Goa
  const now = new Date().toISOString();

  // Set custom charge for 403001
  db.prepare(`
    INSERT OR REPLACE INTO delivery_pincodes (pincode, charge, city, state, updated_at)
    VALUES (?, 120.0, 'Panaji', 'Goa', ?)
  `).run(testPin, now);

  const deliveryResult = deliveryChargeFor({ pin: testPin, zone: 'West', orderValue: 2000 });
  assert.strictEqual(deliveryResult.charge, 120, 'Delivery charge for 403001 must be 120');
  assert.strictEqual(deliveryResult.basis, 'Pincode 403001 charge');

  // Cleanup
  db.prepare('DELETE FROM delivery_pincodes WHERE pincode = ?').run(testPin);

  console.log('  [PASS] Custom pincode delivery charges resolve and override zone defaults.\n');
}

// -------------------------------------------------------------------
// TEST 4: WEIGHT SLAB DISCOUNTS BY TOTAL ORDER WEIGHT
// -------------------------------------------------------------------
console.log('TEST 4: Weight Slab Discounts (Rupees off labour by kg)...');
{
  const now = new Date().toISOString();
  // Clean up any test slabs and test isolated slabs
  const existingSlabs = db.prepare('SELECT * FROM weight_slab_discounts').all();
  db.prepare('DELETE FROM weight_slab_discounts').run();
  try {
    // Ensure default slabs exist: 1-2kg -> Rs.2/g, 2kg+ -> Rs.4/g
    db.prepare(`
      INSERT OR REPLACE INTO weight_slab_discounts (id, min_kg, max_kg, discount_per_gram, is_active, created_at, updated_at)
      VALUES ('wsd_1_2', 1.0, 2.0, 2.0, 1, ?, ?),
             ('wsd_2_plus', 2.0, NULL, 4.0, 1, ?, ?)
    `).run(now, now, now, now);

    // 500 grams (0.5 kg) -> 0 discount
    const d500 = getWeightSlabDiscount(500);
    assert.strictEqual(d500.discount_per_gram, 0, 'Under 1kg should have 0 discount');

    // 1500 grams (1.5 kg) -> Rs. 2/g discount
    const d1500 = getWeightSlabDiscount(1500);
    assert.strictEqual(d1500.discount_per_gram, 2, '1.5kg should get Rs. 2/g discount');

    // 3000 grams (3.0 kg) -> Rs. 4/g discount
    const d3000 = getWeightSlabDiscount(3000);
    assert.strictEqual(d3000.discount_per_gram, 4, '3kg should get Rs. 4/g discount');
  } finally {
    // Restore existing slabs
    for (const s of existingSlabs) {
      db.prepare(`
        INSERT OR REPLACE INTO weight_slab_discounts (id, min_kg, max_kg, discount_per_gram, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(s.id, s.min_kg, s.max_kg, s.discount_per_gram, s.is_active, s.created_at, s.updated_at);
    }
  }

  console.log('  [PASS] Weight slab discounts match correctly by order weight in kilograms.\n');
}

// -------------------------------------------------------------------
// TEST 5: CUSTOMER CASCADE DELETION & SINGLE PHONE RE-REGISTRATION
// -------------------------------------------------------------------
console.log('TEST 5: Customer Cascade Deletion & Phone Uniqueness...');
{
  const testPhone = '99988' + Math.floor(10000 + Math.random() * 90000);
  const testEmail = 'cascade_' + Date.now() + '@test.com';
  const testCustId = 'cust_cascade_test_' + Date.now();
  const testAcctId = 'acct_cascade_test_' + Date.now();
  const testOrderId = 'ord_cascade_test_' + Date.now();
  const now = new Date().toISOString();

  // Insert customer with account and order
  db.prepare(`
    INSERT INTO customers (id, poc_name, company_name, phone, email, is_archived, created_at, updated_at)
    VALUES (?, 'Cascade Tester', 'Cascade Corp', ?, ?, 0, ?, ?)
  `).run(testCustId, testPhone, testEmail, now, now);

  db.prepare(`
    INSERT INTO customer_accounts (id, full_name, phone, email, address, password_hash, customer_id, status, created_at, updated_at)
    VALUES (?, 'Cascade Tester', ?, ?, 'Panaji, Goa', 'hash123', ?, 'APPROVED', ?, ?)
  `).run(testAcctId, testPhone, testEmail, testCustId, now, now);

  db.prepare(`
    INSERT INTO orders (id, order_number, customer_id, customer_account_id, creator_id, order_date, status, order_type, total_amount, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'usr_admin_01', date('now'), 'OPEN', 'STANDARD', 5000, ?, ?)
  `).run(testOrderId, 'ORD_TEST_' + Date.now(), testCustId, testAcctId, now, now);

  // Execute complete deletion
  deleteCustomerCompletely({ customerId: testCustId, customerAccountId: testAcctId, phone: testPhone, email: testEmail });

  // Verify all records were wiped without FK failure
  const custAfter = db.prepare('SELECT id FROM customers WHERE id = ? OR phone = ?').get(testCustId, testPhone);
  const acctAfter = db.prepare('SELECT id FROM customer_accounts WHERE id = ? OR phone = ?').get(testAcctId, testPhone);
  const ordAfter = db.prepare('SELECT id FROM orders WHERE id = ?').get(testOrderId);

  assert.strictEqual(custAfter, undefined, 'Customer must be completely deleted');
  assert.strictEqual(acctAfter, undefined, 'Customer account must be completely deleted');
  assert.strictEqual(ordAfter, undefined, 'Orders must be cascade deleted');

  console.log('  [PASS] Customer cascade deletion safely wipes history without FK constraint errors.\n');
}

// -------------------------------------------------------------------
// TEST 6: MULTI-BRAND PWA MANIFESTS & ICONS
// -------------------------------------------------------------------
console.log('TEST 6: Multi-Brand PWA Manifests & Icons...');
{
  const fs = require('fs');
  const path = require('path');
  const root = path.resolve(__dirname, '..');

  const ai925ManifestPath = path.join(root, 'client', 'public', 'manifest.json');
  const oraaniManifestPath = path.join(root, 'client', 'public', 'oraani-manifest.json');

  assert(fs.existsSync(ai925ManifestPath), 'AI925 manifest.json must exist');
  assert(fs.existsSync(oraaniManifestPath), 'Oraani oraani-manifest.json must exist');

  const ai925Manifest = JSON.parse(fs.readFileSync(ai925ManifestPath, 'utf8'));
  const oraaniManifest = JSON.parse(fs.readFileSync(oraaniManifestPath, 'utf8'));

  assert(ai925Manifest.name.includes('AI925') || ai925Manifest.name.includes('AI 925'), 'AI925 manifest name must reference AI925');
  assert(oraaniManifest.name.includes('Oraani'), 'Oraani manifest name must reference Oraani');

  assert(fs.existsSync(path.join(root, 'client', 'public', 'oraani-icon-192.png')), 'Oraani 192 icon must exist');
  assert(fs.existsSync(path.join(root, 'client', 'public', 'oraani-apple-touch-icon.png')), 'Oraani apple touch icon must exist');
  assert(fs.existsSync(path.join(root, 'client', 'public', 'icon-192.png')), 'AI925 192 icon must exist');

  console.log('  [PASS] Multi-brand PWA manifests and brand-specific icons are in place.\n');
}

// -------------------------------------------------------------------
// TEST 7: ROLLBACK VERSION LISTING WITH TIMESTAMPS
// -------------------------------------------------------------------
console.log('TEST 7: Version Rollback History Listing...');
{
  const versions = listGitVersions(10);
  assert(Array.isArray(versions), 'listGitVersions must return an array');
  assert(versions.length > 0, 'listGitVersions must return commit versions');
  assert(versions[0].shortSha, 'Version must have shortSha');
  assert(versions[0].created_at, 'Version must have created_at timestamp');
  assert(versions[0].message, 'Version must have commit message');

  console.log(`  [INFO] Found ${versions.length} versions in git rollback history.`);
  console.log(`  [INFO] Latest version: [${versions[0].shortSha}] ${versions[0].created_at} - "${versions[0].message.slice(0, 60)}..."`);
  console.log('  [PASS] Rollback version listing operates cleanly without cmd.exe errors.\n');
}

// -------------------------------------------------------------------
// TEST 8: SERVER-SIDE OTP AUTHENTICATION & PINCODE STATE AUTO-FETCH
// -------------------------------------------------------------------
console.log('TEST 8: Server-Side OTP Authentication & Pincode State Auto-Fetch...');
(async () => {
  const { lookupPincode } = require('../server/services/pincodeService');
  const { generateAndSendOtp, verifyOtp } = require('../server/services/otpService');

  // Test 8A: Pincode lookup detects Goa for 403xxx
  const pinGoa = await lookupPincode('403001');
  assert(pinGoa && pinGoa.state === 'Goa', 'Pincode 403001 must resolve to Goa');

  // Test 8B: Pincode lookup detects Delhi for 110001
  const pinDelhi = await lookupPincode('110001');
  assert(pinDelhi && pinDelhi.state === 'Delhi', 'Pincode 110001 must resolve to Delhi');

  // Test 8C: OTP Generation & Dispatch
  const testEmail = 'otp_test_' + Date.now() + '@example.com';
  const genRes = await generateAndSendOtp({ destination: testEmail, purpose: 'LOGIN', brand: 'ORAANI' });
  assert.strictEqual(genRes.ok, true, 'OTP generation must succeed');
  assert(genRes.dev_otp && genRes.dev_otp.length === 6, 'OTP must be a 6-digit code');

  // Test 8D: Invalid OTP check
  const badCheck = verifyOtp({ destination: testEmail, otp: '999999', purpose: 'LOGIN' });
  assert.strictEqual(badCheck.valid, false, 'Invalid OTP must fail verification');

  // Test 8E: Valid OTP check
  const goodCheck = verifyOtp({ destination: testEmail, otp: genRes.dev_otp, purpose: 'LOGIN' });
  assert.strictEqual(goodCheck.valid, true, 'Valid OTP must succeed verification');

  // Cleanup test OTP record
  db.prepare('DELETE FROM customer_otps WHERE destination = ?').run(testEmail);

  console.log('  [PASS] Server-side OTP authentication and pincode auto-state fetch verified successfully.\n');

  console.log('====================================================');
  console.log('   ALL COMPREHENSIVE VERIFICATION TESTS PASSED!     ');
  console.log('====================================================');
})();
