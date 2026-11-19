const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { authenticateToken, logAudit } = require('../middleware/auth');
const { buildPricedItems, sumPricing, insertOrder, restoreReadyStock, currentRateOrZero } = require('../services/orders');
const { recordPayment, PAYMENT_METHODS } = require('../services/payments');
const { round2 } = require('../utils/pricing');

// GET /api/orders (List orders with filters & Sales Rep Isolation)
router.get('/', authenticateToken, (req, res) => {
  const { search, status, customer_id, sales_rep_id, start_date, end_date, zone, state, city, order_type, brand } = req.query;
  const isRep = req.user.role === 'SALES_REP';

  let query = `
    SELECT 
      o.*,
      c.poc_name as customer_poc_name,
      c.company_name as customer_company_name,
      c.phone as customer_phone,
      c.city as customer_city,
      c.state as customer_state,
      c.zone as customer_zone,
      u.full_name as creator_name,
      u.role as creator_role,
      sr.full_name as sales_rep_name,
      sr.role as sales_rep_role
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    JOIN users u ON o.creator_id = u.id
    LEFT JOIN users sr ON o.sales_rep_id = sr.id
    WHERE 1=1
  `;

  const params = [];

  // STRICT SECURITY RULE: Sales Rep can ONLY see their own orders
  if (isRep) {
    query += ` AND (o.creator_id = ? OR o.sales_rep_id = ?)`;
    params.push(req.user.id, req.user.id);
  } else if (sales_rep_id) {
    // Admin filtering by sales rep
    query += ` AND (o.creator_id = ? OR o.sales_rep_id = ?)`;
    params.push(sales_rep_id, sales_rep_id);
  }

  if (brand && brand !== 'All') {
    query += ` AND o.brand = ?`;
    params.push(brand);
  }

  if (status && status !== 'All') {
    query += ` AND o.status = ?`;
    params.push(status);
  }

  if (customer_id) {
    query += ` AND o.customer_id = ?`;
    params.push(customer_id);
  }

  if (order_type && order_type !== 'All') {
    query += ` AND COALESCE(o.order_type, 'STANDARD') = ?`;
    params.push(order_type);
  }

  if (start_date) {
    query += ` AND o.order_date >= ?`;
    params.push(start_date);
  }

  if (end_date) {
    query += ` AND o.order_date <= ?`;
    params.push(end_date);
  }

  if (zone && zone !== 'All') {
    query += ` AND c.zone = ?`;
    params.push(zone);
  }

  if (state && state !== 'All') {
    query += ` AND c.state = ?`;
    params.push(state);
  }

  if (city && city !== 'All') {
    query += ` AND c.city = ?`;
    params.push(city);
  }

  if (search) {
    query += ` AND (
      o.order_number LIKE ? OR
      c.company_name LIKE ? OR
      c.poc_name LIKE ? OR
      c.phone LIKE ? OR
      EXISTS (
        SELECT 1 FROM order_items oi 
        JOIN products p ON oi.product_id = p.id 
        WHERE oi.order_id = o.id AND (p.name LIKE ? OR p.sku LIKE ?)
      )
    )`;
    const s = `%${search}%`;
    params.push(s, s, s, s, s, s);
  }

  query += ` ORDER BY o.order_date DESC, o.order_number DESC`;

  const orders = db.prepare(query).all(...params);

  res.json({ orders });
});

