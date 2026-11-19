// Security hardening: signing keys, master code, private uploads, token handling, headers, caching, rate limits.
// Runs the real app on a throwaway database so the data folder is never touched.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const jwt = require('jsonwebtoken');

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ai925-sec-'));
process.env.AI925_DATA_DIR = TMP_DIR;
process.env.AI925_DISABLE_RATE_FETCH = '1';
delete process.env.MASTER_CODE;
delete process.env.JWT_SECRET;

const app = require('../server/server');
const { db } = require('../server/db/database');
const { generateToken } = require('../server/middleware/auth');
const { signUploadPath } = require('../server/middleware/security');
const { UPLOADS_DIR } = require('../server/utils/files');

const admin = db.prepare("SELECT * FROM users WHERE role = 'ADMIN'").get();
const adminToken = generateToken(admin);

const ID_DIR = path.join(UPLOADS_DIR, 'id_cards');
const TEST_FILE = `zz-security-test-${Date.now()}.jpg`;

let base;
async function call(method, url, { token, body, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body) h['Content-Type'] = 'application/json';
  const res = await fetch(base + url, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, headers: res.headers, json, text };
}

async function run() {
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
  let passed = 0;
  const ok = msg => { passed++; console.log('  ✓', msg); };
  fs.mkdirSync(ID_DIR, { recursive: true });
  fs.writeFileSync(path.join(ID_DIR, TEST_FILE), 'not really an image');

  try {
    // ---- Signing key ----
    const forged = jwt.sign({ id: admin.id, username: 'admin', role: 'ADMIN' }, 'ai925_local_secret_key_jewelry_suite_2026', { expiresIn: '1h' });
    let r = await call('GET', '/api/customers', { token: forged });
    assert.strictEqual(r.status, 403);
    assert.ok(fs.existsSync(path.join(TMP_DIR, 'jwt.key')), 'a random key is generated');
    const none = jwt.sign({ id: admin.id, role: 'ADMIN' }, '', { algorithm: 'none' });
    r = await call('GET', '/api/customers', { token: none });
    assert.strictEqual(r.status, 403);
    ok('tokens signed with the old built-in secret (or unsigned) are rejected');

    // ---- Master code ----
    for (const code of ['925925MASTER', 'MASTER925']) {
      r = await call('POST', '/api/auth/login-pin', { body: { pin: code } });
      assert.strictEqual(r.status, 401);
      r = await call('POST', '/api/auth/login', { body: { username: 'x', password: code } });
      assert.strictEqual(r.status, 401);
    }
    assert.strictEqual(db.prepare("SELECT COUNT(*) as c FROM app_settings WHERE key IN ('admin_pin', 'master_code')").get().c, 0);
    ok('built-in master codes no longer log in; no plain-text PIN is stored');

    // ---- Private uploads ----
    const rel = `/uploads/id_cards/${TEST_FILE}`;
    r = await call('GET', rel);
    assert.strictEqual(r.status, 403);
    const signed = signUploadPath(rel);
    r = await call('GET', signed);
    assert.strictEqual(r.status, 200);
    r = await call('GET', signed.replace(/sig=.{4}/, 'sig=AAAA'));
    assert.strictEqual(r.status, 403);
    const exp = Math.floor(Date.now() / 1000) - 10;
    r = await call('GET', `${rel}?exp=${exp}&sig=${new URLSearchParams(signed.split('?')[1]).get('sig')}`);
    assert.strictEqual(r.status, 403);
    ok('ID cards need a valid, unexpired signed link');

    const productFile = fs.readdirSync(path.join(UPLOADS_DIR, 'products')).find(f => /\.(jpe?g|png|webp)$/i.test(f));
    if (productFile) {
      r = await call('GET', `/uploads/products/${encodeURIComponent(productFile)}`);
      assert.strictEqual(r.status, 200);
      ok('product photos stay public for the catalog');
    }

    // API answers carry signed links; signed links sent back are stored bare
    r = await call('POST', '/api/customers', { token: adminToken, body: {
      poc_name: 'Sec Test', company_name: 'Sec Test Co', phone: '9811122233', zone: 'West', visiting_card_path: signUploadPath('/uploads/visiting_cards/sec.jpg')
    } });
    assert.strictEqual(r.status, 201, r.text);
    const stored = db.prepare('SELECT visiting_card_path FROM customers WHERE id = ?').get(r.json.customer.id).visiting_card_path;
    assert.ok(!stored || !stored.includes('sig='), `stored path must be bare, got ${stored}`);
    db.prepare("UPDATE customers SET visiting_card_path = '/uploads/visiting_cards/sec.jpg' WHERE id = ?").run(r.json.customer.id);
    r = await call('GET', `/api/customers/${r.json.customer.id}`, { token: adminToken });
    assert.match(JSON.stringify(r.json), /\/uploads\/visiting_cards\/sec\.jpg\?exp=\d+&sig=/);
    ok('API answers sign private paths; saved data keeps the bare path');

    // ---- Token only in the Authorization header (URL tokens just for downloads) ----
    r = await call('GET', `/api/customers?token=${adminToken}`);
    assert.strictEqual(r.status, 401);
    r = await call('GET', `/api/export/customers.csv?token=${adminToken}`);
    assert.strictEqual(r.status, 200);
    ok('a token in the URL works for file downloads only');

    // ---- Headers, caching, compression ----
    r = await call('GET', '/api/health');
    assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff');
    assert.strictEqual(r.headers.get('x-frame-options'), 'DENY');
    assert.ok(r.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
    assert.strictEqual(r.headers.get('cache-control'), 'no-store');
    assert.strictEqual(r.headers.get('x-powered-by'), null);
    assert.strictEqual(r.headers.get('access-control-allow-origin'), null);
    r = await call('GET', '/api/nope', { token: adminToken });
    assert.strictEqual(r.status, 404);
    assert.deepStrictEqual(r.json, { error: 'Not found' });
    ok('security headers set, API answers never cached, no open CORS, JSON 404');

    const page = await call('GET', '/');
    if (page.status === 200) {
      assert.strictEqual(page.headers.get('cache-control'), 'no-cache');
      const asset = (page.text.match(/\/assets\/[^"]+\.js/) || [])[0];
      if (asset) {
        const a = await call('GET', asset, { headers: { 'Accept-Encoding': 'gzip' } });
        assert.strictEqual(a.headers.get('content-encoding'), 'gzip');
        assert.ok(a.headers.get('cache-control').includes('immutable'));
      }
      ok('page revalidates every load; build files are gzipped and cached for a year');
    }

    // ---- Sign-up flood ----
    let last;
    for (let i = 0; i < 11; i++) {
      const fd = new FormData();
      Object.entries({
        full_name: `Flood ${i}`, phone: `97000000${String(i).padStart(2, '0')}`, email: `flood${i}@example.test`,
        address: 'x', password: 'secret123', account_type: 'Retailer'
      }).forEach(([k, v]) => fd.append(k, v));
      last = await fetch(`${base}/api/portal/register`, { method: 'POST', body: fd });
    }
    assert.strictEqual(last.status, 429);
    ok('sign-ups are rate limited per network');

    console.log(`\nSecurity hardening: ${passed} checks passed`);
  } finally {
    fs.rmSync(path.join(ID_DIR, TEST_FILE), { force: true });
    server.close();
    db.close();
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }
}

run().then(() => process.exit(0)).catch(err => {
  console.error('FAILED:', err);
  try { fs.rmSync(path.join(ID_DIR, TEST_FILE), { force: true }); } catch { /* ignore */ }
  process.exit(1);
});
