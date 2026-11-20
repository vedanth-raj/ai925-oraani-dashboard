const nodemailer = require('nodemailer');
const { db } = require('../db/database');

let cachedTransporter = null;
let lastConfigHash = '';

function getSmtpConfig() {
  // 1. Check database app_settings first
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'smtp_config'").get();
    if (row && row.value) {
      const parsed = JSON.parse(row.value);
      if (parsed.host && parsed.user && parsed.pass) {
        return parsed;
      }
    }
  } catch {}

  // 2. Check environment variables
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.SMTP_FROM || process.env.SMTP_USER
    };
  }

  return null;
}

function getTransporter() {
  const config = getSmtpConfig();
  if (!config) return null;

  const configHash = `${config.host}:${config.port}:${config.user}:${config.pass}`;
  if (cachedTransporter && lastConfigHash === configHash) {
    return cachedTransporter;
  }

  // Pooled connection keeps socket alive for instantaneous sub-second delivery
  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    rateDelta: 1000,
    rateLimit: 5
  });
  lastConfigHash = configHash;
  return cachedTransporter;
}

/**
 * Send OTP Email with brand styling and instant delivery
 */
async function sendOtpEmail({ to, otp, brand = 'AI925', purpose = 'sign-in' }) {
  const isOraani = String(brand).toUpperCase() === 'ORAANI';
  const brandName = isOraani ? 'Oraani' : 'AI925';
  const subject = `${otp} is your ${brandName} verification code`;

  console.log(`[OTP] Generated code ${otp} for ${to} (${brandName} ${purpose})`);

  const transporter = getTransporter();
  if (!transporter) {
    console.warn(`[OTP Mailer] No SMTP configured. Code for ${to} is: ${otp}`);
    return { sent: false, reason: 'NO_SMTP_CONFIGURED', dev_otp: otp };
  }

  const config = getSmtpConfig();
  const fromAddress = config.from || `"${brandName} Support" <${config.user}>`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F5F0E8; padding: 40px 15px; color: #2F2923;">
      <div style="max-width: 480px; margin: 0 auto; background-color: #FFFCF7; border: 1px solid #D2BFA7; border-radius: 16px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="margin: 0; color: #6B5744; font-size: 24px; letter-spacing: 1px; font-weight: bold;">${brandName}</h2>
          <p style="margin: 4px 0 0 0; font-size: 11px; text-transform: uppercase; tracking-widest: 1px; color: #766B60;">Security Verification</p>
        </div>
        
        <p style="font-size: 15px; margin: 0 0 16px 0; color: #2F2923;">Hello,</p>
        <p style="font-size: 14px; margin: 0 0 24px 0; color: #766B60; line-height: 1.5;">
          Use the one-time verification code below to complete your ${purpose === 'sign-in' ? 'sign in' : 'account verification'}.
        </p>

        <div style="background-color: #F5F0E8; border: 1px dashed #6B5744; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 24px;">
          <span style="font-family: 'Courier New', monospace; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2F2923;">${otp}</span>
        </div>

        <p style="font-size: 12px; color: #766B60; margin: 0 0 8px 0;">This code expires in <strong>5 minutes</strong>. Never share your OTP with anyone.</p>
        <p style="font-size: 12px; color: #766B60; margin: 0;">If you did not request this, please ignore this email.</p>

        <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #E8DCCB; font-size: 11px; color: #B49A7A; text-align: center;">
          ${brandName} Order Management System
        </div>
      </div>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      text: `Your ${brandName} verification code is: ${otp}. It expires in 5 minutes.`,
      html
    });
    console.log(`[OTP Mailer] Sent OTP to ${to}, messageId: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[OTP Mailer] Failed to send email to ${to}:`, err.message);
    return { sent: false, error: err.message, dev_otp: otp };
  }
}

module.exports = {
  getSmtpConfig,
  sendOtpEmail
};