// GET /api/orders/:id (Order Details with strict isolation)
router.get('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const isRep = req.user.role === 'SALES_REP';

  const order = db.prepare(`
    SELECT 
      o.*,
      c.poc_name as customer_poc_name,
      c.company_name as customer_company_name,
      c.phone as customer_phone,
      c.address as customer_address,
      c.pin_code as customer_pin_code,
      c.city as customer_city,
      c.state as customer_state,
      c.zone as customer_zone,
      u.full_name as creator_name,
      u.role as creator_role,
      sr.full_name as sales_rep_name,
      sr.role as sales_rep_role
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    JOIN users u ON o.creator_id = u.id
    LEFT JOIN users sr ON o.sales_rep_id = sr.id
    WHERE o.id = ?
  `).get(id);

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // STRICT SECURITY CHECK: Sales Rep cannot access another rep's order
  if (isRep && order.creator_id !== req.user.id && order.sales_rep_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied: You do not have permission to view this order.' });
  }

  // Fetch Order Items grouped with product details
  const items = db.prepare(`
    SELECT 
      oi.*,
      p.name as product_name,
      p.sku as product_sku,
      p.category_id,
      p.wire_size,
      p.endings,
      p.lock_type,
      p.std_weight_per_20in,
      p.physical_stock,
      p.reserved_stock,
      (p.physical_stock - p.reserved_stock) as available_stock,
      c.name as category_name
    FROM order_items oi
    JOIN products p ON oi.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE oi.order_id = ?
    ORDER BY oi.created_at ASC
  `).all(id);

  // Fetch Delivery History
  const deliveries = db.prepare(`
    SELECT 
      d.*,
      u.full_name as dispatched_by_name
    FROM deliveries d
    LEFT JOIN users u ON d.dispatched_by_id = u.id
    WHERE d.order_id = ?
    ORDER BY d.delivery_number ASC, d.delivery_date ASC
  `).all(id);

  // Fetch items for each delivery
  for (const del of deliveries) {
    del.items = db.prepare(`
      SELECT 
        di.*,
        oi.size_inches,
        oi.product_id,
        p.name as product_name,
        p.sku as product_sku
      FROM delivery_items di
      JOIN order_items oi ON di.order_item_id = oi.id
      JOIN products p ON oi.product_id = p.id
      WHERE di.delivery_id = ?
    `).all(del.id);
  }

  // Fetch Shipment Images
  const images = db.prepare(`
    SELECT * FROM shipment_images 
    WHERE order_id = ? 
    ORDER BY created_at DESC
  `).all(id);

  const payments = db.prepare(`
    SELECT p.*, u.full_name as staff_name, ca.full_name as customer_name
    FROM payments p
    LEFT JOIN users u ON p.paid_by_type = 'STAFF' AND p.paid_by_id = u.id
    LEFT JOIN customer_accounts ca ON p.paid_by_type = 'CUSTOMER' AND p.paid_by_id = ca.id
    WHERE p.order_id = ?
    ORDER BY p.created_at DESC
  `).all(id);

  res.json({
    order,
    items,
    deliveries,
    images,
    payments
  });
});

// POST /api/orders/:id/payments (Dummy payment gateway - staff collects payment for an order)
router.post('/:id/payments', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { method, amount } = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  if (req.user.role === 'SALES_REP' && order.creator_id !== req.user.id && order.sales_rep_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied: You cannot collect payment for this order.' });
  }
  if (!PAYMENT_METHODS.includes(method)) {
    return res.status(400).json({ error: 'Please choose a valid payment method' });
  }

  try {
    const payment = recordPayment({ order, amount, method, paidByType: 'STAFF', paidById: req.user.id });
    logAudit(req.user.id, 'RECORD_PAYMENT', 'payments', payment.id, `Recorded dummy ${method} payment of Rs.${payment.amount} for order ${order.order_number}`, req);
    const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    res.status(201).json({ payment, order: updated, message: 'Payment successful' });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Payment failed' });
  }
});

