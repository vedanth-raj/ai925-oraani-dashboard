const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const os = require('os');
const fs = require('fs');
const multer = require('multer');

const { db, initializeSchema } = require('./db/database');
const { seedDatabase } = require('./db/seed');

// Initialize database schema and initial seed data
initializeSchema();
seedDatabase();

const app = express();
const PORT = process.env.PORT || 3000;

const {
  securityHeaders, apiRateLimit, signupRateLimit, signUploadLinks, stripUploadSignatures, guardPrivateUploads
} = require('./middleware/security');

// Real client IPs behind the local tunnel (ngrok / cloudflared connect from this machine); TRUST_PROXY overrides
const trustProxy = process.env.TRUST_PROXY || 'loopback';
app.set('trust proxy', /^\d+$/.test(trustProxy) ? parseInt(trustProxy, 10) : trustProxy);
app.disable('x-powered-by');

// Middleware
app.use(securityHeaders);
app.use(compression());
// The app is served from the same origin; other sites may call the API only when listed in CORS_ORIGINS
const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
if (corsOrigins.length > 0) app.use('/api', cors({ origin: corsOrigins }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Support subpath reverse proxies (e.g. ai925.in/market or oraani.in/market via Cloudflare)
app.use((req, res, next) => {
  if (req.url.startsWith('/market/api')) {
    req.url = req.url.replace(/^\/market\/api/, '/api');
  } else if (req.url.startsWith('/market/uploads')) {
    req.url = req.url.replace(/^\/market\/uploads/, '/uploads');
  }
  next();
});

app.use('/api', apiRateLimit, stripUploadSignatures, signUploadLinks);
app.use('/api/portal/register', signupRateLimit);

// Strictly block any unauthenticated static access to cloud drive files
app.use('/uploads/cloud_drive', (req, res) => res.status(403).json({ error: 'Direct access to cloud storage is forbidden. Files must be retrieved via authenticated API.' }));

// Serve uploaded images with caching headers
const { UPLOADS_DIR } = require('./utils/files');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
// ID cards, visiting cards, bills and shipment photos need a signed link; product photos are public
app.use('/uploads', guardPrivateUploads, express.static(UPLOADS_DIR, { maxAge: '7d', index: false, dotfiles: 'deny' }));

// Mount API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/products', require('./routes/products'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/orders', require('./routes/deliveries'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/pincode', require('./routes/pincode'));
app.use('/api/users', require('./routes/users'));
app.use('/api/backup', require('./routes/backup'));
app.use('/api/export', require('./routes/export'));
app.use('/api/cloud', require('./routes/cloud'));
app.use('/api/pricing', require('./routes/pricing'));
app.use('/api/portal', require('./routes/portal'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/inventory', require('./routes/inventory'));

// Upload and unexpected errors return JSON with a real message instead of Express's bare 500 page
app.use('/api', (err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Image is too large (max 10 MB)'
      : err.code === 'LIMIT_UNEXPECTED_FILE'
        ? `Unexpected upload field "${err.field}"`
        : err.message;
    return res.status(400).json({ error: message });
  }
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  // Details stay in the server log; the client never sees internals
  console.error('Unhandled API error:', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

// Live silver rate: fetch on start, then hourly (skipped while an admin has set a manual rate)
if (process.env.AI925_DISABLE_RATE_FETCH !== '1') {
  require('./utils/pricing').startSilverRateScheduler();
}

// Initialize Automated Weekly Backup System
const { checkAndRunWeeklyBackup } = require('./routes/backup');
checkAndRunWeeklyBackup();
// Run weekly check every 6 hours
const backupTimer = setInterval(checkAndRunWeeklyBackup, 6 * 60 * 60 * 1000);
if (backupTimer.unref) backupTimer.unref();

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'AI925 Order Management System',
    timestamp: new Date().toISOString()
  });
});

// Unknown API paths answer in JSON instead of the app page
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve frontend static build if it exists (for local standalone deployment)
const CLIENT_DIST = process.env.AI925_CLIENT_DIST || path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(CLIENT_DIST)) {
  // Hashed build files never change: cache for a year. The page and service worker are always revalidated.
  app.use(express.static(CLIENT_DIST, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('sw.js')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  }));
  // Route-specific manifest for Oraani PWA
  app.get(['/oraani/manifest.json', '/oraani/manifest.webmanifest'], (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(CLIENT_DIST, 'oraani-manifest.json'));
  });

  app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    res.setHeader('Cache-Control', 'no-cache');
    const indexPath = path.join(CLIENT_DIST, 'index.html');
    const hostHeader = String(req.headers['x-forwarded-host'] || req.headers['host'] || req.hostname || '').toLowerCase();
    const isOraani = req.path.toLowerCase().startsWith('/oraani') || hostHeader.includes('oraani') || (req.headers.referer && req.headers.referer.toLowerCase().includes('/oraani'));
    const isAi925 = req.path.toLowerCase().startsWith('/ai925') || hostHeader.includes('ai925') || (req.headers.referer && req.headers.referer.toLowerCase().includes('/ai925'));

    if (isOraani && fs.existsSync(indexPath)) {
      let html = fs.readFileSync(indexPath, 'utf8');
      html = html
        .replace(/<title>.*?<\/title>/, '<title>Oraani</title>')
        .replace(/content="AI925"/g, 'content="Oraani"')
        .replace(/href="\/manifest\.json"/g, 'href="/oraani-manifest.json"')
        .replace(/href="\/icon\.svg"/g, 'href="/oraani-logo.svg"')
        .replace(/href="\/icon-192\.png"/g, 'href="/oraani-icon-192.png"')
        .replace(/href="\/icon-512\.png"/g, 'href="/oraani-icon-512.png"')
        .replace(/href="\/apple-touch-icon\.png"/g, 'href="/oraani-apple-touch-icon.png"')
        .replace('</head>', '<script>window.__INITIAL_BRAND__="ORAANI";</script></head>');
      return res.type('html').send(html);
    }
    if (isAi925 && fs.existsSync(indexPath)) {
      let html = fs.readFileSync(indexPath, 'utf8');
      html = html.replace('</head>', '<script>window.__INITIAL_BRAND__="AI925";</script></head>');
      return res.type('html').send(html);
    }
    res.sendFile(indexPath);
  });
}

// Function to retrieve local network IP addresses
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

if (require.main === module) {
  const server = app.listen(PORT, '0.0.0.0', () => {
    const ips = getLocalIpAddresses();
    console.log('\n======================================================');
    console.log('       AI925 ORDER MANAGEMENT SYSTEM');
    console.log('       Local-First Inventory, Sales & Order Hub');
    console.log('======================================================');
    console.log(` Laptop Browser:   http://localhost:${PORT}`);
    if (ips.length > 0) {
      ips.forEach(ip => {
        console.log(` Mobile PWA (LAN): http://${ip}:${PORT}`);
      });
    }
    console.log('======================================================\n');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[ERROR] Port ${PORT} is already in use by another program.`);
      console.error(`Please stop the existing process or set PORT=${PORT + 1} and restart.\n`);
    } else {
      console.error('Server error:', err);
    }
    process.exit(1);
  });

  const shutdown = () => {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close();
    } catch {}
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = app;
