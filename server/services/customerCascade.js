const { db } = require('../db/database');

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/**
 * Completely and safely cascades deletion of a customer and/or portal account.
 * Resolves all foreign key constraints in strict leaf-to-root order.
 * 
 * @param {Object} opts
 * @param {string} [opts.customerId]
 * @param {string} [opts.customerAccountId]
 * @param {string} [opts.phone]
 * @param {string} [opts.email]
 */
function deleteCustomerCompletely({ customerId = null, customerAccountId = null, phone = null, email = null }) {
  return db.transaction(() => {
    const matchedCustomerIds = new Set();
    const matchedAccountIds = new Set();
    const phones = new Set();
    const emails = new Set();

    if (phone) {
      const p = normalizePhone(phone);
      if (p) phones.add(p);
    }
    if (email && String(email).trim()) {
      emails.add(String(email).trim().toLowerCase());
    }

    // 1. Inspect customerAccountId if provided
    if (customerAccountId) {
      matchedAccountIds.add(customerAccountId);
      const acct = db.prepare('SELECT * FROM customer_accounts WHERE id = ?').get(customerAccountId);
      if (acct) {
        if (acct.customer_id) matchedCustomerIds.add(acct.customer_id);
        if (acct.phone) {
          const p = normalizePhone(acct.phone);
          if (p) phones.add(p);
        }
        if (acct.email) emails.add(acct.email.trim().toLowerCase());
      }
    }

    // 2. Inspect customerId if provided
    if (customerId) {
      matchedCustomerIds.add(customerId);
      const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
      if (cust) {
        if (cust.phone) {
          const p = normalizePhone(cust.phone);
          if (p) phones.add(p);
        }
        if (cust.email) emails.add(cust.email.trim().toLowerCase());
      }
    }

    // 3. Find any customer records matched by phone or email
    for (const ph of phones) {
      const rows = db.prepare(`
        SELECT id FROM customers 
        WHERE phone = ? 
           OR REPLACE(REPLACE(phone, ' ', ''), '+91', '') = ?
           OR phone LIKE ?
      `).all(ph, ph, `%${ph}`);
      rows.forEach(r => matchedCustomerIds.add(r.id));
    }
    for (const em of emails) {
      const rows = db.prepare('SELECT id FROM customers WHERE LOWER(email) = ?').all(em);
      rows.forEach(r => matchedCustomerIds.add(r.id));
    }

    // 4. Find all portal accounts linked to matched customer IDs or matched by phone/email
    for (const cid of matchedCustomerIds) {
      const rows = db.prepare('SELECT id FROM customer_accounts WHERE customer_id = ?').all(cid);
      rows.forEach(r => matchedAccountIds.add(r.id));
    }
    for (const ph of phones) {
      const rows = db.prepare(`
        SELECT id FROM customer_accounts 
        WHERE phone = ? 
           OR REPLACE(REPLACE(phone, ' ', ''), '+91', '') = ?
           OR phone LIKE ?
      `).all(ph, ph, `%${ph}`);
      rows.forEach(r => matchedAccountIds.add(r.id));
    }
    for (const em of emails) {
      const rows = db.prepare('SELECT id FROM customer_accounts WHERE LOWER(email) = ?').all(em);
      rows.forEach(r => matchedAccountIds.add(r.id));
    }

    // 5. Collect all orders belonging to matched customers OR matched accounts
    const matchedOrderIds = new Set();
    for (const cid of matchedCustomerIds) {
      const rows = db.prepare('SELECT id FROM orders WHERE customer_id = ?').all(cid);
      rows.forEach(r => matchedOrderIds.add(r.id));
    }
    for (const aid of matchedAccountIds) {
      const rows = db.prepare('SELECT id FROM orders WHERE customer_account_id = ?').all(aid);
      rows.forEach(r => matchedOrderIds.add(r.id));
    }

    const orderIdList = Array.from(matchedOrderIds);
    const accountIdList = Array.from(matchedAccountIds);
    const customerIdList = Array.from(matchedCustomerIds);

    // 6. Delete all order-related data in strict leaf-to-root foreign key order
    for (const ordId of orderIdList) {
      // a. Shipment images
      db.prepare(`
        DELETE FROM shipment_images 
        WHERE order_id = ? 
           OR delivery_id IN (SELECT id FROM deliveries WHERE order_id = ?)
      `).run(ordId, ordId);

      // b. Unlink inventory movements referencing this order
      db.prepare('UPDATE inventory_movements SET related_order_id = NULL WHERE related_order_id = ?').run(ordId);

      // c. Delivery items
      db.prepare(`
        DELETE FROM delivery_items 
        WHERE delivery_id IN (SELECT id FROM deliveries WHERE order_id = ?)
           OR order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)
      `).run(ordId, ordId);

      // d. Deliveries
      db.prepare('DELETE FROM deliveries WHERE order_id = ?').run(ordId);

      // e. Payments
      db.prepare('DELETE FROM payments WHERE order_id = ?').run(ordId);

      // f. Order items
      db.prepare('DELETE FROM order_items WHERE order_id = ?').run(ordId);

      // g. Order itself
      db.prepare('DELETE FROM orders WHERE id = ?').run(ordId);
    }

    // 7. Delete all portal account child records
    for (const aid of accountIdList) {
      db.prepare('DELETE FROM stock_requests WHERE customer_account_id = ?').run(aid);
      db.prepare('DELETE FROM call_bookings WHERE customer_account_id = ?').run(aid);
      db.prepare('DELETE FROM customer_change_requests WHERE customer_account_id = ?').run(aid);
      db.prepare('DELETE FROM customer_password_history WHERE customer_account_id = ?').run(aid);
      db.prepare('DELETE FROM customer_accounts WHERE id = ?').run(aid);
    }

    // 8. Delete customers
    for (const cid of customerIdList) {
      db.prepare('DELETE FROM customers WHERE id = ?').run(cid);
    }

    // 9. Extra safety cleanup for any lingering rows by normalized phone numbers
    for (const ph of phones) {
      db.prepare(`
        DELETE FROM customers 
        WHERE phone = ? 
           OR REPLACE(REPLACE(phone, ' ', ''), '+91', '') = ?
           OR phone LIKE ?
      `).run(ph, ph, `%${ph}`);

      db.prepare(`
        DELETE FROM customer_accounts 
        WHERE phone = ? 
           OR REPLACE(REPLACE(phone, ' ', ''), '+91', '') = ?
           OR phone LIKE ?
      `).run(ph, ph, `%${ph}`);
    }

    return {
      deletedCustomers: customerIdList.length,
      deletedAccounts: accountIdList.length,
      deletedOrders: orderIdList.length
    };
  })();
}

module.exports = {
  normalizePhone,
  deleteCustomerCompletely
};