// POST /api/orders (Create Order)
router.post('/', authenticateToken, (req, res) => {
  const { customer_id, advance_amount, special_notes, products, brand } = req.body;

  if (!customer_id) {
    return res.status(400).json({ error: 'Customer is required' });
  }

  if (!products || !Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: 'At least one product is required' });
  }

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const isRep = req.user.role === 'SALES_REP';

  // STRICT ISOLATION: Sales Rep cannot create an order for a customer from an unassigned company
  if (isRep) {
    const isAssigned = db.prepare(`
      SELECT 1 FROM rep_company_assignments WHERE user_id = ? AND company_name = ?
    `).get(req.user.id, customer.company_name);

    if (customer.created_by_id !== req.user.id && !isAssigned) {
      return res.status(403).json({ error: 'Access denied: You cannot create an order for a customer belonging to an unassigned company.' });
    }
  }
  // Creator & Sales Rep determination:
  // Server-side assignment: Sales rep is assigned to themselves if rep, or specified/admin
  const creatorId = req.user.id;
  const salesRepId = isRep ? req.user.id : (req.body.sales_rep_id || req.user.id);
  const silverRate = currentRateOrZero();

  try {
    const result = db.transaction(() => {
      const lines = buildPricedItems(products, silverRate);
      return insertOrder({
        customer,
        creatorId,
        salesRepId,
        lines,
        advanceAmount: advance_amount,
        specialNotes: special_notes,
        orderType: 'STANDARD',
        silverRate,
        movementUserId: req.user.id,
        brand: brand || customer.brand || 'AI925'
      });
    })();
    const created = db.prepare('SELECT * FROM orders WHERE id = ?').get(result.orderId);
    logAudit(req.user.id, 'CREATE_ORDER', 'orders', result.orderId, `Created order ${result.orderNumber}`, req, null, created);
    res.status(201).json({ order: created, message: 'Order created successfully' });
  } catch (err) {
    console.error('Order creation transaction failed:', err);
    res.status(400).json({ error: err.message || 'Failed to create order' });
  }
});

// POST /api/orders/:id/close (Close Order with validation)
router.post('/:id/close', authenticateToken, (req, res) => {
  const { id } = req.params;
  const isRep = req.user.role === 'SALES_REP';

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // Representatives cannot unilaterally close orders unless fully delivered
  if (isRep && order.creator_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied: You cannot close this order' });
  }

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
  const remainingPieces = items.reduce((acc, item) => acc + (item.requested_pieces - item.delivered_pieces), 0);

  // If pieces remain unfulfilled and user is not admin, prevent premature closure
  if (remainingPieces > 0 && isRep) {
    return res.status(400).json({
      error: `Cannot close order: ${remainingPieces} pieces are still outstanding. Administrator approval required for partial closure.`
    });
  }

  const now = new Date().toISOString();

  // Transaction to close order and release any remaining unfulfilled reserved stock
  const tx = db.transaction(() => {
    for (const item of items) {
      const unusedReserved = Math.max(0, item.allocated_pieces - item.delivered_pieces);
      if (unusedReserved > 0) {
        db.prepare('UPDATE products SET reserved_stock = MAX(0, reserved_stock - ?) WHERE id = ?').run(unusedReserved, item.product_id);
        db.prepare(`
          INSERT INTO inventory_movements (id, product_id, change_qty, movement_type, reason, related_order_id, user_id, created_at)
          VALUES (?, ?, ?, 'RETURN', ?, ?, ?, ?)
        `).run(
          'mov_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          item.product_id,
          unusedReserved,
          `Released unused reservation upon closing order ${order.order_number}`,
          id,
          req.user.id,
          now
        );
      }
    }

    restoreReadyStock(order, items);

    db.prepare(`
      UPDATE orders SET 
        status = 'CLOSED', 
        operational_status = 'Closed', 
        closed_at = ?, 
        closed_by_id = ?,
        updated_at = ?
      WHERE id = ?
    `).run(now, req.user.id, now, id);
  });

  try {
    tx();
    logAudit(req.user.id, 'CLOSE_ORDER', 'orders', id, `Closed order ${order.order_number}`, req);
    const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    res.json({ order: updated, message: 'Order closed successfully' });
  } catch (err) {
    console.error('Order closure failed:', err);
    res.status(500).json({ error: 'Failed to close order' });
  }
});

