const { db } = require('../db/database');
const { round2 } = require('../utils/pricing');
const { getPaymentTerms } = require('./commerce');

// Dummy gateway: every attempt succeeds. Swap recordPayment's body for a real gateway call later.
const PAYMENT_METHODS = ['UPI', 'CARD', 'NET_BANKING', 'CASH'];

function recordPayment({ order, amount, method, paidByType, paidById }) {
  const due = round2((order.total_amount || 0) - (order.paid_amount || 0));
  const payAmount = amount !== undefined && amount !== null && amount !== '' ? round2(parseFloat(amount)) : due;
  if (!(payAmount > 0)) {
    throw new Error(due <= 0 ? 'This order is already fully paid' : 'Enter a payment amount greater than zero');
  }

  const id = 'pay_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  const gatewayRef = 'DUMMY' + Date.now().toString().slice(-8) + Math.random().toString(36).substring(2, 6).toUpperCase();
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare(`
      INSERT INTO payments (id, order_id, amount, method, status, gateway_ref, paid_by_type, paid_by_id, created_at)
      VALUES (?, ?, ?, ?, 'SUCCESS', ?, ?, ?, ?)
    `).run(id, order.id, payAmount, method, gatewayRef, paidByType, paidById, now);

    const paid = round2((order.paid_amount || 0) + payAmount);
    const total = order.total_amount || 0;
    const status = total > 0 && paid >= total ? 'PAID' : 'PARTIAL';
    db.prepare('UPDATE orders SET paid_amount = ?, payment_status = ?, updated_at = ? WHERE id = ?')
      .run(paid, status, now, order.id);
  })();

  return db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
}

// The two ways to pay an unpaid On Order purchase: an advance (20% by default) or the full amount
// less a small discount. Anything already part-paid just pays its balance.
function paymentOptions(order) {
  const terms = getPaymentTerms();
  const due = round2((order.total_amount || 0) - (order.paid_amount || 0));
  if (order.order_type !== 'ON_ORDER' || (order.paid_amount || 0) > 0 || due <= 0) {
    return { choices: false, due, terms };
  }
  const discount = round2(order.total_amount * terms.full_payment_discount_pct / 100);
  return {
    choices: true,
    due,
    terms,
    advance: { pct: terms.advance_pct, amount: round2(order.total_amount * terms.advance_pct / 100) },
    full: { discount_pct: terms.full_payment_discount_pct, discount, amount: round2(order.total_amount - discount) }
  };
}

// plan: 'ADVANCE' | 'FULL' (ignored once the order has a payment)
function payWithPlan({ order, method, plan, paidByType, paidById }) {
  const options = paymentOptions(order);
  if (!options.choices) {
    return recordPayment({ order, method, paidByType, paidById });
  }
  if (plan !== 'ADVANCE' && plan !== 'FULL') {
    throw new Error('Choose 20% advance or full payment');
  }
  return db.transaction(() => {
    const now = new Date().toISOString();
    if (plan === 'ADVANCE') {
      db.prepare("UPDATE orders SET payment_plan = 'ADVANCE', updated_at = ? WHERE id = ?").run(now, order.id);
      return recordPayment({ order, method, amount: options.advance.amount, paidByType, paidById });
    }
    db.prepare("UPDATE orders SET payment_plan = 'FULL', discount_amount = ?, total_amount = ?, updated_at = ? WHERE id = ?")
      .run(options.full.discount, options.full.amount, now, order.id);
    const discounted = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
    return recordPayment({ order: discounted, method, paidByType, paidById });
  })();
}

module.exports = { PAYMENT_METHODS, recordPayment, paymentOptions, payWithPlan };
