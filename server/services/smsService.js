const https = require('https');
const { db } = require('../db/database');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

let awsSnsClient = null;

function getAwsSnsClient() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || 'ap-south-1';

  if (!accessKeyId || !secretAccessKey) return null;

  if (!awsSnsClient) {
    awsSnsClient = new SNSClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    });
  }
  return awsSnsClient;
}

async function sendViaAwsSns(mobile, otp, brandName) {
  const client = getAwsSnsClient();
  if (!client) return { success: false, error: 'AWS SNS credentials not available' };

  let phoneE164 = String(mobile || '').replace(/\D/g, '');
  if (phoneE164.length === 10) phoneE164 = '91' + phoneE164;
  if (!phoneE164.startsWith('+')) phoneE164 = '+' + phoneE164;

  const brand = String(brandName || '').toUpperCase().includes('ORAANI') ? 'Oraani' : 'AI925';
  const message = `Your ${brand} verification code is ${otp}. Valid for 5 minutes. Do not share this OTP with anyone.`;

  try {
    const cmd = new PublishCommand({
      PhoneNumber: phoneE164,
      Message: message,
      MessageAttributes: {
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional'
        },
        'AWS.SNS.SMS.SenderID': {
          DataType: 'String',
          StringValue: brand.slice(0, 11)
        }
      }
    });

    const res = await client.send(cmd);
    return {
      success: true,
      messageId: res.MessageId,
      provider: 'AWS_SNS'
    };
  } catch (err) {
    console.error(`[AWS SNS] Dispatch error for ${phoneE164}:`, err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Fetch SMS configuration from database app_settings or environment variables
 */
function getSmsConfig() {
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'sms_config'").get();
    if (row && row.value) {
      const parsed = JSON.parse(row.value);
      if (parsed.apiKey) return parsed;
    }
  } catch {}

  const apiKey = process.env.SMS_API_KEY || process.env.TWOFACTOR_API_KEY || process.env.FAST2SMS_API_KEY || '';
  const provider = process.env.SMS_PROVIDER || (process.env.TWOFACTOR_API_KEY ? '2factor' : 'fast2sms');

  return {
    provider,
    apiKey,
    senderId: process.env.SMS_SENDER_ID || 'ORAANI'
  };
}

/**
 * Save SMS configuration to app_settings
 */
function saveSmsConfig(config) {
  const json = JSON.stringify(config);
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('sms_config', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(json, new Date().toISOString());
}

/**
 * Dispatch live SMS via 2Factor.in API
 */
function sendVia2Factor(apiKey, mobile, otp, brandName) {
  return new Promise((resolve, reject) => {
    // 2Factor format: https://2factor.in/v3/{API_KEY}/SMS/{MOBILE}/{OTP}/{TEMPLATE_NAME}
    const cleanPhone = mobile.replace(/\D/g, '').slice(-10);
    const url = `https://2factor.in/v3/${encodeURIComponent(apiKey)}/SMS/${cleanPhone}/${encodeURIComponent(otp)}/OTP1`;

    const req = https.get(url, { timeout: 6000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.Status === 'Success') {
            resolve({ success: true, sessionId: parsed.Details });
          } else {
            resolve({ success: false, error: parsed.Details || '2Factor error' });
          }
        } catch (e) {
          resolve({ success: false, error: 'Invalid response from 2Factor' });
        }
      });
    });

    req.on('error', err => resolve({ success: false, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: '2Factor request timed out' });
    });
  });
}

/**
 * Dispatch live SMS via Fast2SMS Quick or OTP API
 */
