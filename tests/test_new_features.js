const assert = require('assert');
const http = require('http');

console.log('\n========================================================');
console.log(' RUNNING COMPREHENSIVE NEW FEATURES VERIFICATION');
console.log('========================================================\n');

function makeRequest(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({ hostname: 'localhost', port: 3000, path, method, headers }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch { parsed = raw; }
        resolve({ status: res.statusCode, headers: res.headers, data: parsed, raw });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  // 1. Login Admin and Sales Rep
  const adminLogin = await makeRequest('POST', '/api/auth/login-pin', { pin: '925925' });
  assert.strictEqual(adminLogin.status, 200);
  const adminToken = adminLogin.data.token;

  const repLogin = await makeRequest('POST', '/api/auth/login-pin', { pin: '123456' });
  assert.strictEqual(repLogin.status, 200);
  const repToken = repLogin.data.token;
  const repId = repLogin.data.user.id;

  // 2. Test SQLite "SALES_REP" bug fix: POST /api/users/representatives/:id/companies
  console.log('>>> Test 1: SQLite column bug fix & Company Assignment...');
  const assignRes = await makeRequest('POST', `/api/users/representatives/${repId}/companies`, {
    company_name: 'Test Exclusive Jewelers'
  }, adminToken);
  assert.strictEqual(assignRes.status, 201, 'Assign company should succeed without SqliteError: no such column "SALES_REP"');
  console.log('[PASS] Bug Fix Verified: Company assigned to representative successfully without SQL errors');

  // 3. Test Exclusivity rule: Assigning the same company to another representative must be rejected
  console.log('>>> Test 2: Exclusive company assignment enforcement...');
  // Create second rep
  const rep2Res = await makeRequest('POST', '/api/users/representatives', {
    username: 'rep_second_' + Date.now().toString(36),
    full_name: 'Second Sales Rep',
    pin: '778899',
    assigned_region: 'North'
  }, adminToken);
  assert.strictEqual(rep2Res.status, 201);
  const rep2Id = rep2Res.data.representative.id;

  const duplicateAssign = await makeRequest('POST', `/api/users/representatives/${rep2Id}/companies`, {
    company_name: 'Test Exclusive Jewelers'
  }, adminToken);
  assert.strictEqual(duplicateAssign.status, 400, 'Assigning already-assigned company must return 400 Bad Request');
  assert.ok(duplicateAssign.data.error.includes('already assigned'), 'Error must explain company is already assigned');
  console.log('[PASS] Exclusivity Verified: Company cannot be assigned to multiple sales representatives');

  // 4. Test Unassigned companies endpoint
  console.log('>>> Test 3: Unassigned companies list...');
  const unassignedRes = await makeRequest('GET', '/api/users/unassigned-companies', null, adminToken);
  assert.strictEqual(unassignedRes.status, 200);
  assert.ok(Array.isArray(unassignedRes.data.companies));
  console.log(`[PASS] Unassigned companies API works cleanly (${unassignedRes.data.companies.length} unassigned companies found)`);

  // 5. Test Live Location Tracking for Sales Rep
  console.log('>>> Test 4: Live location capture & admin monitor...');
  const locUpdate = await makeRequest('POST', '/api/users/location', {
    latitude: 19.0760,
    longitude: 72.8777,
    address: 'Zaveri Bazaar, Mumbai'
  }, repToken);
  assert.strictEqual(locUpdate.status, 200);

  const locsView = await makeRequest('GET', '/api/users/representatives/locations', null, adminToken);
  assert.strictEqual(locsView.status, 200);
  const repLoc = locsView.data.representatives.find(r => r.id === repId);
  assert.ok(repLoc, 'Rep must be found in locations list');
  assert.strictEqual(repLoc.last_latitude, 19.0760);
  assert.strictEqual(repLoc.last_longitude, 72.8777);
  console.log('[PASS] Live Location Verified: Rep coordinates recorded and visible to Admin/Business Admin');

  // 6. Test Interactive Overview with Timeframes (daily, weekly, monthly, yearly) & Salesperson Pieces parts
  console.log('>>> Test 5: Interactive Overview Timeframes & Salesperson Breakdown...');
  for (const tf of ['daily', 'weekly', 'monthly', 'yearly']) {
    const ovRes = await makeRequest('GET', `/api/analytics/overview?timeframe=${tf}`, null, adminToken);
    assert.strictEqual(ovRes.status, 200);
    assert.ok(ovRes.data.chart.bars.length > 0, `Should have bars for timeframe ${tf}`);
    assert.strictEqual(ovRes.data.timeframe, tf);
    assert.ok(Array.isArray(ovRes.data.chart.reps), 'Chart should return active reps legend list');
  }
  console.log('[PASS] Timeframe Stats Verified: daily, weekly, monthly, yearly with stacked salesperson pieces');

  // 7. Test Customer Category & Geo Location persistence
  console.log('>>> Test 6: Customer Category & Location fields...');
  const newCustRes = await makeRequest('POST', '/api/customers', {
    poc_name: 'Harish Mehta',
    company_name: 'Mehta Wholesalers',
    phone: '9820098200',
    category: 'Wholesaler',
    country: 'India',
    state: 'Maharashtra',
    city: 'Mumbai',
    latitude: 18.9500,
    longitude: 72.8300,
    location_address: 'Kalbadevi, Mumbai'
  }, adminToken);
  assert.strictEqual(newCustRes.status, 201);
  const cust = newCustRes.data.customer;
  assert.strictEqual(cust.category, 'Wholesaler');
  assert.strictEqual(cust.country, 'India');
  assert.strictEqual(cust.latitude, 18.9500);
  assert.strictEqual(cust.longitude, 72.8300);
  console.log('[PASS] Customer Category & Location Coordinates persistence verified');

  // 8. Test CSV Import
  console.log('>>> Test 7: CSV Bulk Import (Customers, Products, Orders)...');
  const uId = Date.now().toString(36);
  const custCsv = `Company,POC Name,Phone,GSTIN,City,State,Zone\n"Ruby Jewels ${uId}","Rajesh Kumar","9988776655","27ABCDE1234F1Z5","Pune","Maharashtra","West"`;
  const importCustRes = await makeRequest('POST', '/api/export/import/customers', { csv_data: custCsv }, adminToken);
  assert.strictEqual(importCustRes.status, 200);
  assert.strictEqual(importCustRes.data.imported, 1);

  const prodCsv = `SKU,Name,Category,Wire Size,Endings,Lock Type,Std Weight/20in (g),Physical Stock,Status\n"CHN-CSV-${uId}","CSV Cuban Chain","Chains","0.8mm","Solid","Box Lock",28.5,150,"active"`;
  const importProdRes = await makeRequest('POST', '/api/export/import/products', { csv_data: prodCsv }, adminToken);
  assert.strictEqual(importProdRes.status, 200);
  assert.strictEqual(importProdRes.data.imported, 1);

  const ordCsv = `Order #,Date,Status,Company,POC Name,Phone,Total Pieces,Expected Weight (g),Advance (₹)\n"#89${uId.slice(-3)}","2026-10-25","OPEN","Ruby Jewels ${uId}","Rajesh Kumar","9988776655",25,120.5,5000`;
  const importOrdRes = await makeRequest('POST', '/api/export/import/orders', { csv_data: ordCsv }, adminToken);
  assert.strictEqual(importOrdRes.status, 200);
  assert.strictEqual(importOrdRes.data.imported, 1);
  console.log('[PASS] CSV Import Verified: Customers, Products, and Orders successfully imported via CSV matching download schema');

  // 9. Test Sales Rep Interface Restrictions: wire and endings hidden
  console.log('>>> Test 8: Sales Rep wire and endings masking...');
  const repProdRes = await makeRequest('GET', '/api/products', null, repToken);
  assert.strictEqual(repProdRes.status, 200);
  const repProduct = repProdRes.data.products[0];
  assert.strictEqual(repProduct.wire_size, undefined, 'wire_size must be hidden from Sales Rep');
  assert.strictEqual(repProduct.endings, undefined, 'endings must be hidden from Sales Rep');
  console.log('[PASS] Security & Privacy: wire and endings are strictly stripped from Sales Rep responses');

  console.log('\n========================================================');
  console.log(' ALL 8 NEW FEATURE AND BUG FIX TESTS PASSED CLEANLY!');
  console.log('========================================================\n');
}

run().catch(err => {
  console.error('\n[TEST RUN ERROR]:', err);
  process.exit(1);
});
