const express = require('express');
const { db } = require('../server/db/database');
const { generateToken } = require('../server/middleware/auth');

const app = express();
app.use(express.json());
app.use('/api/customers', require('../server/routes/customers'));

const admin = db.prepare("SELECT * FROM users WHERE role = 'ADMIN'").get();
const rep = db.prepare("SELECT * FROM users WHERE role = 'SALES_REP'").get();

const adminToken = generateToken(admin);
const repToken = generateToken(rep);

async function runTests() {
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const testPhone = '9' + Math.floor(100000000 + Math.random() * 900000000);
    const testPhoneEdited = '9' + Math.floor(100000000 + Math.random() * 900000000);

    console.log('--- TEST 1: Sales Rep creates a new customer ---');
    const createRes = await fetch(`${baseUrl}/api/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${repToken}`
      },
      body: JSON.stringify({
        poc_name: 'Test Customer Rep',
        company_name: 'Rep Jewelers Ltd',
        phone: testPhone,
        city: 'Mumbai',
        state: 'Maharashtra',
        zone: 'West'
      })
    });
    const createBody = await createRes.json();
    console.log('Customer created status:', createRes.status);
    if (createRes.status !== 201) {
      console.error('FAILED to create customer:', createBody);
      process.exit(1);
    }
    const testCustomerId = createBody.customer.id;
    console.log('Customer ID:', testCustomerId, 'Created by ID:', createBody.customer.created_by_id);

    console.log('\n--- TEST 2: Sales Rep modifies the customer for the FIRST time (SHOULD SUCCEED) ---');
    const repModify1Res = await fetch(`${baseUrl}/api/customers/${testCustomerId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${repToken}`
      },
      body: JSON.stringify({
        poc_name: 'Test Customer Rep (Edited 1)',
        phone: testPhoneEdited
      })
    });
    const repModify1Body = await repModify1Res.json();
    console.log('Rep modify 1 status:', repModify1Res.status, 'Message:', repModify1Body.message);
    if (repModify1Res.status !== 200) {
      console.error('FAILED: Rep could not modify customer first time:', repModify1Body);
      process.exit(1);
    }

    console.log('\n--- TEST 3: Sales Rep attempts to modify the customer a SECOND time (MUST BE REJECTED 403) ---');
    const repModify2Res = await fetch(`${baseUrl}/api/customers/${testCustomerId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${repToken}`
      },
      body: JSON.stringify({
        poc_name: 'Test Customer Rep (Edited 2 should fail)'
      })
    });
    const repModify2Body = await repModify2Res.json();
    console.log('Rep modify 2 status (Expect 403):', repModify2Res.status, 'Error:', repModify2Body.error);
    if (repModify2Res.status !== 403) {
      console.error('FAILED: Sales Rep was NOT blocked from modifying a customer more than once!');
      process.exit(1);
    }

    console.log('\n--- TEST 4: Sales Rep attempts to delete the customer (MUST BE REJECTED 403) ---');
    const repDeleteRes = await fetch(`${baseUrl}/api/customers/${testCustomerId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${repToken}`
      }
    });
    const repDeleteBody = await repDeleteRes.json();
    console.log('Rep delete status (Expect 403):', repDeleteRes.status, 'Error:', repDeleteBody.error);
    if (repDeleteRes.status !== 403) {
      console.error('FAILED: Sales Rep was NOT blocked from deleting customer!');
      process.exit(1);
    }

    console.log('\n--- TEST 5: Sales Rep attempts to modify an Admin-created customer (MUST BE REJECTED 403) ---');
    const adminCustomerPhone = '9' + Math.floor(100000000 + Math.random() * 900000000);
    const adminCustomerRes = await fetch(`${baseUrl}/api/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        poc_name: 'Admin Exclusive Customer',
        company_name: 'Admin Exclusive Ltd',
        phone: adminCustomerPhone,
        city: 'Delhi',
        state: 'Delhi',
        zone: 'North'
      })
    });
    const adminCustomer = (await adminCustomerRes.json()).customer;
    const repHijackRes = await fetch(`${baseUrl}/api/customers/${adminCustomer.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${repToken}`
      },
      body: JSON.stringify({ poc_name: 'Hijacked by rep' })
    });
    const repHijackBody = await repHijackRes.json();
    console.log('Rep hijack status (Expect 403):', repHijackRes.status, 'Error:', repHijackBody.error);
    if (repHijackRes.status !== 403) {
      console.error('FAILED: Sales Rep was NOT blocked from modifying a customer created by another user!');
      process.exit(1);
    }
    // Clean up adminCustomer
    await fetch(`${baseUrl}/api/customers/${adminCustomer.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    console.log('\n--- TEST 6: Admin modifies the customer (SHOULD SUCCEED - UNLIMITED EDITS) ---');
    const adminModifyRes = await fetch(`${baseUrl}/api/customers/${testCustomerId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        poc_name: 'Admin Overridden Name',
        company_name: 'Admin Updated Jewelers'
      })
    });
    const adminModifyBody = await adminModifyRes.json();
    console.log('Admin modify status:', adminModifyRes.status, 'Message:', adminModifyBody.message);
    if (adminModifyRes.status !== 200) {
      console.error('FAILED: Admin could not modify customer:', adminModifyBody);
      process.exit(1);
    }

    console.log('\n--- TEST 7: Admin deletes the customer (SHOULD SUCCEED) ---');
    const adminDeleteRes = await fetch(`${baseUrl}/api/customers/${testCustomerId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });
    const adminDeleteBody = await adminDeleteRes.json();
    console.log('Admin delete status (Expect 200):', adminDeleteRes.status, 'Message:', adminDeleteBody.message);
    if (adminDeleteRes.status !== 200) {
      console.error('FAILED: Admin could not delete customer:', adminDeleteBody);
      process.exit(1);
    }

    // Verify customer is deleted or archived
    const check = db.prepare('SELECT * FROM customers WHERE id = ?').get(testCustomerId);
    console.log('Customer in DB after deletion:', check ? (check.is_archived ? 'ARCHIVED (SUCCESS)' : 'EXISTS (ERROR)') : 'DELETED (SUCCESS)');

    console.log('\n>>> ALL 7 CUSTOMER ROLE & ACTION TESTS PASSED PERFECTLY! <<<');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
