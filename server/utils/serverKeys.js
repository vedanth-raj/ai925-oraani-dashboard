// Server signing keys. Never hard-coded: JWT_SECRET from the environment when it is long enough,
// otherwise a random 256-bit key created once and kept next to the database (data/jwt.key, owner-only).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR } = require('../db/database');

const MIN_SECRET_LENGTH = 32;
const KEY_PATH = path.join(DATA_DIR, 'jwt.key');

function loadOrCreateKey() {
  if (fs.existsSync(KEY_PATH)) {
    const stored = fs.readFileSync(KEY_PATH, 'utf8').trim();
    if (stored.length >= 64) return stored;
  }
  const fresh = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(KEY_PATH, fresh, { mode: 0o600 });
  return fresh;
}

function resolveJwtSecret() {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length >= MIN_SECRET_LENGTH) return fromEnv;
  if (fromEnv) console.warn(`JWT_SECRET is shorter than ${MIN_SECRET_LENGTH} characters; using the generated key in data/jwt.key instead.`);
  return loadOrCreateKey();
}

const JWT_SECRET = resolveJwtSecret();

// Separate key for signed upload links, derived so a leaked link signature never reveals the token key
const UPLOAD_SIGNING_KEY = crypto.createHmac('sha256', JWT_SECRET).update('ai925-upload-links-v1').digest();

// The emergency master code only exists when MASTER_CODE is set in the environment (12+ characters)
const MASTER_CODE = process.env.MASTER_CODE && process.env.MASTER_CODE.trim().length >= 12 ? process.env.MASTER_CODE.trim() : null;

function isMasterCode(input) {
  if (!MASTER_CODE || input === undefined || input === null) return false;
  const a = Buffer.from(String(input).trim());
  const b = Buffer.from(MASTER_CODE);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { JWT_SECRET, UPLOAD_SIGNING_KEY, MASTER_CODE, isMasterCode };
