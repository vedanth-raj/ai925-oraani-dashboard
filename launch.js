const { exec, spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Load environment variables from .env if present
const envPath = path.join(__dirname, '.env');
const DEFAULT_NGROK_TOKEN = '3L6ahuT8juRgo9EGsKUkeBEdSpb_3oo2qqfmiacGwt6n2TMSN';
const DEFAULT_NGROK_DOMAIN = 'entangled-stem-cinema.ngrok-free.dev';

if (!fs.existsSync(envPath)) {
  const defaultEnv = `# AI925 Order Management System - Environment Configuration
NGROK_AUTHTOKEN=${DEFAULT_NGROK_TOKEN}
NGROK_DOMAIN=${DEFAULT_NGROK_DOMAIN}
PORT=3000
NODE_ENV=production
`;
  try { fs.writeFileSync(envPath, defaultEnv); } catch {}
}

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq !== -1) {
      const key = trimmed.substring(0, eq).trim();
      const val = trimmed.substring(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key] && val) {
        process.env[key] = val;
      }
    }
  }
}

if (!process.env.NGROK_AUTHTOKEN) process.env.NGROK_AUTHTOKEN = DEFAULT_NGROK_TOKEN;
if (!process.env.NGROK_DOMAIN || process.env.NGROK_DOMAIN.includes('vedanthdeviloper')) {
  process.env.NGROK_DOMAIN = DEFAULT_NGROK_DOMAIN;
}

let qrcode = null;
try {
  qrcode = require('qrcode-terminal');
} catch {}

// Import unified Express server application
const app = require('./server/server');
const PORT = process.env.PORT || 3000;

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const valid = [];

  // Sort interfaces: prioritize Wi-Fi and physical LAN ahead of virtual/loopback adapters
  const names = Object.keys(interfaces).sort((a, b) => {
    const isWifiA = /wi-?fi|wireless|wlan/i.test(a);
    const isWifiB = /wi-?fi|wireless|wlan/i.test(b);
    if (isWifiA && !isWifiB) return -1;
    if (!isWifiA && isWifiB) return 1;

    const isVirtA = /virtual|vbox|vmnet|vethernet|docker|wsl|host-only/i.test(a);
    const isVirtB = /virtual|vbox|vmnet|vethernet|docker|wsl|host-only/i.test(b);
    if (isVirtA && !isVirtB) return 1;
    if (!isVirtA && isVirtB) return -1;

    return 0;
  });

  for (const name of names) {
    if (/virtual|vbox|vmnet|vethernet|docker|wsl|host-only/i.test(name)) continue;
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        // Skip common virtual host-only IP ranges (VirtualBox 192.168.56.x)
        if (iface.address.startsWith('192.168.56.')) continue;
        valid.push(iface.address);
      }
    }
  }

  // Fallback if no specific physical adapter was filtered
  if (valid.length === 0) {
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          valid.push(iface.address);
        }
      }
    }
  }

  return valid;
}

// Function to establish permanent 4G/5G Ngrok tunnel (Port 443 HTTPS)
async function startInternetTunnel(port) {
  const token = process.env.NGROK_AUTHTOKEN || DEFAULT_NGROK_TOKEN;
  let domain = process.env.NGROK_DOMAIN;
  if (!domain || domain.includes('vedanthdeviloper') || !domain.includes('ngrok-free')) {
    domain = DEFAULT_NGROK_DOMAIN;
  }

  if (token) {
    try {
      const ngrok = require('@ngrok/ngrok');
      console.log(`  Starting permanent Ngrok 4G/5G tunnel (${domain || 'Port 443 HTTPS'})...`);
      let forwardOptions = {
        addr: port,
        authtoken: token
      };
      if (domain) {
        forwardOptions.domain = domain;
      }
      let listener;
      try {
        listener = await ngrok.forward(forwardOptions);
      } catch (domainErr) {
        if (domainErr.message && (domainErr.message.includes('custom subdomains') || domainErr.message.includes('ERR_NGROK_313'))) {
          delete forwardOptions.domain;
          listener = await ngrok.forward(forwardOptions);
        } else {
          throw domainErr;
        }
      }

      const url = listener.url();
      return {
        url,
        proc: { kill: () => { try { ngrok.disconnect(); } catch {} } },
        provider: 'Ngrok',
        isStatic: true
      };
    } catch (ngrokErr) {
      console.log(`  Ngrok notice: ${ngrokErr.message}`);
    }
  }

  return { url: `https://${DEFAULT_NGROK_DOMAIN}`, proc: null, provider: 'Ngrok', isStatic: true };
}

