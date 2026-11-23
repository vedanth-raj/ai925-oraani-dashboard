const assert = require('assert');
const crypto = require('crypto');
const { db } = require('../server/db/database');
const {
  getRazorpayConfig,
  saveRazorpayConfig,
  createRazorpayOrder,
  verifyPaymentSignature,
  verifyWebhookSignature
} = require('../server/services/razorpay');
const { payWithPlan } = require('../server/services/payments');

console.log('\n======================================================');
console.log('       TESTING ORAANI RAZORPAY PAYMENT GATEWAY');
console.log('======================================================\n');

async function runTests() {
  // Test 1: Save and Retrieve Razorpay Configuration
  console.log('--- Test 1: Razorpay Configuration Persistence ---');
  const testKeyId = 'rzp_test_sampleKey123';
  const testKeySecret = 'sampleSecretSecretKey456';
  const testWebhookSecret = 'sampleWebhookSecret789';

  saveRazorpayConfig({
    key_id: testKeyId,
    key_secret: testKeySecret,
    webhook_secret: testWebhookSecret,
    is_active: true
  });

  const cfg = getRazorpayConfig();
  assert.strictEqual(cfg.key_id, testKeyId, 'Key ID should match saved key');
  assert.strictEqual(cfg.key_secret, testKeySecret, 'Key Secret should match saved secret');
  assert.strictEqual(cfg.is_active, true, 'Gateway should be active');
  assert.strictEqual(cfg.is_test_mode, true, 'rzp_test_ prefix should be detected as test mode');
  assert.strictEqual(cfg.is_configured, true, 'Configured flag should be true');
  console.log('[PASS] Razorpay settings correctly saved and retrieved');

  // Test 2: Brand Isolation Enforcement (Strictly Oraani Only)
  console.log('\n--- Test 2: Brand Isolation Enforcement ---');
  const ai925Order = {
    id: 'ord_ai925_test_' + Date.now(),
    order_number: 'AI925-101',
    brand: 'AI925',
    total_amount: 15000,
    paid_amount: 0
  };

  const oraaniOrder = {
    id: 'ord_oraani_test_' + Date.now(),
    order_number: 'ORAANI-202',
    brand: 'ORAANI',
    total_amount: 25000,
    paid_amount: 0
  };

  // Attempting to create Razorpay order for AI925 MUST be blocked
  let ai925Blocked = false;
  try {
    await createRazorpayOrder({
      order: ai925Order,
      amountRupees: 15000,
      receipt: 'AI925-101'
    });
  } catch (err) {
    ai925Blocked = true;
    assert(err.message.includes('only available for Oraani'), 'Error should specify Oraani only');
  }
  assert.strictEqual(ai925Blocked, true, 'AI 925 order must be rejected by Razorpay gateway');
  console.log('[PASS] AI 925 orders are strictly rejected by Razorpay gateway');

  // Test 3: Signature Verification (HMAC SHA-256)
  console.log('\n--- Test 3: HMAC SHA256 Signature Verification ---');
  const sampleOrderId = 'order_ABC1234567890';
  const samplePaymentId = 'pay_XYZ9876543210';

  const validSignature = crypto
    .createHmac('sha256', testKeySecret)
    .update(sampleOrderId + '|' + samplePaymentId)
    .digest('hex');

  const invalidSignature = 'invalid_forged_signature_hex_code_1234567890abcdef';

  const isSigValid = verifyPaymentSignature({
    razorpay_order_id: sampleOrderId,
    razorpay_payment_id: samplePaymentId,
    razorpay_signature: validSignature
  });
  assert.strictEqual(isSigValid, true, 'Authentic HMAC signature should verify successfully');

  const isForgedValid = verifyPaymentSignature({
    razorpay_order_id: sampleOrderId,
    razorpay_payment_id: samplePaymentId,
    razorpay_signature: invalidSignature
  });
  assert.strictEqual(isForgedValid, false, 'Forged signature must be rejected');
  console.log('[PASS] Signature verification passes valid HMAC and blocks forged signatures');

  // Test 4: Webhook Signature Verification
  console.log('\n--- Test 4: Webhook Signature Verification ---');
  const sampleWebhookBody = JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_hook_123', amount: 2500000 } } }
  });
  const validWebhookSig = crypto
    .createHmac('sha256', testWebhookSecret)
    .update(sampleWebhookBody)
    .digest('hex');

  assert.strictEqual(verifyWebhookSignature(sampleWebhookBody, validWebhookSig), true, 'Valid webhook signature accepted');
  assert.strictEqual(verifyWebhookSignature(sampleWebhookBody, 'fake_sig'), false, 'Invalid webhook signature rejected');
  console.log('[PASS] Webhook signature verification verified');

  // Test 5: Payment Processing & Database Status Transition
  console.log('\n--- Test 5: Order Payment Recording & Status Update ---');
  // Create customer and test order in db
  const testCustId = 'cust_rzp_test_' + Date.now();
  const testOrdId = 'ord_rzp_test_' + Date.now();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO customers (id, poc_name, company_name, phone, brand, created_at, updated_at)
    VALUES (?, 'Oraani VIP Client', 'Oraani Jewelers', '9988776655', 'ORAANI', ?, ?)
  `).run(testCustId, now, now);

  const testOrdNumber = 'ORA-' + Math.floor(100000 + Math.random() * 900000);
  db.prepare(`
    INSERT INTO orders (id, order_number, customer_id, creator_id, brand, total_amount, paid_amount, payment_status, order_date, created_at, updated_at)
    VALUES (?, ?, ?, 'usr_admin_01', 'ORAANI', 30000, 0, 'UNPAID', ?, ?, ?)
  `).run(testOrdId, testOrdNumber, testCustId, now, now, now);

  const testDbOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(testOrdId);

  // Record Razorpay payment
  const recorded = payWithPlan({
    order: testDbOrder,
    method: 'RAZORPAY',
    paidByType: 'CUSTOMER',
    paidById: testCustId,
    gatewayRef: 'pay_rzp_live_test_ref_999'
  });

  assert(recorded, 'Payment record should be created');
  assert.strictEqual(recorded.method, 'RAZORPAY', 'Method must be RAZORPAY');
  assert.strictEqual(recorded.gateway_ref, 'pay_rzp_live_test_ref_999', 'Gateway ref must store Razorpay payment ID');
  assert.strictEqual(recorded.amount, 30000, 'Paid amount must match full due');

  const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(testOrdId);
  assert.strictEqual(updatedOrder.payment_status, 'PAID', 'Order status should transition to PAID');
  assert.strictEqual(updatedOrder.paid_amount, 30000, 'Order paid_amount should be 30000');
  console.log('[PASS] Payment record and PAID order status correctly persisted with method=RAZORPAY');

  console.log('\n======================================================');
  console.log(' ALL ORAANI RAZORPAY GATEWAY TESTS PASSED PERFECTLY!');
  console.log('======================================================\n');
}

runTests().catch(err => {
  console.error('[TEST FAILURE]:', err);
  process.exit(1);
});