function callFast2SMSApi(apiKey, payload) {
  return new Promise((resolve) => {
    const postData = JSON.stringify(payload);
    const options = {
      hostname: 'www.fast2sms.com',
      port: 443,
      path: '/dev/bulkV2',
      method: 'POST',
      headers: {
        'authorization': apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 8000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.return === true) {
            resolve({ success: true, messageId: parsed.request_id });
          } else {
            const errMsg = (parsed.message && Array.isArray(parsed.message) ? parsed.message[0] : parsed.message) || 'Fast2SMS error';
            resolve({ success: false, error: errMsg, statusCode: parsed.status_code });
          }
        } catch (e) {
          resolve({ success: false, error: 'Invalid response from Fast2SMS' });
        }
      });
    });

    req.on('error', err => resolve({ success: false, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Fast2SMS request timed out' });
    });

    req.write(postData);
    req.end();
  });
}

async function sendViaFast2SMS(apiKey, mobile, otp, brandName = 'Oraani') {
  const cleanPhone = mobile.replace(/\D/g, '').slice(-10);

  // Attempt 1: Try Quick route 'q'
  const qRes = await callFast2SMSApi(apiKey, {
    route: 'q',
    message: `Your ${brandName} verification code is ${otp}. Valid for 5 minutes.`,
    language: 'english',
    flash: 0,
    numbers: cleanPhone
  });

  if (qRes.success) return qRes;

  // Attempt 2: Try OTP route 'otp'
  const otpRes = await callFast2SMSApi(apiKey, {
    route: 'otp',
    variables_values: otp,
    numbers: cleanPhone
  });

  if (otpRes.success) return otpRes;

  const errorMsg = qRes.error || otpRes.error || 'Fast2SMS delivery failed';
  return { success: false, error: errorMsg, qError: qRes.error, otpError: otpRes.error };
}

/**
 * Send live SMS OTP to a 4G/5G mobile user
 */
async function sendOtpSms({ mobile, otp, brand = 'AI925' }) {
  const isOraani = String(brand).toUpperCase() === 'ORAANI';
  const brandName = isOraani ? 'Oraani' : 'AI925';
  const cleanPhone = String(mobile || '').replace(/\D/g, '').slice(-10);

  if (cleanPhone.length !== 10) {
    return { sent: false, error: 'Invalid 10-digit mobile number' };
  }

  console.log(`[SMS OTP] Dispatching ${otp} to mobile ${cleanPhone} (${brandName})`);

  // 1. First priority: AWS SNS (Official AWS Credentials)
  const awsClient = getAwsSnsClient();
  if (awsClient) {
    console.log(`[AWS SNS OTP] Dispatching ${otp} via AWS SNS to +91${cleanPhone} (${brandName})`);
    const awsRes = await sendViaAwsSns(cleanPhone, otp, brandName);
    if (awsRes.success) {
      console.log(`[AWS SNS OTP] Live SMS sent via AWS SNS! MessageId: ${awsRes.messageId}`);
      return { sent: true, provider: 'AWS_SNS', messageId: awsRes.messageId, dev_otp: otp };
    }
    console.warn(`[AWS SNS OTP] AWS SNS attempt failed: ${awsRes.error}. Falling back...`);
  }

  // 2. Secondary fallback: 2Factor or Fast2SMS
  const config = getSmsConfig();

  if (!config.apiKey) {
    console.warn(`[SMS OTP] No SMS API key configured in app_settings. SMS Code for ${cleanPhone} is: ${otp}`);
    return {
      sent: false,
      reason: 'NO_API_KEY_CONFIGURED',
      dev_otp: otp,
      message: `SMS gateway ready. Simulated delivery for ${cleanPhone}: ${otp}`
    };
  }

  let result;
  if (config.provider === '2factor') {
    result = await sendVia2Factor(config.apiKey, cleanPhone, otp, brandName);
  } else {
    result = await sendViaFast2SMS(config.apiKey, cleanPhone, otp, brandName);
  }

  if (result.success) {
    console.log(`[SMS OTP] Live SMS delivered successfully to ${cleanPhone}`);
    return { sent: true, details: result };
  } else {
    console.error(`[SMS OTP] Gateway delivery failed for ${cleanPhone}:`, result.error);
    return { sent: false, error: result.error, dev_otp: otp };
  }
}

module.exports = {
  getSmsConfig,
  saveSmsConfig,
  sendOtpSms,
  sendViaAwsSns
};
