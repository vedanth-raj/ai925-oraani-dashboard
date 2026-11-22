const assert = require('assert');
const http = require('http');
const { db } = require('../server/db/database');
const { getStatePremium, getAllStatePremiums, priceBreakdown, makingFor } = require('../server/utils/pricing');

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      if (typeof body === 'string') {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
      }
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n======================================================');
  console.log('       TESTING NEW MULTI-BRAND & ADVANCED REQUIREMENTS');
  console.log('======================================================\n');

  // 1. Admin Login to get token
  const loginRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login-pin',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { pin: '925925', role: 'ADMIN' });

  assert.strictEqual(loginRes.status, 200, 'Admin login should succeed');
  const token = loginRes.data.token;
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  console.log('[PASS] Admin login succeeded');

  // 2. State-wise Premium Pricing API & Utility Tests (Requirement 10)
  console.log('\n>>> Testing State-wise Premium Pricing (Requirement 10)...');

  // Set Goa to 100% premium (2X multiplier)
  const savePremiumRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/pricing/state-premiums',
    method: 'POST',
    headers: authHeaders
  }, { state: 'Goa', premium_pct: 100, is_active: 1 });

  assert.strictEqual(savePremiumRes.status, 200, 'Saving state premium should return 200');
  console.log('[PASS] Successfully saved state premium for Goa: +100%');

  // Verify getStatePremium
  const goaPremium = getStatePremium('Goa');
  assert.strictEqual(goaPremium, 100, 'getStatePremium for Goa should return 100%');
  console.log('[PASS] getStatePremium("Goa") returned 100%');

  // Verify makingFor & priceBreakdown with 100% premium doubles the price
  const testProductForPricing = { labour_per_gram: 12, weight_options: [] };
  const normalMaking = makingFor({ product: testProductForPricing, stdWeight: 20, mode: 'ON_ORDER', pieces: 1, grams: 20, statePremiumPct: 0 });
  const premiumMaking = makingFor({ product: testProductForPricing, stdWeight: 20, mode: 'ON_ORDER', pieces: 1, grams: 20, statePremiumPct: 100 });

  assert.strictEqual(normalMaking.labour_per_gram, 12, 'Normal making charge should be 12/g');
  assert.strictEqual(premiumMaking.labour_per_gram, 24, 'Premium making charge should be 24/g (2X)');
  console.log('[PASS] makingFor scaled making charge from ₹12/g to ₹24/g (+100% / 2X)');

  const normalBreakdown = priceBreakdown(10, 100, normalMaking.labour_per_gram, 0); // 10g @ 100/g silver, 12/g making
  const premiumBreakdown = priceBreakdown(10, 100, normalMaking.labour_per_gram, 100); // 10g with 100% premium on labour

  assert.strictEqual(premiumBreakdown.silver_amount, normalBreakdown.silver_amount, 'Silver amount should remain fixed at standard market rate');
  assert.strictEqual(premiumBreakdown.labour_amount, normalBreakdown.labour_amount * 2, 'Labour amount should double with 100% premium on labour');
  console.log('[PASS] priceBreakdown accurately calculated 2X premium on labour charges for Goa customer while keeping silver at base market rate');

  // List all state premiums
  const listPremiumsRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/pricing/state-premiums',
    method: 'GET',
    headers: authHeaders
  });
  assert.strictEqual(listPremiumsRes.status, 200);
  assert(listPremiumsRes.data.state_premiums.some(p => p.state === 'Goa' && p.premium_pct === 100), 'Goa should be present in list');
  console.log('[PASS] GET /api/pricing/state-premiums returned active state rules');

  // 3. Multi-Brand Customers and Orders (Requirement 1, 2, 4)
  console.log('\n>>> Testing Multi-Brand Customers & Orders (Requirements 1, 2, 4)...');

  const oraaniPhone = '9' + Math.floor(100000000 + Math.random() * 900000000);
  const aiPhone = '9' + Math.floor(100000000 + Math.random() * 900000000);

  // Create Oraani Customer
  const oraaniCustRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/customers',
    method: 'POST',
    headers: authHeaders
  }, {
    poc_name: 'Oraani Test Customer',
    company_name: 'Oraani Jewels Ltd',
    phone: oraaniPhone,
    brand: 'ORAANI',
    category: 'Retailer',
    city: 'Panaji',
    state: 'Goa',
    zone: 'West'
  });
  assert.strictEqual(oraaniCustRes.status, 201, 'Oraani customer creation should return 201');
  const oraaniCustId = oraaniCustRes.data.customer.id;
  assert.strictEqual(oraaniCustRes.data.customer.brand, 'ORAANI', 'Customer brand should be ORAANI');
  console.log('[PASS] Created customer under brand ORAANI');

  // Create AI925 Customer
  const aiCustRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/customers',
    method: 'POST',
    headers: authHeaders
  }, {
    poc_name: 'AI925 Test Customer',
    company_name: 'Aryan Gems',
    phone: aiPhone,
    brand: 'AI925',
    category: 'Wholesaler',
    city: 'Mumbai',
    state: 'Maharashtra',
    zone: 'West'
  });
  assert.strictEqual(aiCustRes.status, 201, 'AI925 customer creation should return 201');
  const aiCustId = aiCustRes.data.customer.id;
  assert.strictEqual(aiCustRes.data.customer.brand, 'AI925', 'Customer brand should be AI925');
  console.log('[PASS] Created customer under brand AI925');

  // Test Customer Brand Filtering
  const filterOraaniRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/customers?brand=ORAANI',
    method: 'GET',
    headers: authHeaders
  });
  assert(filterOraaniRes.data.customers.every(c => c.brand === 'ORAANI' || c.brand === 'BOTH'), 'Filtered customers must belong to ORAANI or BOTH');
  assert(filterOraaniRes.data.customers.some(c => c.id === oraaniCustId), 'Created Oraani customer must appear in filter');
  console.log('[PASS] Customer list brand filter ?brand=ORAANI verified');

  // 4. Bulk Inventory Addition (Requirement 11)
  console.log('\n>>> Testing Bulk Inventory Addition (Requirement 11)...');

  // Get first product
  const productsRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/products',
    method: 'GET',
    headers: authHeaders
  });
  assert(productsRes.data.products.length > 0, 'Products should exist');
  const testProduct = productsRes.data.products[0];

  const initialStock = Number(testProduct.physical_stock) || 0;

  // Bulk add inventory with 4 distinct combinations
  const bulkPayload = {
    items: [
      { product_id: testProduct.id, std_weight_g: 1.25, size_inches: 20, qty: 5 },
      { product_id: testProduct.id, std_weight_g: 1.25, size_inches: 22, qty: 15 },
      { product_id: testProduct.id, std_weight_g: 1.5, size_inches: 24, qty: 100 },
      { product_id: testProduct.id, std_weight_g: 2.5, size_inches: 20, qty: 20 }
    ]
  };

  const bulkRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/products/bulk-inventory',
    method: 'POST',
    headers: authHeaders
  }, bulkPayload);

  assert(bulkRes.status === 200 || bulkRes.status === 201, 'Bulk inventory addition should return 200 or 201');
  assert.strictEqual(bulkRes.data.total_pieces, 140, 'Should add 140 pieces in total (5+15+100+20)');
  console.log(`[PASS] Bulk added 140 pieces across 4 weight/size combinations in one atomic call`);

  // Verify updated product stock
  const updatedProductRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/products/${testProduct.id}`,
    method: 'GET',
    headers: authHeaders
  });
  const updatedStock = Number(updatedProductRes.data.product.physical_stock) || 0;
  assert.strictEqual(updatedStock, initialStock + 140, 'Physical stock should increase by exactly 140');
  console.log(`[PASS] Physical stock verified in database: ${initialStock} -> ${updatedStock}`);

  // Clean up test customers
  await request({ hostname: 'localhost', port: 3000, path: `/api/customers/${oraaniCustId}`, method: 'DELETE', headers: authHeaders });
  await request({ hostname: 'localhost', port: 3000, path: `/api/customers/${aiCustId}`, method: 'DELETE', headers: authHeaders });

  console.log('\n======================================================');
  console.log('       ALL NEW REQUIREMENT TESTS PASSED PERFECTLY!');
  console.log('======================================================\n');
}

runTests().catch(err => {
  console.error('\n[FAIL] Test failed:', err);
  process.exit(1);
});
