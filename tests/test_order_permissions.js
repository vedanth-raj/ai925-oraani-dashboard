const express = require('express');
const { db } = require('../server/db/database');
const { generateToken } = require('../server/middleware/auth');

const app = express();
app.use(express.json());
app.use('/api/orders', require('../server/routes/orders'));

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
    console.log('--- TEST 1: Create an order for testing ---');
    const customer = db.prepare(`
      SELECT c.id FROM customers c
      JOIN rep_company_assignments rca ON rca.company_name = c.company_name
      WHERE rca.user_id = ? AND c.is_archived = 0
      LIMIT 1
    `).get(rep.id) || db.prepare('SELECT id FROM customers WHERE created_by_id = ? AND is_archived = 0 LIMIT 1').get(rep.id);
    const product = db.prepare('SELECT id FROM products LIMIT 1').get();

    const createRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${repToken}`
      },
      body: JSON.stringify({
        customer_id: customer.id,
        advance_amount: 500,
        special_notes: 'Initial test note',
        products: [{
          product_id: product.id,
          sizes: [{ size_inches: '20', pieces: 5 }]
        }]
      })
    });
    const createBody = await createRes.json();
    console.log('Order created by Rep status:', createRes.status);
    const testOrderId = createBody.order.id;
    const testOrderNumber = createBody.order.order_number;
    console.log('Order Number:', testOrderNumber);

    console.log('\n--- TEST 1b: Verify Admin view labels order as made by Sales Representative ---');
    const getOrderRes = await fetch(`${baseUrl}/api/orders/${testOrderId}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const getOrderBody = await getOrderRes.json();
    console.log('Order creator role:', getOrderBody.order.creator_role, 'Creator name:', getOrderBody.order.creator_name);
    if (getOrderBody.order.creator_role !== 'SALES_REP' || !getOrderBody.order.creator_name) {
      console.error('FAILED: Order creator_role is not SALES_REP or creator_name is missing!');
      process.exit(1);
    }
    console.log('Admin label check: SUCCESS -> Made by Sales Representative:', getOrderBody.order.creator_name);

    console.log('\n--- TEST 2: Sales Rep modifies the order (SHOULD SUCCEED) ---');
    const repModifyRes = await fetch(`${baseUrl}/api/orders/${testOrderId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${repToken}`
      },
      body: JSON.stringify({
        customer_id: customer.id,
        advance_amount: 800,
        special_notes: 'Updated by Sales Rep on long-press',
        products: [{
          product_id: product.id,
          sizes: [{ size_inches: '22', pieces: 6 }]
        }]
      })
    });
    const repModifyBody = await repModifyRes.json();
    console.log('Rep modify status:', repModifyRes.status, 'Message:', repModifyBody.message);
    if (repModifyRes.status !== 200) {
      console.error('FAILED: Rep could not modify order:', repModifyBody);
      process.exit(1);
    }

    console.log('\n--- TEST 3: Sales Rep attempts to delete the order (MUST BE REJECTED 403) ---');
    const repDeleteRes = await fetch(`${baseUrl}/api/orders/${testOrderId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${repToken}`
      }
    });
    const repDeleteBody = await repDeleteRes.json();
    console.log('Rep delete status (Expect 403):', repDeleteRes.status, 'Error:', repDeleteBody.error);
    if (repDeleteRes.status !== 403) {
      console.error('FAILED: Sales Rep was not blocked from deleting order!');
      process.exit(1);
    }

    console.log('\n--- TEST 4: Admin modifies the order (SHOULD SUCCEED) ---');
    const adminModifyRes = await fetch(`${baseUrl}/api/orders/${testOrderId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        customer_id: customer.id,
        advance_amount: 1000,
        special_notes: 'Admin adjusted special notes',
        products: [{
          product_id: product.id,
          sizes: [{ size_inches: '20', pieces: 8 }]
        }]
      })
    });
    const adminModifyBody = await adminModifyRes.json();
    console.log('Admin modify status:', adminModifyRes.status, 'Message:', adminModifyBody.message);
    if (adminModifyRes.status !== 200) {
      console.error('FAILED: Admin could not modify order:', adminModifyBody);
      process.exit(1);
    }

    console.log('\n--- TEST 5: Admin deletes the order (SHOULD SUCCEED) ---');
    const adminDeleteRes = await fetch(`${baseUrl}/api/orders/${testOrderId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });
    const adminDeleteBody = await adminDeleteRes.json();
    console.log('Admin delete status (Expect 200):', adminDeleteRes.status, 'Message:', adminDeleteBody.message);
    if (adminDeleteRes.status !== 200) {
      console.error('FAILED: Admin could not delete order:', adminDeleteBody);
      process.exit(1);
    }

    // Verify it is gone from database
    const check = db.prepare('SELECT * FROM orders WHERE id = ?').get(testOrderId);
    console.log('Order in DB after deletion:', check ? 'EXISTS (ERROR)' : 'DELETED (SUCCESS)');

    console.log('\n>>> ALL 5 ROLE & ACTION TESTS PASSED PERFECTLY! <<<');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
