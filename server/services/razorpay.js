// Razorpay Payment Gateway Service — Dedicated to Oraani brand
const crypto = require('crypto');
const { db } = require('../db/database');
const { round2 } = require('../utils/pricing');

const SETTINGS_KEY = 'oraani_razorpay_settings';

/**
 * Get active Razorpay configuration for Oraani.
 * Checks app_settings first, then falls back to environment variables.
 */
function getRazorpayConfig() {
  let saved = null;
  try {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(SETTINGS_KEY);
    if (row && row.value) {
      saved = JSON.parse(row.value);
    }
  } catch {}

  const key_id = (saved && saved.key_id) || process.env.RAZORPAY_KEY_ID || '';
  const key_secret = (saved && saved.key_secret) || process.env.RAZORPAY_KEY_SECRET || '';
  const webhook_secret = (saved && saved.webhook_secret) || process.env.RAZORPAY_WEBHOOK_SECRET || '';
  const is_active = saved && saved.is_active !== undefined ? Boolean(saved.is_active) : true;

  const is_configured = Boolean(key_id.trim() && key_secret.trim());
  const is_test_mode = key_id.startsWith('rzp_test_');

  return {
    key_id: key_id.trim(),
    key_secret: key_secret.trim(),
    webhook_secret: webhook_secret.trim(),
    is_active,
    is_configured,
    is_test_mode,
    is_env_configured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
  };
}

/**
 * Save Razorpay credentials (e.g. from Admin Settings)
 */
function saveRazorpayConfig({ key_id, key_secret, webhook_secret, is_active = true }) {
  const current = getRazorpayConfig();
  const next = {
    key_id: key_id !== undefined ? String(key_id).trim() : current.key_id,
    key_secret: key_secret !== undefined && key_secret !== '' ? String(key_secret).trim() : current.key_secret,
    webhook_secret: webhook_secret !== undefined ? String(webhook_secret).trim() : current.webhook_secret,
    is_active: Boolean(is_active)
  };

  const now = new Date().toISOString();
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)')
    .run(SETTINGS_KEY, JSON.stringify(next), now);

  return {
    key_id: next.key_id,
    has_secret: Boolean(next.key_secret),
    webhook_secret: next.webhook_secret,
    is_active: next.is_active,
    is_configured: Boolean(next.key_id && next.key_secret)
  };
}

/**
 * Create an order on Razorpay API (Paise = INR * 100).
 * Strictly enforced: Only for Oraani orders.
 */
async function createRazorpayOrder({ order, amountRupees, receipt, notes = {} }) {
  const orderBrand = String(order.brand || 'AI925').toUpperCase();
  if (orderBrand !== 'ORAANI') {
    throw new Error('Razorpay gateway is only available for Oraani brand orders.');
  }

  const amountPaise = Math.round(round2(amountRupees) * 100);
  if (amountPaise <= 0) {
    throw new Error('Payable amount must be greater than zero.');
  }

  const config = getRazorpayConfig();

  // If Razorpay keys are not yet entered, generate a simulated order ID for developer testing
  if (!config.is_configured || !config.is_active) {
    const simId = 'order_sim_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    return {
      id: simId,
      amount: amountPaise,
      currency: 'INR',
      receipt: receipt || order.order_number,
      status: 'created',
      is_simulated: true,
      key_id: config.key_id || 'rzp_test_simulated'
    };
  }

  const authHeader = 'Basic ' + Buffer.from(`${config.key_id}:${config.key_secret}`).toString('base64');
  const payload = {
    amount: amountPaise,
    currency: 'INR',
    receipt: String(receipt || order.order_number || order.id).slice(0, 40),
    notes: {
      order_id: order.id,
      order_number: order.order_number,
      brand: 'ORAANI',
      ...notes
    }
  };

  try {
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      const msg = (data && data.error && (data.error.description || data.error.message)) || `Razorpay API error: ${res.status}`;
      throw new Error(msg);
    }

    return {
      id: data.id,
      amount: data.amount,
      currency: data.currency,
      receipt: data.receipt,
      status: data.status,
      is_simulated: false,
      key_id: config.key_id
    };
  } catch (err) {
    console.error('[Razorpay Order Error]:', err.message);
    throw err;
  }
}

/**
 * Verify Razorpay HMAC SHA256 payment signature
 */
function verifyPaymentSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return false;
  }

  // Simulated order fallback for sandbox/dev testing
  if (razorpay_order_id.startsWith('order_sim_')) {
    return razorpay_signature.startsWith('sim_sig_') || razorpay_signature === 'valid_simulated_sig';
  }

  const config = getRazorpayConfig();
  if (!config.key_secret) {
    return false;
  }

  const body = razorpay_order_id + '|' + razorpay_payment_id;
  const expected = crypto
    .createHmac('sha256', config.key_secret)
    .update(body)
    .digest('hex');

  // Timing safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(razorpay_signature, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Verify Webhook signature from Razorpay
 */
function verifyWebhookSignature(rawBody, signature) {
  const config = getRazorpayConfig();
  if (!config.webhook_secret || !signature) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', config.webhook_secret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(signature, 'utf8'));
  } catch {
    return false;
  }
}

module.exports = {
  getRazorpayConfig,
  saveRazorpayConfig,
  createRazorpayOrder,
  verifyPaymentSignature,
  verifyWebhookSignature
};
