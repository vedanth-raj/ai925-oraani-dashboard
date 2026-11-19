const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const archiverPkg = require('archiver');
const { db, DB_PATH, DATA_DIR } = require('../db/database');
const { authenticateToken, requireAdmin, logAudit } = require('../middleware/auth');

function createZipArchive(options = { zlib: { level: 9 } }) {
  if (typeof archiverPkg === 'function') return archiverPkg('zip', options);
  if (archiverPkg.ZipArchive) return new archiverPkg.ZipArchive(options);
  if (archiverPkg.Archiver) return new archiverPkg.Archiver('zip', options);
  throw new Error('Unsupported archiver module format');
}

const BACKUP_DIR = path.join(DATA_DIR, 'backups');
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

// Core backup creation function (usable by API and background weekly automation)
async function createZipBackup(triggerSource = 'MANUAL', req = null) {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const prefix = triggerSource === 'WEEKLY_AUTO' ? 'ai925_weekly_backup_' : 'ai925_backup_';
  const backupName = `${prefix}${timestamp}.zip`;
  const tempDbSnapshot = path.join(BACKUP_DIR, `temp_db_${timestamp}.db`);
  const zipPath = path.join(BACKUP_DIR, backupName);

  // 1. Create atomic SQLite snapshot
  await db.backup(tempDbSnapshot);

  // 2. Collect stats for manifest
  const counts = {
    products: db.prepare('SELECT COUNT(*) as c FROM products').get().c,
    orders: db.prepare('SELECT COUNT(*) as c FROM orders').get().c,
    customers: db.prepare('SELECT COUNT(*) as c FROM customers').get().c,
    deliveries: db.prepare('SELECT COUNT(*) as c FROM deliveries').get().c,
    trigger: triggerSource,
    timestamp: now.toISOString(),
    version: '1.0'
  };

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = createZipArchive({ zlib: { level: 9 } });

    output.on('close', () => {
      if (fs.existsSync(tempDbSnapshot)) {
        try { fs.unlinkSync(tempDbSnapshot); } catch (_) {}
      }

      // Record setting
      db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('last_weekly_backup', ?, ?)").run(now.toISOString(), now.toISOString());

      const userId = req && req.user ? req.user.id : 'usr_system_auto';
      logAudit(userId, 'CREATE_BACKUP', 'backups', backupName, `Created ${triggerSource} backup ${backupName} (${archive.pointer()} bytes)`, req);

      resolve({
        filename: backupName,
        size_bytes: archive.pointer(),
        created_at: now.toISOString()
      });
    });

    archive.on('error', (err) => {
      if (fs.existsSync(tempDbSnapshot)) {
        try { fs.unlinkSync(tempDbSnapshot); } catch (_) {}
      }
      reject(err);
    });

    archive.pipe(output);
    archive.file(tempDbSnapshot, { name: 'ai925.db' });
    archive.append(JSON.stringify(counts, null, 2), { name: 'manifest.json' });

    if (fs.existsSync(UPLOADS_DIR)) {
      archive.directory(UPLOADS_DIR, 'uploads');
    }

    archive.finalize().catch(reject);
  });
}

// Background weekly backup checker
async function checkAndRunWeeklyBackup() {
  try {
    const lastBackupSetting = db.prepare("SELECT value FROM app_settings WHERE key = 'last_weekly_backup'").get();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    let shouldRun = false;

    if (!lastBackupSetting || !lastBackupSetting.value) {
      // Check existing files in BACKUP_DIR
      const existing = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.zip'));
      if (existing.length === 0) {
        shouldRun = true;
      } else {
        const latestStat = fs.statSync(path.join(BACKUP_DIR, existing[existing.length - 1]));
        if (Date.now() - latestStat.mtime.getTime() >= oneWeekMs) {
          shouldRun = true;
        }
      }
    } else {
      const lastTime = new Date(lastBackupSetting.value).getTime();
      if (Date.now() - lastTime >= oneWeekMs) {
        shouldRun = true;
      }
    }

    if (shouldRun) {
      console.log('[BACKUP] Running scheduled weekly automatic zip backup...');
      const result = await createZipBackup('WEEKLY_AUTO');
      console.log(`[BACKUP] Automated weekly backup completed: ${result.filename} (${(result.size_bytes / 1024).toFixed(1)} KB)`);
    }
  } catch (err) {
    console.error('[BACKUP] Error running weekly automatic backup:', err);
  }
}

// GET /api/backup/list (Admin only)
router.get('/list', authenticateToken, requireAdmin, (req, res) => {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.zip'))
      .map(file => {
        const fullPath = path.join(BACKUP_DIR, file);
        const stats = fs.statSync(fullPath);
        return {
          filename: file,
          size_bytes: stats.size,
          size_formatted: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
          created_at: stats.mtime.toISOString()
        };
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({ backups: files });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list backups' });
  }
});

// GET /api/backup/:filename/download (Admin only)
router.get('/:filename/download', authenticateToken, requireAdmin, (req, res) => {
  const { filename } = req.params;
  const safeFilename = path.basename(filename);
  const filePath = path.join(BACKUP_DIR, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Backup file not found' });
  }

  res.download(filePath, safeFilename);
});

// POST /api/backup/create (Admin only)
router.post('/create', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const backup = await createZipBackup('MANUAL', req);
    res.status(201).json({
      success: true,
      message: 'Backup created successfully',
      backup
    });
  } catch (err) {
    console.error('Backup creation failed:', err);
    res.status(500).json({ error: 'Failed to create backup: ' + err.message });
  }
});

module.exports = router;
module.exports.checkAndRunWeeklyBackup = checkAndRunWeeklyBackup;
module.exports.createZipBackup = createZipBackup;
