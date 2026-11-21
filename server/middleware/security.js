// HTTP hardening: security headers, request rate limits and signed links for private uploads.
const crypto = require('crypto');
const { UPLOAD_SIGNING_KEY } = require('../utils/serverKeys');

// ---------- Security headers ----------
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://apis.google.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://www.google.com/recaptcha/ https://www.gstatic.com/",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.google.com/recaptcha/ https://*.googleapis.com",
  "frame-src 'self' https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
  res.setHeader('Content-Security-Policy', CSP);
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // API answers carry private data: never kept by browsers or proxies
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
}

// ---------- Rate limits (in memory, per client IP) ----------
function rateLimit({ windowMs, max, message }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, list] of hits) {
      const recent = list.filter(t => t > cutoff);
      if (recent.length === 0) hits.delete(ip);
      else hits.set(ip, recent);
    }
  }, windowMs);
  if (timer.unref) timer.unref();

  return (req, res, next) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const recent = (hits.get(ip) || []).filter(t => now - t < windowMs);
    if (recent.length >= max) {
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ error: message });
    }
    recent.push(now);
    hits.set(ip, recent);
    next();
  };
}

// Generous enough for the app's own polling; stops scripted scraping and floods
const apiRateLimit = rateLimit({ windowMs: 60 * 1000, max: 600, message: 'Too many requests. Please wait a minute and try again.' });
// New customer sign-ups from one address
const signupRateLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: 'Too many sign-ups from this network. Please try again later.' });

// ---------- Signed links for private uploads ----------
// ID cards, visiting cards, bills and shipment photos are only served with a valid, expiring signature that the
// server adds to API answers for signed-in users. Product photos stay public for the catalog.
const PRIVATE_DIRS = ['id_cards', 'visiting_cards', 'bills', 'packages', 'shipments'];
const PRIVATE_RE = new RegExp(`^/uploads/(${PRIVATE_DIRS.join('|')})/[^?#]+$`);
const SIGNED_RE = new RegExp(`^(/uploads/(${PRIVATE_DIRS.join('|')})/[^?#]+)\\?exp=\\d+&sig=[A-Za-z0-9_-]+$`);
const LINK_LIFETIME_S = 6 * 60 * 60;
const HOUR_S = 60 * 60;

function signatureFor(pathname, exp) {
  return crypto.createHmac('sha256', UPLOAD_SIGNING_KEY).update(`${pathname}|${exp}`).digest('base64url').slice(0, 32);
}

// Expiry rounded up to the hour so a link stays the same (and browser-cacheable) within that hour
function signUploadPath(pathname) {
  const exp = Math.ceil((Math.floor(Date.now() / 1000) + LINK_LIFETIME_S) / HOUR_S) * HOUR_S;
  return `${pathname}?exp=${exp}&sig=${signatureFor(pathname, exp)}`;
}

function mapStrings(value, fn, depth = 0) {
  if (depth > 12 || value === null || value === undefined) return value;
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map(v => mapStrings(v, fn, depth + 1));
  if (typeof value === 'object' && value.constructor === Object) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = mapStrings(v, fn, depth + 1);
    return out;
  }
  return value;
}

// Adds signatures to private upload paths in every JSON answer
function signUploadLinks(req, res, next) {
  const json = res.json.bind(res);
  res.json = body => json(mapStrings(body, s => (PRIVATE_RE.test(s) ? signUploadPath(s) : s)));
  next();
}

// A signed link sent back by the app (e.g. when saving a customer) is stored as the bare path
function stripUploadSignatures(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = mapStrings(req.body, s => {
      const m = SIGNED_RE.exec(s);
      return m ? m[1] : s;
    });
  }
  next();
}

// Gate in front of the uploads folder
function guardPrivateUploads(req, res, next) {
  const dir = req.path.split('/')[1];
  if (!PRIVATE_DIRS.includes(dir)) return next();
  let pathname;
  try {
    pathname = decodeURIComponent((req.originalUrl || '').split('?')[0]);
  } catch {
    return res.status(400).end();
  }
  const exp = parseInt(req.query.exp, 10);
  const sig = typeof req.query.sig === 'string' ? req.query.sig : '';
  const expected = Number.isFinite(exp) ? signatureFor(pathname, exp) : '';
  const valid = expected.length === sig.length && sig.length > 0
    && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
    && exp * 1000 > Date.now();
  if (!valid) return res.status(403).json({ error: 'This link has expired. Reopen the page to view the file.' });
  res.setHeader('Cache-Control', 'private, max-age=3600');
  next();
}

module.exports = {
  securityHeaders,
  rateLimit,
  apiRateLimit,
  signupRateLimit,
  signUploadPath,
  signUploadLinks,
  stripUploadSignatures,
  guardPrivateUploads,
  PRIVATE_DIRS
};
