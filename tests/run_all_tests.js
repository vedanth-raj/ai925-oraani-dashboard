const { execSync, spawn } = require('child_process');
const http = require('http');

console.log('\n======================================================');
console.log('       RUNNING COMPLETE AI925 TEST SUITE');
console.log('======================================================\n');

function checkServer() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:3000/api/health', () => resolve(true));
    req.on('error', () => resolve(false));
    req.setTimeout(500, () => { req.destroy(); resolve(false); });
  });
}

async function run() {
  let serverProc = null;
  const isRunning = await checkServer();

  if (!isRunning) {
    // A server started here gets a test master code so that path is covered too
    if (!process.env.MASTER_CODE) process.env.MASTER_CODE = 'TEST-MASTER-' + Math.random().toString(36).slice(2, 10);
    serverProc = spawn('node', ['server/server.js'], { stdio: 'ignore', env: process.env });
    // Wait for server to come up
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (await checkServer()) break;
    }
  }

  try {
    console.log('>>> [1/5] Running Business Logic & SQLite Tests...\n');
    execSync('node tests/test_business_rules.js', { stdio: 'inherit' });

    console.log('>>> [2/5] Running End-to-End HTTP API & Security Tests...\n');
    execSync('node tests/test_e2e_api.js', { stdio: 'inherit' });

    console.log('>>> [3/5] Running Order Role Permissions & Action Tests...\n');
    execSync('node tests/test_order_permissions.js', { stdio: 'inherit' });

    console.log('>>> [4/5] Running Customer Role Permissions & Action Tests...\n');
    execSync('node tests/test_customer_permissions.js', { stdio: 'inherit' });

    console.log('>>> [5/5] Running Advanced Architecture, Isolation & Backup Tests...\n');
    execSync('node tests/test_advanced_features.js', { stdio: 'inherit' });

    console.log('>>> [6/6] Running Portal Access, Presence & Whole Inventory Tests...\n');
    execSync('node tests/test_portal_access_inventory.js', { stdio: 'inherit' });

    console.log('>>> [7/7] Running Security Hardening Tests...\n');
    execSync('node tests/test_security.js', { stdio: 'inherit' });

    console.log('>>> [8/8] Running Multi-Brand, State Premiums & Bulk Inventory Tests...\n');
    execSync('node tests/test_new_requirements.js', { stdio: 'inherit' });

    console.log('>>> [9/9] Running Brand Access Permission & Login Restriction Tests...\n');
    execSync('node tests/test_brand_access_restriction.js', { stdio: 'inherit' });

    console.log('>>> [10/10] Running Oraani Razorpay Payment Gateway Tests...\n');
    execSync('node tests/test_oraani_razorpay.js', { stdio: 'inherit' });

    console.log('\n======================================================');
    console.log(' ALL SUITES PASSED CLEANLY');
    console.log('======================================================\n');
  } catch (err) {
    console.error('\nTest suite failure:', err.message);
    process.exit(1);
  } finally {
    if (serverProc) {
      try { serverProc.kill(); } catch {}
    }
  }
}

run();

