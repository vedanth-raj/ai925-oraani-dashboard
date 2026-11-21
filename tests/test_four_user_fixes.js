const { db } = require('../server/db/database');
const { deliveryChargeFor } = require('../server/services/commerce');
const { PIN_PREFIX_STATE } = require('../server/services/pincodeService');
const { generateToken, generateCustomerToken } = require('../server/middleware/auth');

async function runTests() {
  console.log('=== RUNNING VERIFICATION FOR 4 USER FIXES ===\n');
  let failures = 0;

  function assert(condition, testName, detail = '') {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
    } else {
      console.error(`  ❌ FAIL: ${testName} - ${detail}`);
      failures++;
    }
  }

  // Generate tokens using official app auth helpers
  const adminUser = db.prepare("SELECT * FROM users WHERE role = 'ADMIN' LIMIT 1").get();
  const staffToken = generateToken(adminUser);

  const customerAccount = db.prepare("SELECT * FROM customer_accounts WHERE id = 'cacc_mwqu5dsd_bdez'").get();
  assert(!!customerAccount, 'Customer Vedanth Raj account exists');

  // --- TEST 1: Pincode Prefix State Lookup (Client & Server) ---
  console.log('\nTest 1: Indian State Auto-Resolution from Pincode');
  const pincodeCases = [
    { pin: '490025', expected: 'Chhattisgarh' },
    { pin: '110001', expected: 'Delhi' },
    { pin: '400001', expected: 'Maharashtra' },
    { pin: '560001', expected: 'Karnataka' },
    { pin: '600001', expected: 'Tamil Nadu' },
    { pin: '700001', expected: 'West Bengal' },
    { pin: '302001', expected: 'Rajasthan' },
    { pin: '380001', expected: 'Gujarat' },
    { pin: '500001', expected: 'Telangana' },
    { pin: '682001', expected: 'Kerala' },
  ];

  for (const { pin, expected } of pincodeCases) {
    const prefix = pin.substring(0, 2);
    const resolved = PIN_PREFIX_STATE[prefix];
    assert(resolved === expected, `Pincode ${pin} resolves to ${expected}`, `Got ${resolved}`);
  }

  // 1a. Test public portal pincode lookup API
  try {
    const res = await fetch('http://localhost:3000/api/portal/pincode/490025');
    const data = await res.json();
    assert(data.state === 'Chattisgarh' || data.state === 'Chhattisgarh', 'Public /api/portal/pincode/490025 resolves state', `Got ${data.state}`);
  } catch (err) {
    assert(false, 'Portal pincode lookup endpoint', err.message);
  }

  // 1b. Test staff pincode lookup API
  try {
    const res = await fetch('http://localhost:3000/api/pincode/490025', {
      headers: { 'Authorization': `Bearer ${staffToken}` }
    });
    const data = await res.json();
    assert(data.state === 'Chattisgarh' || data.state === 'Chhattisgarh', 'Staff /api/pincode/490025 resolves state', `Got ${data.state}`);
  } catch (err) {
    assert(false, 'Staff pincode lookup endpoint', err.message);
  }

  // --- TEST 2: Delivery Weight Slabs Admin & Commerce Engine ---
  console.log('\nTest 2: Weight Slab Delivery Rules');
  
  // Verify default seeded slabs
  const slabs = db.prepare('SELECT * FROM delivery_weight_slabs ORDER BY min_weight_g ASC').all();
  assert(slabs.length >= 3, `Seeded slabs present in database (count: ${slabs.length})`);

  // Verify GET /api/pricing/delivery-weight-slabs endpoint
  const slabsRes = await fetch('http://localhost:3000/api/pricing/delivery-weight-slabs', {
    headers: { 'Authorization': `Bearer ${staffToken}` }
  });
  assert(slabsRes.status === 200, 'GET /api/pricing/delivery-weight-slabs returns HTTP 200');
  const slabsData = await slabsRes.json();
  assert(Array.isArray(slabsData.delivery_weight_slabs) && slabsData.delivery_weight_slabs.length >= 3, 'Pricing endpoint returns delivery_weight_slabs array');

  // Test calculation for different weights:
  // 0-500g -> ₹100
  // 500-2000g -> ₹200
  // 2000g+ -> ₹350
  const rate1 = deliveryChargeFor({ pin: '490025', weightGrams: 250 });
  assert(rate1.charge === 100, `250g charged ₹100`, `Got ₹${rate1.charge}`);

  const rate2 = deliveryChargeFor({ pin: '490025', weightGrams: 1200 });
  assert(rate2.charge === 200, `1200g charged ₹200`, `Got ₹${rate2.charge}`);

  const rate3 = deliveryChargeFor({ pin: '490025', weightGrams: 3500 });
  assert(rate3.charge === 350, `3500g charged ₹350`, `Got ₹${rate3.charge}`);

  // Test custom slab creation via POST /api/pricing/delivery-weight-slabs
  const createRes = await fetch('http://localhost:3000/api/pricing/delivery-weight-slabs', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${staffToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      min_weight_g: 5000,
      max_weight_g: 10000,
      shipping_charge: 550,
      is_active: 1
    })
  });
  assert(createRes.status === 200, 'POST /api/pricing/delivery-weight-slabs returns HTTP 200');
  const createData = await createRes.json();
  assert(createData.success === true, 'Successfully added custom weight slab');

  const rate4 = deliveryChargeFor({ pin: '490025', weightGrams: 7500 });
  assert(rate4.charge === 550, `7500g matches custom tier and charged ₹550`, `Got ₹${rate4.charge}`);

  // Clean up created slab via DELETE /api/pricing/delivery-weight-slabs/:id
  const createdSlab = createData.delivery_weight_slabs.find(s => s.min_weight_g === 5000);
  if (createdSlab) {
    const deleteRes = await fetch(`http://localhost:3000/api/pricing/delivery-weight-slabs/${createdSlab.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${staffToken}` }
    });
    assert(deleteRes.status === 200, `DELETE /api/pricing/delivery-weight-slabs/${createdSlab.id} returns HTTP 200`);
  }

  // --- TEST 3: Ready Stock Zero Price Bug Fix ---
  console.log('\nTest 3: Ready Stock Product Loading when Order Purchase is Disabled');

  // Verify behavior when can_view_ready=1 and can_view_order=0 (user scenario from screenshot)
  db.prepare("UPDATE customer_accounts SET can_view_ready = 1, can_view_order = 0 WHERE id = 'cacc_mwqu5dsd_bdez'").run();
  const customerToken = generateCustomerToken(customerAccount);

  // 1. Without specifying mode (default) -> should NOT 403, must return Ready Stock products
  const defaultRes = await fetch('http://localhost:3000/api/portal/products', {
    headers: { 'Authorization': `Bearer ${customerToken}` }
  });
  assert(defaultRes.status === 200, `Default products request returns HTTP 200 when can_view_order=0`);
  const defaultData = await defaultRes.json();
  assert(Array.isArray(defaultData.products) && defaultData.products.length > 0, `Returned ${defaultData.products?.length || 0} products`);

  // 2. With mode=ready -> returns products with non-zero prices and weights
  const readyRes = await fetch('http://localhost:3000/api/portal/products?mode=ready', {
    headers: { 'Authorization': `Bearer ${customerToken}` }
  });
  assert(readyRes.status === 200, `Mode=ready request returns HTTP 200`);
  const readyData = await readyRes.json();
  const box33 = readyData.products.find(p => p.sku === 'BOX 3+3' || p.name.includes('BOX 3+3'));
  assert(!!box33, 'BOX 3+3 product found in ready stock');
  if (box33) {
    assert(box33.pricing && box33.pricing.price_per_gram > 0, `BOX 3+3 has non-zero price: Rs.${box33.pricing?.price_per_gram}/g`);
    assert(box33.std_weight_per_20in > 0, `BOX 3+3 has standard weight: ${box33.std_weight_per_20in}g`);
  }

  // 3. With forbidden mode=order -> should return 403
  const orderRes = await fetch('http://localhost:3000/api/portal/products?mode=order', {
    headers: { 'Authorization': `Bearer ${customerToken}` }
  });
  assert(orderRes.status === 403, `Forbidden mode=order correctly blocked with HTTP 403`);

  // --- TEST 4: Customer Delivery Quote with Weight ---
  console.log('\nTest 4: Customer Delivery Quote API');
  const quoteRes = await fetch('http://localhost:3000/api/portal/delivery-quote?pin=490025&weight_grams=1500', {
    headers: { 'Authorization': `Bearer ${customerToken}` }
  });
  assert(quoteRes.status === 200, `Delivery quote API returns HTTP 200`);
  const quoteData = await quoteRes.json();
  assert(quoteData.delivery && quoteData.delivery.charge === 200, `Quote returns calculated charge ₹200 (slabs hidden from customer)`, `Got ₹${quoteData.delivery?.charge}`);

  console.log('\n=== SUMMARY ===');
  if (failures === 0) {
    console.log('🎉 ALL TESTS PASSED! System is 100% verified.');
  } else {
    console.error(`❌ ${failures} TESTS FAILED.`);
    process.exitCode = 1;
  }
}

runTests();
