const { db } = require('../server/db/database');

// Clean test company assignments that are not part of seed data
db.prepare("DELETE FROM rep_company_assignments WHERE id NOT IN ('asgn_ravi_shree', 'asgn_gaurav_oraani')").run();

// Remove test customers and their relations
const testCustomers = db.prepare("SELECT id FROM customers WHERE company_name NOT IN ('Oraani', 'Aryan International', 'Silver Impex', 'Shree Jewels')").all();

for (const cust of testCustomers) {
  const custOrders = db.prepare("SELECT id FROM orders WHERE customer_id = ?").all(cust.id);
  for (const ord of custOrders) {
    db.prepare("DELETE FROM order_items WHERE order_id = ?").run(ord.id);
    db.prepare("DELETE FROM deliveries WHERE order_id = ?").run(ord.id);
    db.prepare("DELETE FROM shipment_images WHERE order_id = ?").run(ord.id);
    db.prepare("DELETE FROM orders WHERE id = ?").run(ord.id);
  }
  db.prepare("DELETE FROM customers WHERE id = ?").run(cust.id);
}

console.log('Database cleaned and synchronized with baseline seed state!');
