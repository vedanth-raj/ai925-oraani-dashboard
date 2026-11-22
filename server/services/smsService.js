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
 * Dispatch transactional SMS via AWS SNS exclusively
 */
async function sendViaAwsSns(mobile, otp, brandName) {
  const client = getAwsSnsClient();
  if (!client) {
    return {
      success: false,
      error: 'AWS SNS credentials (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY) not found in environment'
    };
  }

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
    console.log(`[AWS SNS OTP] Successfully dispatched OTP to ${phoneE164}. MessageId: ${res.MessageId}`);
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
 * Send live SMS OTP to a 4G/5G mobile user using AWS SNS exclusively
 */
async function sendOtpSms({ mobile, otp, brand = 'AI925' }) {
  const isOraani = String(brand).toUpperCase() === 'ORAANI';
  const brandName = isOraani ? 'Oraani' : 'AI925';
  const cleanPhone = String(mobile || '').replace(/\D/g, '').slice(-10);

  if (cleanPhone.length !== 10) {
    return { sent: false, error: 'Invalid 10-digit mobile number' };
  }

  console.log(`[SMS OTP] ==========================================`);
  console.log(`[SMS OTP] Generating OTP for ${cleanPhone} (${brandName})`);
  console.log(`[SMS OTP] ACTIVE CODE: ${otp}`);
  console.log(`[SMS OTP] ==========================================`);

  const awsRes = await sendViaAwsSns(cleanPhone, otp, brandName);

  if (awsRes.success) {
    return {
      sent: true,
      provider: 'AWS_SNS',
      messageId: awsRes.messageId,
      dev_otp: otp
    };
  }

  console.warn(`[SMS OTP] AWS SNS delivery failed: ${awsRes.error}`);
  return {
    sent: false,
    provider: 'AWS_SNS',
    error: awsRes.error,
    dev_otp: otp
  };
}

module.exports = {
  sendOtpSms,
  sendViaAwsSns
};