let activeTunnelProc = null;

const server = app.listen(PORT, '0.0.0.0', async () => {
  const ips = getLocalIpAddresses();
  const primaryIp = ips[0] || 'localhost';
  const mobileLanUrl = `http://${primaryIp}:${PORT}`;
  const localUrl = `http://localhost:${PORT}`;

  console.log('\n  Checking network configuration & public tunnel...');
  const tunnelRes = await startInternetTunnel(PORT);
  const publicUrl = tunnelRes.url || `https://${DEFAULT_NGROK_DOMAIN}`;
  activeTunnelProc = tunnelRes.proc;

  console.clear();
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                         AI925 ORDER MANAGEMENT SYSTEM                        ║');
  console.log('║                 Local-First Inventory, Sales & Order Hub (PWA)               ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  console.log(`  💻 Laptop Host (Direct):     ${localUrl}`);
  console.log(`  📶 Local Hotspot/Wi-Fi:      ${mobileLanUrl}`);
  console.log(`  🌍 4G/5G Live Internet URL:  ${publicUrl}\n`);

  console.log('  ════════════════════════════════════════════════════════════════════════════');
  console.log('  👑 READY-TO-USE 4G/5G LIVE LINKS FOR BOTH BRANDS (NGROK PERMANENT):');
  console.log(`     🟢 ORAANI PORTAL:         ${publicUrl}/oraani`);
  console.log(`     🔵 AI 925 PORTAL:         ${publicUrl}/ai925`);
  console.log('  ════════════════════════════════════════════════════════════════════════════\n');
  console.log(`  🔑 Management & Admin Login: ${publicUrl}/login`);
  console.log('     Default PINs: Admin: 925925  |  Business Admin: 888888  |  Sales Rep: 123456\n');

  if (publicUrl) {
    console.log('  ────────────────────────────────────────────────────────────────────────────');
    console.log(`  📱 4G/5G QR CODE FOR LIVE PORTAL:`);
    console.log(`     👉 ${publicUrl}\n`);
    if (qrcode) {
      qrcode.generate(publicUrl, { small: true });
    }
    console.log('  ────────────────────────────────────────────────────────────────────────────\n');
  }

  console.log('  Server active. Press Ctrl+C to stop.\n');

  // Background live auto-update check (checks immediately, then every 60 seconds with zero data loss)
  try {
    const sync = require('./tools/sync');
    const checkAndSync = async () => {
      try {
        const local = sync.getLocalVersion();
        const remote = await sync.fetchRemoteCommit();
        if (remote && local.sha !== remote.sha) {
          console.log(`\n[LIVE AUTO-SYNC] New update detected: [${remote.sha.slice(0, 7)}] "${remote.message}"`);
          console.log('[LIVE AUTO-SYNC] Applying update safely with automatic backup...');
          const res = await sync.applyUpdate(remote);
          if (res.success) {
            console.log('[LIVE AUTO-SYNC] Update applied cleanly! Running latest version.\n');
          }
        }
      } catch (e) {
        // Silent catch so running server is never disrupted
      }
    };

    // First check after 3 seconds
    setTimeout(checkAndSync, 3000);
    // Ongoing check every 60 seconds
    setInterval(checkAndSync, 60 * 1000);
  } catch {}

  // Open default browser on laptop host
  const startCmd = process.platform === 'win32' ? `start "" "${localUrl}"` :
                   process.platform === 'darwin' ? `open "${localUrl}"` :
                   `xdg-open "${localUrl}"`;
  exec(startCmd, () => {});
});

// Clean up child tunnel and close database on exit
function shutdown() {
  if (activeTunnelProc) {
    try { activeTunnelProc.kill(); } catch {}
  }
  try {
    const { db } = require('./server/db/database');
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
  } catch {}
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[ERROR] Port ${PORT} is already in use by another program.`);
    console.error(`Please close any existing instance or start with PORT=${PORT + 1}\n`);
  } else {
    console.error('Server error:', err);
  }
  shutdown();
});
