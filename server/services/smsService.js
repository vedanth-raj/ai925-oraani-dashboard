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

/**
 * Dispatch transactional SMS via MSG91 (India sub-2s carrier route)
 */
async function sendViaMsg91(mobile, otp, brandName) {
  const authKey = process.env.MSG91_AUTH_KEY;
  if (!authKey) {
    return { success: false, error: 'MSG91_AUTH_KEY not configured' };
  }

  let phone = String(mobile || '').replace(/\D/g, '');
  if (phone.length === 10) phone = '91' + phone;

  const templateId = process.env.MSG91_TEMPLATE_ID || '';
  const url = new URL('https://control.msg91.com/api/v5/otp');
  url.searchParams.set('mobile', phone);
  url.searchParams.set('otp', String(otp));
  if (templateId) url.searchParams.set('template_id', templateId);
  url.searchParams.set('authkey', authKey);

  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'authkey': authKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        otp: String(otp),
        brand: brandName
      })
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.type === 'success' || data.type === 'default')) {
      console.log(`[MSG91 OTP] Dispatched to ${phone}. Message: ${data.message || 'success'}`);
      return { success: true, provider: 'MSG91', data };
    }

    const err = data.message || `HTTP ${res.status}`;
    console.warn(`[MSG91 OTP] Dispatch failed for ${phone}: ${err}`);
    return { success: false, error: err };
  } catch (err) {
    console.error(`[MSG91 OTP] Network error for ${phone}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Dispatch transactional SMS via AWS SNS
 * Without DLT, we omit custom SenderID so international routes don't get blocked by TRAI firewalls
 */
async function sendViaAwsSns(mobile, otp, brandName) {
  const client = getAwsSnsClient();
  if (!client) {
    return {
      success: false,
      error: 'AWS SNS credentials not found in environment'
    };
  }

  let phoneE164 = String(mobile || '').replace(/\D/g, '');
  if (phoneE164.length === 10) phoneE164 = '91' + phoneE164;
  if (!phoneE164.startsWith('+')) phoneE164 = '+' + phoneE164;

  const brand = String(brandName || '').toUpperCase().includes('ORAANI') ? 'Oraani' : 'AI925';
  const message = `${brand}: Your login code is ${otp}. Valid for 5 minutes.`;

  try {
    const cmd = new PublishCommand({
      PhoneNumber: phoneE164,
      Message: message,
      MessageAttributes: {
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional'
        }
      }
    });

    const res = await client.send(cmd);
    console.log(`[AWS SNS OTP] Successfully dispatched to ${phoneE164}. MessageId: ${res.MessageId}`);
    return {
      success: true,
      messageId: res.MessageId,
      provider: 'AWS_SNS'
    };
  } catch (err) {
    console.error(`[AWS SNS OTP] Dispatch error for ${phoneE164}:`, err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Send live SMS OTP (MSG91 priority if key provided, AWS SNS fallback)
 */
async function sendOtpSms({ mobile, otp, brand = 'AI925' }) {
  const isOraani = String(brand).toUpperCase() === 'ORAANI';
  const brandName = isOraani ? 'Oraani' : 'AI925';
  const cleanPhone = String(mobile || '').replace(/\D/g, '').slice(-10);

  if (cleanPhone.length !== 10) {
    return { sent: false, error: 'Invalid 10-digit mobile number' };
  }

  console.log(`[SMS OTP] ==========================================`);
  console.log(`[SMS OTP] Destination: ${cleanPhone} (${brandName})`);
  console.log(`[SMS OTP] ACTIVE CODE: ${otp}`);
  console.log(`[SMS OTP] ==========================================`);

  // 1. Try MSG91 if configured (instant Indian SMS delivery)
  if (process.env.MSG91_AUTH_KEY) {
    const msg91Res = await sendViaMsg91(cleanPhone, otp, brandName);
    if (msg91Res.success) {
      return {
        sent: true,
        provider: 'MSG91',
        dev_otp: otp
      };
    }
    console.warn(`[SMS OTP] MSG91 failed, attempting AWS SNS fallback: ${msg91Res.error}`);
  }

  // 2. Fallback to AWS SNS
  const awsRes = await sendViaAwsSns(cleanPhone, otp, brandName);

  if (awsRes.success) {
    return {
      sent: true,
      provider: 'AWS_SNS',
      messageId: awsRes.messageId,
      dev_otp: otp
    };
  }

  console.warn(`[SMS OTP] AWS SNS delivery notice: ${awsRes.error}`);
  return {
    sent: false,
    provider: 'AWS_SNS',
    error: awsRes.error,
    dev_otp: otp
  };
}

module.exports = {
  sendOtpSms,
  sendViaMsg91,
  sendViaAwsSns
};
