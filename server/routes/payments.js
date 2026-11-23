const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { round2 } = require('../utils/pricing');

// GET /api/payments - History of transactions with customer details & brand filter
router.get('/', authenticateToken, (req, res) => {
  const brandFilter = String(req.query.brand || 'ALL').toUpperCase();
  const search = String(req.query.search || '').trim();
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

  let whereClauses = [];
  let params = [];

  if (brandFilter === 'ORAANI') {
    whereClauses.push("(UPPER(COALESCE(o.brand, c.brand, '')) = 'ORAANI')");
  } else if (brandFilter === 'AI925') {
    whereClauses.push("(UPPER(COALESCE(o.brand, c.brand, '')) != 'ORAANI')");
  }

  if (search) {
    const searchPattern = `%${search}%`;
    whereClauses.push(`(
      c.poc_name LIKE ? OR
      c.company_name LIKE ? OR
      c.phone LIKE ? OR
      o.order_number LIKE ? OR
      p.gateway_ref LIKE ? OR
      p.method LIKE ?
    )`);
    params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // 1. Fetch payments with order and customer metadata
  const listSql = `
    SELECT 
      p.id,
      p.order_id,
      p.amount,
      p.method,
      p.status,
      p.gateway_ref,
      p.paid_by_type,
      p.paid_by_id,
      p.created_at,
      o.order_number,
      o.order_type,
      o.total_amount as order_total,
      o.paid_amount as order_paid,
      o.payment_status as order_payment_status,
      CASE 
        WHEN UPPER(COALESCE(o.brand, c.brand, '')) = 'ORAANI' THEN 'ORAANI'
        ELSE 'AI925'
      END as brand,
      c.id as customer_id,
      COALESCE(c.poc_name, c.company_name, 'Guest Customer') as customer_name,
      c.company_name,
      c.phone as customer_phone,
      c.email as customer_email,
      c.city as customer_city,
      c.state as customer_state
    FROM payments p
    JOIN orders o ON p.order_id = o.id
    LEFT JOIN customers c ON o.customer_id = c.id
    ${whereSql}
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const payments = db.prepare(listSql).all(...params, limit, offset);

  // 2. Compute high-level totals
  const allRows = db.prepare(`
    SELECT 
      p.amount,
      CASE 
        WHEN UPPER(COALESCE(o.brand, c.brand, '')) = 'ORAANI' THEN 'ORAANI'
        ELSE 'AI925'
      END as brand
    FROM payments p
    JOIN orders o ON p.order_id = o.id
    LEFT JOIN customers c ON o.customer_id = c.id
  `).all();

  let total_amount = 0;
  let oraani_amount = 0;
  let oraani_count = 0;
  let ai925_amount = 0;
  let ai925_count = 0;

  for (const r of allRows) {
    const amt = Number(r.amount) || 0;
    total_amount += amt;
    if (r.brand === 'ORAANI') {
      oraani_amount += amt;
      oraani_count += 1;
    } else {
      ai925_amount += amt;
      ai925_count += 1;
    }
  }

  res.json({
    payments,
    summary: {
      total_amount: round2(total_amount),
      total_count: allRows.length,
      oraani_amount: round2(oraani_amount),
      oraani_count,
      ai925_amount: round2(ai925_amount),
      ai925_count
    }
  });
});

module.exports = router;