// PUT /api/orders/:id (Modify Order - Admin can modify any order; Sales Rep can modify their own)
router.put('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { customer_id, advance_amount, special_notes, products } = req.body;
  const isRep = req.user.role === 'SALES_REP';

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // Security check: Sales rep can only modify their own orders
  if (isRep && order.creator_id !== req.user.id && order.sales_rep_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied: You can only modify your own orders.' });
  }

  if (order.status === 'CLOSED' && isRep) {
    return res.status(400).json({ error: 'Closed orders cannot be modified by sales representatives.' });
  }

  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    // If customer is being changed
    let customerId = order.customer_id;
    if (customer_id && customer_id !== order.customer_id) {
      const cust = db.prepare('SELECT id, company_name, created_by_id FROM customers WHERE id = ?').get(customer_id);
      if (!cust) throw new Error('Customer not found');
      if (isRep) {
        const isAssigned = db.prepare(`
          SELECT 1 FROM rep_company_assignments WHERE user_id = ? AND company_name = ?
        `).get(req.user.id, cust.company_name);
        if (cust.created_by_id !== req.user.id && !isAssigned) {
          throw new Error('Access denied: You cannot reassign an order to an unassigned customer.');
        }
      }
      customerId = cust.id;
    }

    let totalPieces = order.total_pieces;
    let totalExpectedWeight = order.expected_weight;

    if (products && Array.isArray(products) && products.length > 0) {
      // 1. Release existing unfulfilled reserved stock for this order
      const currentItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
      for (const item of currentItems) {
        const unusedReserved = Math.max(0, item.allocated_pieces - item.delivered_pieces);
        if (unusedReserved > 0) {
          db.prepare('UPDATE products SET reserved_stock = MAX(0, reserved_stock - ?) WHERE id = ?').run(unusedReserved, item.product_id);
          db.prepare(`
            INSERT INTO inventory_movements (id, product_id, change_qty, movement_type, reason, related_order_id, user_id, created_at)
            VALUES (?, ?, ?, 'RETURN', ?, ?, ?, ?)
          `).run(
            'mov_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            item.product_id,
            unusedReserved,
            `Stock reservation cleared for modifying order ${order.order_number}`,
            id,
            req.user.id,
            now
          );
        }
      }

      // 2. Remove old order items, remembering each line's standard weight (the staff form doesn't send it)
      const priorStd = {};
      for (const it of db.prepare('SELECT product_id, size_inches, std_weight_g FROM order_items WHERE order_id = ?').all(id)) {
        if (it.std_weight_g) priorStd[`${it.product_id}|${Number(it.size_inches).toFixed(2)}`] = it.std_weight_g;
      }
      db.prepare('DELETE FROM order_items WHERE order_id = ?').run(id);

      // 3. Process new products & sizes (re-priced at the current silver rate)
      const silverRate = currentRateOrZero();
      const entries = products
        .filter(p => Array.isArray(p.sizes) && p.sizes.length > 0)
        .map(p => ({
          ...p,
          sizes: p.sizes.map(r => ({
            ...r,
            std_weight_g: r.std_weight_g ?? priorStd[`${p.product_id}|${(parseFloat(r.size_inches) || 20).toFixed(2)}`] ?? null
          }))
        }));
      const lines = buildPricedItems(entries, silverRate, order.order_type || 'STANDARD');
      if (lines.length === 0) {
        throw new Error('Please enter at least one valid size row with pieces > 0');
      }

      totalPieces = 0;
      totalExpectedWeight = 0.0;
      const insertItemStmt = db.prepare(`
        INSERT INTO order_items (
          id, order_id, product_id, size_inches, requested_pieces,
          allocated_pieces, delivered_pieces, expected_weight, delivered_weight, created_at,
          unit_weight, labour_per_gram, line_amount, std_weight_g
        ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0.0, ?, ?, ?, ?, ?)
      `);

      for (const line of lines) {
        // Re-read so earlier lines' reservations are reflected in available stock
        const prod = db.prepare('SELECT * FROM products WHERE id = ?').get(line.product.id);
        const availableStock = Math.max(0, prod.physical_stock - prod.reserved_stock);
        const allocatedPcs = Math.min(line.requested_pieces, availableStock);

        if (allocatedPcs > 0) {
          db.prepare('UPDATE products SET reserved_stock = reserved_stock + ? WHERE id = ?').run(allocatedPcs, prod.id);
          db.prepare(`
            INSERT INTO inventory_movements (id, product_id, change_qty, movement_type, reason, related_order_id, user_id, created_at)
            VALUES (?, ?, ?, 'ALLOCATION', ?, ?, ?, ?)
          `).run(
            'mov_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            prod.id,
            allocatedPcs,
            `Allocated for modified order ${order.order_number}`,
            id,
            req.user.id,
            now
          );
        }

        totalPieces += line.requested_pieces;
        totalExpectedWeight += line.expected_weight;

        insertItemStmt.run(
          'item_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
          id,
          prod.id,
          line.size_inches,
          line.requested_pieces,
          allocatedPcs,
          line.expected_weight,
          now,
          line.unit_weight,
          line.labour_per_gram,
          line.price.total,
          line.std_weight_g
        );
      }

      const totals = sumPricing(lines);
      // The delivery charge and any full-payment discount fixed at checkout stay as they were
      totals.total_amount = round2(totals.total_amount + (order.delivery_charge || 0) - (order.discount_amount || 0));
      db.prepare(`
        UPDATE orders SET silver_rate = ?, silver_amount = ?, labour_amount = ?, gst_amount = ?, total_amount = ?,
          payment_status = CASE WHEN paid_amount >= ? AND ? > 0 THEN 'PAID' WHEN paid_amount > 0 THEN 'PARTIAL' ELSE 'UNPAID' END
        WHERE id = ?
      `).run(silverRate, totals.silver_amount, totals.labour_amount, totals.gst_amount, totals.total_amount,
        totals.total_amount, totals.total_amount, id);
    }

    const advAmount = advance_amount !== undefined ? (parseFloat(advance_amount) || 0.0) : order.advance_amount;
    const notes = special_notes !== undefined ? special_notes : order.special_notes;

    db.prepare(`
      UPDATE orders SET
        customer_id = ?,
        advance_amount = ?,
        special_notes = ?,
        total_pieces = ?,
        expected_weight = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      customerId,
      advAmount,
      notes,
      totalPieces,
      parseFloat(totalExpectedWeight.toFixed(2)),
      now,
      id
    );
  });

  try {
    tx();
    const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    logAudit(req.user.id, 'MODIFY_ORDER', 'orders', id, `Modified order ${order.order_number}`, req, order, updated);
    res.json({ order: updated, message: 'Order modified successfully' });
  } catch (err) {
    console.error('Failed to modify order:', err);
    res.status(400).json({ error: err.message || 'Failed to modify order' });
  }
});

// DELETE /api/orders/:id (Admin ONLY)
router.delete('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  // STRICT SECURITY RULE: Only ADMIN can delete orders
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Access denied: Only administrators can delete orders.' });
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    // 1. Release all unfulfilled reserved inventory back to products
    const items = db.prepare('SELECT product_id, size_inches, requested_pieces, allocated_pieces, delivered_pieces FROM order_items WHERE order_id = ?').all(id);
    if (order.status !== 'CLOSED') restoreReadyStock(order, items);
    for (const item of items) {
      const unusedReserved = Math.max(0, item.allocated_pieces - item.delivered_pieces);
      if (unusedReserved > 0) {
        db.prepare('UPDATE products SET reserved_stock = MAX(0, reserved_stock - ?) WHERE id = ?').run(unusedReserved, item.product_id);
        db.prepare(`
          INSERT INTO inventory_movements (id, product_id, change_qty, movement_type, reason, related_order_id, user_id, created_at)
          VALUES (?, ?, ?, 'RETURN', ?, ?, ?, ?)
        `).run(
          'mov_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          item.product_id,
          unusedReserved,
          `Stock released on order deletion: ${order.order_number}`,
          id,
          req.user.id,
          now
        );
      }
    }

    // 2. Delete the order (cascading deletes order_items, deliveries, delivery_items, shipment_images)
    db.prepare('DELETE FROM orders WHERE id = ?').run(id);
  });

  try {
    tx();
    logAudit(req.user.id, 'DELETE_ORDER', 'orders', id, `Deleted order ${order.order_number}`, req);
    res.json({ success: true, message: `Order ${order.order_number} deleted successfully` });
  } catch (err) {
    console.error('Failed to delete order:', err);
    res.status(500).json({ error: err.message || 'Failed to delete order' });
  }
});

module.exports = router;
