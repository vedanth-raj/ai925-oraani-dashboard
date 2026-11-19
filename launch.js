const { exec, spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Load environment variables from .env if present
const envPath = path.join(__dirname, '.env');
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

function ensureCloudflaredBinary() {
  const cfExe = path.join(__dirname, 'cloudflared.exe');
  if (fs.existsSync(cfExe)) return cfExe;

  // On Windows, try downloading cloudflared if curl is available
  if (process.platform === 'win32') {
    try {
      console.log('  Downloading Cloudflare Mobile Tunnel binary...');
      require('child_process').execSync(
        'curl.exe -L -s -o "' + cfExe + '" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"',
        { timeout: 45000, stdio: 'ignore' }
      );
      if (fs.existsSync(cfExe)) return cfExe;
    } catch {}
  }
  return null;
}

// Function to establish secure public internet tunnel (Prioritizes Ngrok Port 443, with Cloudflare fallback)
async function startInternetTunnel(port) {
  // 1. Check if Ngrok is configured (Uses standard Port 443 HTTPS, supports permanent static domain)
  if (process.env.NGROK_AUTHTOKEN) {
    try {
      const ngrok = require('@ngrok/ngrok');
      console.log('  Starting secure Ngrok 4G/5G tunnel (Port 443 HTTPS)...');
      const forwardOptions = {
        addr: port,
        authtoken: process.env.NGROK_AUTHTOKEN
      };
      if (process.env.NGROK_DOMAIN) {
        forwardOptions.domain = process.env.NGROK_DOMAIN;
      }
      const listener = await ngrok.forward(forwardOptions);
      const url = listener.url();
      return {
        url,
        proc: { kill: () => { try { ngrok.disconnect(); } catch {} } },
        provider: 'Ngrok',
        isStatic: Boolean(process.env.NGROK_DOMAIN)
      };
    } catch (ngrokErr) {
      console.log(`  Ngrok notice: ${ngrokErr.message}`);
    }
  }

  // 2. Cloudflare Quick Tunnel Fallback
  const cfExe = ensureCloudflaredBinary();
  if (cfExe) {
    const cfResult = await new Promise((resolve) => {
      try {
        const proc = spawn(cfExe, [
          'tunnel',
          '--url', `http://127.0.0.1:${port}`
        ]);

        let resolved = false;
        let candidateUrl = null;

        const finish = (result) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve(result);
          }
        };

        const handleData = (chunk) => {
          const text = chunk.toString();

          const match = text.match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/i);
          if (match && !candidateUrl) {
            candidateUrl = match[0];
          }

          if (candidateUrl && /Registered tunnel connection|Connection [a-z0-9\-]+ registered/i.test(text)) {
            finish({ url: candidateUrl, proc, provider: 'Cloudflare', isStatic: false });
            return;
          }

          if (/hard_fail=true|HTTP\/2 connection is blocked|QUIC connection failed|Unable to establish connection with Cloudflare edge|DialContext error/i.test(text)) {
            try { proc.kill(); } catch {}
            finish({ url: null, proc: null, reason: 'port_7844_blocked' });
          }
        };

        proc.stdout.on('data', handleData);
        proc.stderr.on('data', handleData);

        proc.on('error', () => {
          finish({ url: null, proc: null, reason: 'process_error' });
        });

        proc.on('exit', () => {
          finish({ url: null, proc: null, reason: 'process_exit' });
        });

        const timer = setTimeout(() => {
          if (!resolved) {
            try { proc.kill(); } catch {}
            finish({ url: null, proc: null, reason: 'timeout' });
          }
        }, 8000);

      } catch (err) {
        resolve({ url: null, proc: null, reason: 'spawn_error' });
      }
    });

    if (cfResult && cfResult.url) {
      return cfResult;
    }
  }

  return { url: null, proc: null, provider: null, isStatic: false };
}

let activeTunnelProc = null;

const server = app.listen(PORT, '0.0.0.0', async () => {
  const ips = getLocalIpAddresses();
  const primaryIp = ips[0] || 'localhost';
  const mobileLanUrl = `http://${primaryIp}:${PORT}`;
  const localUrl = `http://localhost:${PORT}`;

  console.log('\n  Checking network configuration & public tunnel...');
  const tunnelRes = await startInternetTunnel(PORT);
  const publicUrl = tunnelRes.url;
  activeTunnelProc = tunnelRes.proc;

  console.clear();
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                         AI925 ORDER MANAGEMENT SYSTEM                        ║');
  console.log('║                 Local-First Inventory, Sales & Order Hub (PWA)               ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  console.log(`  💻 Laptop Host (Direct):     ${localUrl}`);
  console.log(`  📶 Local Hotspot/Wi-Fi:      ${mobileLanUrl}`);

  if (publicUrl) {
    console.log(`  🌍 4G/5G Public Tunnel:      ${publicUrl} [${tunnelRes.provider}${tunnelRes.isStatic ? ' - PERMANENT STATIC DOMAIN' : ''}]`);
  } else {
    console.log(`  ℹ️  Public 4G/5G Tunnel:      Inactive (Add your free Ngrok token in .env)`);
  }

  console.log('\n  🔑 Default PINs: Admin: 925925  |  Sales Rep: 123456\n');

  const mainBase = publicUrl || mobileLanUrl;
  console.log('  👑 BRAND-SPECIFIC DIRECT LINKS:');
  console.log(`     • Oraani Portal:    ${mainBase}/oraani`);
  console.log(`     • AI 925 Portal:    ${mainBase}/ai925\n`);

  if (publicUrl) {
    console.log('  ════════════════════════════════════════════════════════════════════════════');
    console.log(`  🌍 4G/5G LINK FOR FRIENDS / REPS IN OTHER CITIES (${tunnelRes.provider}):`);
    console.log(`     👉 ${publicUrl}`);
    if (tunnelRes.isStatic) {
      console.log('     ⭐ PERMANENT DOMAIN: This link will NEVER change across restarts or reboots!');
    }
    console.log(`     (Send this link or screenshot the QR code below and send via WhatsApp!)\n`);
    if (qrcode) {
      qrcode.generate(publicUrl, { small: true });
    }
    console.log('  ════════════════════════════════════════════════════════════════════════════\n');
    console.log(`  📱 For your own phone connected to this hotspot: you can also use: ${mobileLanUrl}\n`);
  } else {
    console.log('  ────────────────────────────────────────────────────────────────────────────');
    console.log(`  📱 LOCAL HOTSPOT QR CODE (For your own phone connected to this hotspot):`);
    console.log(`     👉 ${mobileLanUrl}\n`);
    if (qrcode) {
      qrcode.generate(mobileLanUrl, { small: true });
    }
    console.log('  ────────────────────────────────────────────────────────────────────────────');
    console.log('  ⚡ TO GET A 100% PERMANENT 4G/5G NGROK LINK (Free forever):');
    console.log('     1. Open the file ".env" in this folder.');
    console.log('     2. Sign up at https://dashboard.ngrok.com and copy your free Authtoken.');
    console.log('     3. Set NGROK_AUTHTOKEN=your_token in .env and restart run.bat!');
    console.log('     (Optional: Set NGROK_DOMAIN=your-domain.ngrok-free.app for a fixed URL)');
    console.log('  ────────────────────────────────────────────────────────────────────────────\n');
  }

  console.log('  Server active. Press Ctrl+C to stop.\n');

  // Background live auto-update check every 15 minutes (with zero data loss)
  try {
    const sync = require('./tools/sync');
    setInterval(async () => {
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
    }, 15 * 60 * 1000);
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
