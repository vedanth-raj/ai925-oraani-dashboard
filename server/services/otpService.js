const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db } = require('../db/database');
const { sendOtpEmail } = require('./mailer');

const OTP_EXPIRY_MINUTES = 5;
const MIN_RESEND_SECONDS = 30;
const MAX_ATTEMPTS = 5;

function hashOtp(otp) {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

/**
 * Generate and dispatch a secure 6-digit OTP
 */
async function generateAndSendOtp({ destination, purpose = 'LOGIN', brand = 'AI925' }) {
  const dest = String(destination || '').trim().toLowerCase();
  if (!dest) throw new Error('Email or mobile destination is required');

  const now = new Date();
  const nowIso = now.toISOString();

  // Rate limiting: check recent requests
  const recent = db.prepare(`
    SELECT created_at FROM customer_otps 
    WHERE destination = ? AND purpose = ? 
    ORDER BY created_at DESC LIMIT 1
  `).get(dest, purpose);

  if (recent) {
    const elapsedSec = (now.getTime() - new Date(recent.created_at).getTime()) / 1000;
    if (elapsedSec < MIN_RESEND_SECONDS) {
      const wait = Math.ceil(MIN_RESEND_SECONDS - elapsedSec);
      throw new Error(`Please wait ${wait} seconds before requesting a new code`);
    }
  }

  // Generate 6-digit numeric code
  const codeNum = Math.floor(100000 + Math.random() * 900000);
  const otp = String(codeNum);
  const otpHash = hashOtp(otp);

  const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();
  const id = 'otp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

  // Invalidate any previously unverified active OTPs for this destination & purpose
  db.prepare(`
    UPDATE customer_otps SET expires_at = ? 
    WHERE destination = ? AND purpose = ? AND verified_at IS NULL AND expires_at > ?
  `).run(nowIso, dest, purpose, nowIso);

  // Store in database
  db.prepare(`
    INSERT INTO customer_otps (id, destination, otp_hash, otp_plain, purpose, attempts, max_attempts, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
  `).run(id, dest, otpHash, otp, purpose, MAX_ATTEMPTS, expiresAt, nowIso);

  // Dispatch email if destination is an email
  let mailResult = { sent: false };
  if (dest.includes('@')) {
    mailResult = await sendOtpEmail({
      to: dest,
      otp,
      brand,
      purpose: purpose === 'LOGIN' ? 'sign-in' : 'registration'
    });
  } else {
    // For mobile numbers, log in console
    console.log(`[OTP SMS Simulation] Mobile ${dest} -> Code: ${otp}`);
  }

  return {
    ok: true,
    message: dest.includes('@') ? `Verification code sent to ${dest}` : `Verification code generated for ${dest}`,
    expires_in_seconds: OTP_EXPIRY_MINUTES * 60,
    dev_otp: mailResult.dev_otp || otp
  };
}

/**
 * Verify a submitted 6-digit OTP
 */
function verifyOtp({ destination, otp, purpose = 'LOGIN' }) {
  const dest = String(destination || '').trim().toLowerCase();
  const code = String(otp || '').trim();

  if (!dest || !code) {
    return { valid: false, error: 'Destination and OTP are required' };
  }

  const nowIso = new Date().toISOString();

  // Find the latest active OTP for this destination
  const record = db.prepare(`
    SELECT * FROM customer_otps 
    WHERE destination = ? AND purpose = ? AND verified_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).get(dest, purpose);

  if (!record) {
    return { valid: false, error: 'No active OTP found. Please request a new code.' };
  }

  if (new Date(record.expires_at) < new Date()) {
    return { valid: false, error: 'Verification code has expired. Please request a new code.' };
  }

  if (record.attempts >= record.max_attempts) {
    return { valid: false, error: 'Too many incorrect attempts. Please request a new code.' };
  }

  // Increment attempts
  db.prepare('UPDATE customer_otps SET attempts = attempts + 1 WHERE id = ?').run(record.id);

  const submittedHash = hashOtp(code);
  const isMatch = submittedHash === record.otp_hash;

  if (!isMatch) {
    const left = record.max_attempts - (record.attempts + 1);
    return {
      valid: false,
      error: left > 0 ? `Invalid code. ${left} attempt${left === 1 ? '' : 's'} remaining.` : 'Code locked due to too many attempts. Please request a new one.'
    };
  }

  // Mark verified
  db.prepare('UPDATE customer_otps SET verified_at = ? WHERE id = ?').run(nowIso, record.id);

  return { valid: true };
}

module.exports = {
  generateAndSendOtp,
  verifyOtp
};
