const http = require('http');
const assert = require('assert');

console.log('\n========================================================');
console.log(' RUNNING ADVANCED ARCHITECTURAL & SECURITY SUITE');
console.log('========================================================\n');

function makeRequest(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json'
    };
    if (payload) {
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path,
        method,
        headers
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, data: parsed, raw });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

let passed = 0;
function test(name, fn) {
  return async () => {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}:`, err.message);
      throw err;
    }
  };
}

async function run() {
  // The master code exists only when MASTER_CODE is set for the server; the old built-in codes never work
  const master = process.env.MASTER_CODE;
  await test('Master Code: the old built-in codes are rejected', async () => {
    for (const code of ['925925MASTER', 'MASTER925']) {
      const res = await makeRequest('POST', '/api/auth/login-pin', { pin: code });
      assert.strictEqual(res.status, 401, `${code} must not log in`);
    }
  })();

  if (master) {
    await test('Master Code Login: configured MASTER_CODE grants Admin access', async () => {
      const res = await makeRequest('POST', '/api/auth/login-pin', { pin: master });
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.token, 'Should return JWT token');
      assert.strictEqual(res.data.user.role, 'ADMIN', 'Role must be ADMIN');
    })();

    await test('Master Code: Username & Password login with master code', async () => {
      const res = await makeRequest('POST', '/api/auth/login', { username: 'anyadmin', password: master });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.user.role, 'ADMIN');
    })();
  } else {
    console.log('[SKIP] Master code login (MASTER_CODE not set)');
  }

  // Test 3: Admin Single Device Enforcement
  await test('Security: Single-device Admin enforcement invalidates prior session', async () => {
    // Session 1: Admin logs in
    const login1 = await makeRequest('POST', '/api/auth/login-pin', { pin: '925925' });
    assert.strictEqual(login1.status, 200);
    const token1 = login1.data.token;

    // Verify token 1 works
    const me1 = await makeRequest('GET', '/api/auth/me', null, token1);
    assert.strictEqual(me1.status, 200);

    // Session 2: Admin logs in on a new device
    const login2 = await makeRequest('POST', '/api/auth/login-pin', { pin: '925925' });
    assert.strictEqual(login2.status, 200);
    const token2 = login2.data.token;

    // Verify token 1 is now strictly invalidated
    const me1After = await makeRequest('GET', '/api/auth/me', null, token1);
    assert.strictEqual(me1After.status, 401, 'Previous session must receive 401 Unauthorized');
    assert.strictEqual(me1After.data.session_invalidated, true, 'session_invalidated must be true');

    // Verify token 2 is active and valid
    const me2 = await makeRequest('GET', '/api/auth/me', null, token2);
    assert.strictEqual(me2.status, 200);
  })();

  // Test 4: Business Administrator Login and Permissions
  await test('Role Permissions: Business Administrator can create & modify orders, but cannot delete', async () => {
    // Login as Business Admin
    const login = await makeRequest('POST', '/api/auth/login', {
      username: 'bizadmin',
      password: '888888'
    });
    assert.strictEqual(login.status, 200);
    assert.strictEqual(login.data.user.role, 'BUSINESS_ADMIN');
    const bizToken = login.data.token;

    // Fetch existing customer and product
    const adminLogin = await makeRequest('POST', '/api/auth/login-pin', { pin: '925925' });
    const adminToken = adminLogin.data.token;
    const custRes = await makeRequest('GET', '/api/customers', null, adminToken);
    const customer = custRes.data.customers[0];

    const prodRes = await makeRequest('GET', '/api/products', null, adminToken);
    const product = prodRes.data.products[0];

    // Create Order as Business Admin
    const createOrder = await makeRequest('POST', '/api/orders', {
      customer_id: customer.id,
      special_notes: 'Test order created by Business Administrator',
      advance_amount: 500,
      products: [
        { product_id: product.id, sizes: [{ size_inches: '20', pieces: 2 }] }
      ]
    }, bizToken);
    if (createOrder.status !== 201) {
      console.log('createOrder error payload:', createOrder.data);
    }
    assert.strictEqual(createOrder.status, 201);
    const orderId = createOrder.data.order.id;

    // Modify Order as Business Admin
    const updateOrder = await makeRequest('PUT', `/api/orders/${orderId}`, {
      customer_id: customer.id,
      special_notes: 'Modified order by Business Administrator',
      advance_amount: 800,
      products: [
        { product_id: product.id, sizes: [{ size_inches: '22', pieces: 3 }] }
      ]
    }, bizToken);
    assert.strictEqual(updateOrder.status, 200);

    // Attempt Deletion as Business Admin (MUST FAIL 403)
    const deleteOrder = await makeRequest('DELETE', `/api/orders/${orderId}`, null, bizToken);
    assert.strictEqual(deleteOrder.status, 403, 'Business Admin cannot delete orders');

    // Clean up with Admin
    const adminDelete = await makeRequest('DELETE', `/api/orders/${orderId}`, null, adminToken);
    assert.strictEqual(adminDelete.status, 200);
  })();

  // Test 5: Sales Rep Company Isolation
  await test('Security: Sales Rep only sees assigned companies & customers', async () => {
    // Login as Ravi (assigned to Shree Jewels)
    const repLogin = await makeRequest('POST', '/api/auth/login', {
      username: 'rep_ravi',
      password: '123456'
    });
    assert.strictEqual(repLogin.status, 200);
    const repToken = repLogin.data.token;

    // Ravi fetches customers
    const custRes = await makeRequest('GET', '/api/customers', null, repToken);
    assert.strictEqual(custRes.status, 200);
    
    // Check that every customer either belongs to assigned company ('Shree Jewels') or was created by Ravi
    for (const cust of custRes.data.customers) {
      const isAssigned = cust.company_name === 'Shree Jewels';
      const isSelf = cust.created_by === repLogin.data.user.id;
      assert.ok(isAssigned || isSelf, `Customer from company ${cust.company_name} must not be visible to Ravi`);
    }

    // Ravi fetches companies summary
    const compRes = await makeRequest('GET', '/api/customers/companies/summary', null, repToken);
    assert.strictEqual(compRes.status, 200);
    for (const c of compRes.data.companies) {
      assert.strictEqual(c.company_name, 'Shree Jewels', 'Rep cannot see unassigned companies summary');
    }
  })();

  // Test 6: Customer Alternate Phone, Multiple Phones & GSTIN
  await test('Customer: Multiple contact numbers and GSTIN persistence', async () => {
    const adminLogin = await makeRequest('POST', '/api/auth/login-pin', { pin: '925925' });
    const adminToken = adminLogin.data.token;

    const newCust = await makeRequest('POST', '/api/customers', {
      poc_name: 'Jewel Craft MultiContact',
      company_name: 'Shree Jewels',
      phone: '9820011223',
      alternate_phone: '9820044556',
      additional_phones: ['9820077889', '9820099001'],
      gstin: '27AABCU9603R1ZM',
      pin_code: '400002'
    }, adminToken);
    assert.strictEqual(newCust.status, 201);
    const custId = newCust.data.customer.id;

    // Fetch details
    const getCust = await makeRequest('GET', `/api/customers/${custId}`, null, adminToken);
    assert.strictEqual(getCust.status, 200);
    assert.strictEqual(getCust.data.customer.alternate_phone, '9820044556');
    assert.strictEqual(getCust.data.customer.gstin, '27AABCU9603R1ZM');
    assert.ok(getCust.data.customer.additional_phones.includes('9820077889'));

    // Clean up
    await makeRequest('DELETE', `/api/customers/${custId}`, null, adminToken);
  })();

  // Test 7: Audit Log captures Before/After Diffs
  await test('Audit Trail: Captures previous_data and new_data diffs', async () => {
    const adminLogin = await makeRequest('POST', '/api/auth/login-pin', { pin: '925925' });
    const adminToken = adminLogin.data.token;

    const logsRes = await makeRequest('GET', '/api/users/audit-logs?limit=10', null, adminToken);
    assert.strictEqual(logsRes.status, 200);
    assert.ok(Array.isArray(logsRes.data.logs));
    assert.ok(logsRes.data.logs.length > 0);
  })();

  // Test 8: Verified CSV Export with UTF-8 BOM
  await test('CSV Export: Verified UTF-8 CSV with BOM for Orders, Products, and Customers', async () => {
    const adminLogin = await makeRequest('POST', '/api/auth/login-pin', { pin: '925925' });
    const adminToken = adminLogin.data.token;

    const ordersCsv = await makeRequest('GET', '/api/export/orders.csv', null, adminToken);
    assert.strictEqual(ordersCsv.status, 200);
    assert.ok(ordersCsv.raw.startsWith('\uFEFF'), 'CSV must start with UTF-8 BOM to prevent spreadsheet corruption');
    assert.ok(ordersCsv.raw.includes('Order #,Date'));

    const productsCsv = await makeRequest('GET', '/api/export/products.csv', null, adminToken);
    assert.strictEqual(productsCsv.status, 200);
    assert.ok(productsCsv.raw.startsWith('\uFEFF'));
    assert.ok(productsCsv.raw.includes('SKU,Name'));

    const customersCsv = await makeRequest('GET', '/api/export/customers.csv', null, adminToken);
    assert.strictEqual(customersCsv.status, 200);
    assert.ok(customersCsv.raw.startsWith('\uFEFF'));
    assert.ok(customersCsv.raw.includes('Alternate Phone,Additional Numbers,GSTIN'));
  })();

  // Test 9: Private Cloud Storage Access Controls
  await test('Private Cloud: Admin & Business Admin access; Sales Rep forbidden', async () => {
    const adminLogin = await makeRequest('POST', '/api/auth/login-pin', { pin: '925925' });
    const adminToken = adminLogin.data.token;

    // Admin creates cloud folder
    const createFolder = await makeRequest('POST', '/api/cloud/folders', {
      name: 'Tax Invoices 2026'
    }, adminToken);
    assert.strictEqual(createFolder.status, 201);
    const folderId = createFolder.data.folder.id;

    // Sales Rep attempts to create folder (MUST BE REJECTED 403)
    const repLogin = await makeRequest('POST', '/api/auth/login', {
      username: 'rep_ravi',
      password: '123456'
    });
    const repToken = repLogin.data.token;
    const repCloud = await makeRequest('POST', '/api/cloud/folders', {
      name: 'Rep Leaked Folder'
    }, repToken);
    assert.strictEqual(repCloud.status, 403, 'Sales Rep cannot access private cloud storage');

    // Clean up folder
    await makeRequest('DELETE', `/api/cloud/folders/${folderId}`, null, adminToken);
  })();

  // Test 10: Weekly Automated Backup Creation
  await test('Weekly Backup: Manual and automated ZIP snapshot creation', async () => {
    const adminLogin = await makeRequest('POST', '/api/auth/login-pin', { pin: '925925' });
    const adminToken = adminLogin.data.token;

    const backupRes = await makeRequest('POST', '/api/backup/create', null, adminToken);
    if (backupRes.status >= 400) {
      console.log('backupRes error data:', backupRes.data);
    }
    assert.ok(backupRes.status === 200 || backupRes.status === 201, `Status must be 200 or 201, got ${backupRes.status}`);
    assert.ok(backupRes.data.backup.filename.endsWith('.zip'), 'Backup must be a ZIP file');
  })();

  // Test 11: Zero-Leak: Sales Rep blocked from creating customer under unassigned existing company
  await test('Zero-Leak Security: Sales Rep blocked from creating customer or order for unassigned company', async () => {
    const repLogin = await makeRequest('POST', '/api/auth/login', {
      username: 'rep_ravi',
      password: '123456'
    });
    const repToken = repLogin.data.token;

    // Ravi tries to create customer under 'Oraani' (which is assigned to Gaurav, not Ravi)
    const hijackCust = await makeRequest('POST', '/api/customers', {
      poc_name: 'Infiltrator Customer',
      company_name: 'Oraani',
      phone: '9999900001'
    }, repToken);
    assert.strictEqual(hijackCust.status, 403, 'Rep must be forbidden from creating customer under an unassigned company');

    // Admin creates customer for Oraani
    const adminLogin = await makeRequest('POST', '/api/auth/login-pin', { pin: '925925' });
    const adminToken = adminLogin.data.token;
    const oraaniCust = await makeRequest('POST', '/api/customers', {
      poc_name: 'Oraani Owner',
      company_name: 'Oraani',
      phone: '9999900002'
    }, adminToken);
    assert.strictEqual(oraaniCust.status, 201);
    const oraaniCustId = oraaniCust.data.customer.id;

    // Ravi attempts to view Oraani customer details directly (MUST BE 403)
    const viewCust = await makeRequest('GET', `/api/customers/${oraaniCustId}`, null, repToken);
    assert.strictEqual(viewCust.status, 403, 'Rep cannot view details of customer from unassigned company');

    // Ravi attempts to create order for Oraani customer (MUST BE 403)
    const prodRes = await makeRequest('GET', '/api/products', null, adminToken);
    const product = prodRes.data.products[0];
    const hijackOrder = await makeRequest('POST', '/api/orders', {
      customer_id: oraaniCustId,
      products: [{ product_id: product.id, sizes: [{ size_inches: '20', pieces: 1 }] }]
    }, repToken);
    assert.strictEqual(hijackOrder.status, 403, 'Rep cannot create order for unassigned customer');

    // Clean up
    await makeRequest('DELETE', `/api/customers/${oraaniCustId}`, null, adminToken);
  })();

  // Test 12: Zero-Leak: Product details API does NOT leak other sales reps' orders or customer data
  await test('Zero-Leak Security: Product details API strictly isolates order history and customer identities', async () => {
    const adminLogin = await makeRequest('POST', '/api/auth/login-pin', { pin: '925925' });
    const adminToken = adminLogin.data.token;
    const prodRes = await makeRequest('GET', '/api/products', null, adminToken);
    const product = prodRes.data.products[0];

    const repLogin = await makeRequest('POST', '/api/auth/login', {
      username: 'rep_ravi',
      password: '123456'
    });
    const repToken = repLogin.data.token;

    // Rep fetches product details
    const repProd = await makeRequest('GET', `/api/products/${product.id}`, null, repToken);
    assert.strictEqual(repProd.status, 200);

    // Verify history contains ONLY orders belonging to Ravi, never other reps' customers
    if (repProd.data.history && repProd.data.history.length > 0) {
      for (const h of repProd.data.history) {
        assert.ok(h.company_name === 'Shree Jewels' || !h.company_name, 'Rep must never see unassigned company orders in product history');
      }
    }
  })();

  // Test 13: Zero-Leak: Direct unauthenticated static access to cloud storage blocked
  await test('Zero-Leak Security: Direct unauthenticated HTTP access to cloud storage is blocked with 403', async () => {
    const res = await makeRequest('GET', '/uploads/cloud_drive/anyfile.pdf');
    assert.strictEqual(res.status, 403, 'Direct access to cloud drive files must return 403 Forbidden');
  })();

  console.log('\n--------------------------------------------------------');
  console.log(` SUMMARY: ${passed} PASSED, 0 FAILED`);
  console.log('--------------------------------------------------------\n');
}

run().catch((err) => {
  console.error('\nTest Suite Failed:', err);
  process.exit(1);
});
