const assert = require('assert');
const http = require('http');
const { db } = require('../server/db/database');
const bcrypt = require('bcryptjs');

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

async function run() {
  console.log('\n======================================================');
  console.log('       TESTING BRAND ACCESS RESTRICTION & TOGGLES');
  console.log('======================================================\n');

  // 1. Admin login
  const adminLogin = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login-pin',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { pin: '925925', role: 'ADMIN' });
  assert.strictEqual(adminLogin.status, 200, 'Admin login should succeed');
  const adminToken = adminLogin.data.token;
  const adminHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`
  };

  // 2. Setup a test customer in database
  const phone = '9998881122';
  const email = 'brandtest@example.com';
  const password = 'password123';
  const pwHash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();
  const accountId = 'cacc_test_brand_toggle_' + Date.now();
  const customerId = 'cust_test_brand_toggle_' + Date.now();

  db.prepare('DELETE FROM customer_accounts WHERE phone = ? OR email = ?').run(phone, email);
  db.prepare('DELETE FROM customers WHERE phone = ?').run(phone);

  db.prepare(`
    INSERT INTO customers (id, poc_name, company_name, phone, email, address, state, zone, notes, category, country, brand, created_by_id, is_archived, created_at, updated_at)
    VALUES (?, 'Brand Tester', 'Brand Test Jewellers', ?, ?, 'Test Street', 'Maharashtra', 'West', 'Testing', 'Retailer', 'India', 'AI925', 'usr_admin_01', 0, ?, ?)
  `).run(customerId, phone, email, now, now);

  db.prepare(`
    INSERT INTO customer_accounts (id, full_name, company_name, phone, email, address, password_hash, account_type, brand, status, customer_id, can_view_ready, can_view_order, created_at, updated_at)
    VALUES (?, 'Brand Tester', 'Brand Test Jewellers', ?, ?, 'Test Street', ?, 'Retailer', 'AI925', 'APPROVED', ?, 1, 1, ?, ?)
  `).run(accountId, phone, email, pwHash, customerId, now, now);

  console.log('[PASS] Created test customer account');

  // 3. Test AI 925 Only access
  console.log('\n--- Case 1: Customer restricted to AI 925 only ---');
  // Login to AI 925 -> Should Succeed
  const aiLoginRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/portal/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Brand': 'AI925' }
  }, { identifier: phone, password });
  assert.strictEqual(aiLoginRes.status, 200, 'AI925 login must succeed when customer is AI925');
  assert.strictEqual(aiLoginRes.data.account.brand, 'AI925');
  console.log('[PASS] Sign in on AI 925 allowed');

  // Login to Oraani -> Must be BLOCKED (403)
  const oraaniBlockLogin = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/portal/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Brand': 'ORAANI' }
  }, { identifier: phone, password });
  assert.strictEqual(oraaniBlockLogin.status, 403, 'Oraani login must be blocked with 403');
  assert.strictEqual(oraaniBlockLogin.data.brand_restricted, true, 'Must indicate brand_restricted: true');
  console.log('[PASS] Sign in on Oraani blocked with 403:', oraaniBlockLogin.data.error);

  // OTP Send on Oraani -> Must be BLOCKED (403)
  const oraaniOtpBlock = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/portal/otp/send',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Brand': 'ORAANI' }
  }, { destination: phone, purpose: 'LOGIN' });
  assert.strictEqual(oraaniOtpBlock.status, 403, 'Oraani OTP dispatch must be blocked with 403');
  assert.strictEqual(oraaniOtpBlock.data.brand_restricted, true);
  console.log('[PASS] OTP dispatch on Oraani blocked with 403');

  // 4. Admin toggles access to ORAANI Only
  console.log('\n--- Case 2: Admin toggles customer to Oraani only ---');
  const toggleOraaniRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/requests/customer-accounts/${accountId}/access`,
    method: 'PUT',
    headers: adminHeaders
  }, { brand: 'ORAANI' });
  assert.strictEqual(toggleOraaniRes.status, 200, 'Admin set access should return 200');
  assert.strictEqual(toggleOraaniRes.data.account.brand, 'ORAANI');
  console.log('[PASS] Admin toggle updated brand access to ORAANI');

  // Login to Oraani -> Should Succeed
  const oraaniLoginRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/portal/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Brand': 'ORAANI' }
  }, { identifier: phone, password });
  assert.strictEqual(oraaniLoginRes.status, 200, 'Oraani login must succeed when customer is ORAANI');
  console.log('[PASS] Sign in on Oraani allowed');

  // Login to AI 925 -> Must be BLOCKED (403)
  const aiBlockLogin = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/portal/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Brand': 'AI925' }
  }, { identifier: phone, password });
  assert.strictEqual(aiBlockLogin.status, 403, 'AI925 login must be blocked with 403');
  assert.strictEqual(aiBlockLogin.data.brand_restricted, true);
  console.log('[PASS] Sign in on AI 925 blocked with 403:', aiBlockLogin.data.error);

  // 5. Admin toggles access to BOTH
  console.log('\n--- Case 3: Admin toggles customer to BOTH brands ---');
  const toggleBothRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/requests/customer-accounts/${accountId}/access`,
    method: 'PUT',
    headers: adminHeaders
  }, { brand: 'BOTH' });
  assert.strictEqual(toggleBothRes.status, 200);
  assert.strictEqual(toggleBothRes.data.account.brand, 'BOTH');
  console.log('[PASS] Admin toggle updated brand access to BOTH');

  // Login to AI 925 -> Should Succeed
  const aiBothLogin = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/portal/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Brand': 'AI925' }
  }, { identifier: phone, password });
  assert.strictEqual(aiBothLogin.status, 200, 'AI925 login must succeed when brand is BOTH');
  console.log('[PASS] Sign in on AI 925 allowed under BOTH');

  // Login to Oraani -> Should Succeed
  const oraaniBothLogin = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/portal/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Brand': 'ORAANI' }
  }, { identifier: phone, password });
  assert.strictEqual(oraaniBothLogin.status, 200, 'Oraani login must succeed when brand is BOTH');
  console.log('[PASS] Sign in on Oraani allowed under BOTH');

  // Cleanup
  db.prepare('DELETE FROM customer_accounts WHERE id = ?').run(accountId);
  db.prepare('DELETE FROM customers WHERE id = ?').run(customerId);

  console.log('\n======================================================');
  console.log(' ALL BRAND ACCESS RESTRICTION TESTS PASSED PERFECTLY!');
  console.log('======================================================\n');
}

run().catch(err => {
  console.error('\nTest failed:', err);
  process.exit(1);
});
