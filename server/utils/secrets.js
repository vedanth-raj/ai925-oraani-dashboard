const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR } = require('../db/database');

// Customer passwords are kept twice: a bcrypt hash for sign-in, and an AES-256-GCM copy the System
// Administrator can read. The key lives in its own file next to the database, never in the database.
const KEY_PATH = path.join(DATA_DIR, 'credentials.key');
let key = null;

function getKey() {
  if (key) return key;
  if (fs.existsSync(KEY_PATH)) {
    key = Buffer.from(fs.readFileSync(KEY_PATH, 'utf8').trim(), 'hex');
  } else {
    key = crypto.randomBytes(32);
    fs.writeFileSync(KEY_PATH, key.toString('hex'), { mode: 0o600 });
  }
  return key;
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(b => b.toString('base64')).join('.');
}

// null when the value is missing or was written with another key
function decrypt(stored) {
  if (!stored) return null;
  try {
    const [iv, tag, data] = stored.split('.').map(s => Buffer.from(s, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

module.exports = { encrypt, decrypt };
