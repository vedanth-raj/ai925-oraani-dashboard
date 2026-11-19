const http = require('http');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body, json });
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runE2ETests() {
  console.log('========================================================');
  console.log(' RUNNING END-TO-END HTTP API & INTEGRATION VERIFICATION');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  try {
    // 1. Health check
    const health = await request({ hostname: 'localhost', port: 3000, path: '/api/health', method: 'GET' });
    assert(health.status === 200 && health.json?.status === 'ok', 'GET /api/health returns 200 ok');

    // 2. Frontend HTML Served
    const frontend = await request({ hostname: 'localhost', port: 3000, path: '/', method: 'GET' });
    assert(frontend.status === 200 && frontend.body.includes('<div id="root">'), 'GET / serves Vite PWA root HTML');

    // 3. Admin PIN Login (925925)
    const adminLogin = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login-pin',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: '925925', role: 'ADMIN' });
    assert(adminLogin.status === 200 && adminLogin.json?.token && adminLogin.json?.user?.role === 'ADMIN', 'Admin PIN login (925925) returns JWT token and ADMIN user');
    const adminToken = adminLogin.json.token;

    // 4. Sales Rep PIN Login (123456)
    const repLogin = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login-pin',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: '123456', role: 'SALES_REP' });
    assert(repLogin.status === 200 && repLogin.json?.token && repLogin.json?.user?.role === 'SALES_REP', 'Sales Rep PIN login (123456) returns JWT token and SALES_REP user');
    const repToken = repLogin.json.token;

    // 5. Analytics Overview
    const overview = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/analytics/overview',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(overview.status === 200 && overview.json?.kpis && overview.json?.monthly?.bars, 'GET /api/analytics/overview returns KPI summary & monthly series');

    // 6. Products Listing
    const productsRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/products',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(productsRes.status === 200 && Array.isArray(productsRes.json?.products) && productsRes.json.products.length > 0, 'GET /api/products returns product catalog');
    const sampleProduct = productsRes.json.products[0];

    // 7. Product Details
    const prodDetails = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/products/${sampleProduct.id}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(prodDetails.status === 200 && prodDetails.json?.product && prodDetails.json?.kpis, 'GET /api/products/:id returns specs, kpis, and history');

    // 8. Customers Listing
    const customersRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/customers',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(customersRes.status === 200 && Array.isArray(customersRes.json?.customers) && customersRes.json.customers.length > 0, 'GET /api/customers returns customer accounts');

    // 9. Companies Summary
    const companiesRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/customers/companies/summary',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(companiesRes.status === 200 && Array.isArray(companiesRes.json?.companies), 'GET /api/customers/companies/summary returns business entities');

    // 10. Orders Listing
    const ordersRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/orders',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(ordersRes.status === 200 && Array.isArray(ordersRes.json?.orders) && ordersRes.json.orders.length > 0, 'GET /api/orders returns orders list');
    const sampleOrder = ordersRes.json.orders[0];

    // 11. Order Details
    const orderDetails = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/orders/${sampleOrder.id}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(orderDetails.status === 200 && orderDetails.json?.order && Array.isArray(orderDetails.json?.items), 'GET /api/orders/:id returns order metadata, items & delivery status');

    // 12. Pincode Lookup (Offline SQLite Cache fallback)
    const pinRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/pincode/282001',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(pinRes.status === 200 && pinRes.json?.city === 'Agra' && pinRes.json?.zone === 'North', 'GET /api/pincode/282001 resolves Agra, North zone');

    // 13. Data Export Security Enforcement (Admin 200, Rep 403)
    const adminExport = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/export/orders.csv',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(adminExport.status === 200 && adminExport.body.includes('Order #'), 'Admin export GET /api/export/orders.csv returns 200 CSV');

    const repExport = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/export/orders.csv',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${repToken}` }
    });
    assert(repExport.status === 403, 'Sales Rep export GET /api/export/orders.csv strictly forbidden (403)');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  }

  console.log('\n--------------------------------------------------------');
  console.log(` SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('--------------------------------------------------------\n');

  if (failed > 0) process.exit(1);
}

runE2ETests();
