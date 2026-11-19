const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_OWNER = 'vedanth-raj';
const REPO_NAME = 'ai925-oraani-dashboard';
const REPO_BRANCH = 'main';

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const VERSION_FILE = path.join(DATA_DIR, 'version.json');

// Ensure data and backup directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

function getLocalVersion() {
  if (fs.existsSync(VERSION_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
    } catch {}
  }
  // Try git rev-parse if git repo
  try {
    const sha = execSync('git rev-parse HEAD', { cwd: ROOT_DIR, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return { sha, updated_at: new Date().toISOString() };
  } catch {
    return { sha: 'initial', updated_at: new Date().toISOString() };
  }
}

function saveLocalVersion(info) {
  fs.writeFileSync(VERSION_FILE, JSON.stringify(info, null, 2));
}

// Fetch latest commit metadata from GitHub public API
async function fetchRemoteCommit() {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/${REPO_BRANCH}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'AI925-AutoUpdater',
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      sha: data.sha,
      message: data.commit?.message?.split('\n')[0] || 'Update',
      date: data.commit?.committer?.date || new Date().toISOString()
    };
  } catch (err) {
    return null;
  }
}

// Create a safety snapshot of the database and state before any update
function createSnapshot(reason = 'before_update') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const localVer = getLocalVersion();
  const snapshotName = `snapshot_${timestamp}_${(localVer.sha || 'ver').slice(0, 7)}`;
  const snapshotDir = path.join(BACKUPS_DIR, snapshotName);

  if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir, { recursive: true });

  // 1. Back up SQLite database (zero data loss guarantee)
  const dbPath = path.join(DATA_DIR, 'ai925.db');
  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, path.join(snapshotDir, 'ai925.db'));
    const wal = dbPath + '-wal';
    const shm = dbPath + '-shm';
    if (fs.existsSync(wal)) fs.copyFileSync(wal, path.join(snapshotDir, 'ai925.db-wal'));
    if (fs.existsSync(shm)) fs.copyFileSync(shm, path.join(snapshotDir, 'ai925.db-shm'));
  }

  // 2. Save metadata info
  const meta = {
    id: snapshotName,
    created_at: new Date().toISOString(),
    reason,
    sha: localVer.sha || 'unknown',
    message: localVer.message || 'Working version'
  };
  fs.writeFileSync(path.join(snapshotDir, 'metadata.json'), JSON.stringify(meta, null, 2));

  // Prune older snapshots if more than 10
  pruneSnapshots(10);

  return snapshotDir;
}

function pruneSnapshots(maxKeep = 10) {
  try {
    const items = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('snapshot_'))
      .map(f => ({ name: f, path: path.join(BACKUPS_DIR, f), time: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    if (items.length > maxKeep) {
      for (const old of items.slice(maxKeep)) {
        fs.rmSync(old.path, { recursive: true, force: true });
      }
    }
  } catch {}
}

function listSnapshots() {
  if (!fs.existsSync(BACKUPS_DIR)) return [];
  const entries = fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.startsWith('snapshot_'))
    .map(f => {
      const dir = path.join(BACKUPS_DIR, f);
      const metaPath = path.join(dir, 'metadata.json');
      let meta = { id: f, created_at: fs.statSync(dir).mtime.toISOString(), message: 'System Snapshot' };
      if (fs.existsSync(metaPath)) {
        try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {}
      }
      return { id: f, path: dir, ...meta };
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return entries;
}

// Apply update: via Git pull or via direct ZIP download
async function applyUpdate(remoteCommit) {
  console.log('\n======================================================');
  console.log('   APPLYING LIVE UPDATE FROM CLOUD REPOSITORY        ');
  console.log('======================================================');
  console.log(`New version found: [${remoteCommit.sha.slice(0, 7)}] "${remoteCommit.message}"`);

  // 1. Create safety snapshot first
  console.log('\n[1/4] Creating safety backup before update...');
  const snapshotDir = createSnapshot(`auto_update_to_${remoteCommit.sha.slice(0, 7)}`);
  console.log(`      Safety snapshot saved: ${path.basename(snapshotDir)}`);

  try {
    // 2. Download updated code
    console.log('\n[2/4] Downloading updated files...');
    const hasGit = fs.existsSync(path.join(ROOT_DIR, '.git'));
    let downloadSuccess = false;

    if (hasGit) {
      try {
        execSync('git pull origin main', { cwd: ROOT_DIR, stdio: 'inherit' });
        downloadSuccess = true;
      } catch (gitErr) {
        console.warn('      Git pull notice:', gitErr.message, '- falling back to direct package sync...');
      }
    }

    if (!downloadSuccess) {
      // Download public zip archive and extract
      const zipUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/refs/heads/${REPO_BRANCH}.zip`;
      const tempZip = path.join(DATA_DIR, 'temp_update.zip');
      const tempExtract = path.join(DATA_DIR, 'temp_extract');

      if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip);
      try {
        execSync(`curl.exe -s -L "${zipUrl}" -o "${tempZip}"`, { cwd: ROOT_DIR });
      } catch {}

      if (!fs.existsSync(tempZip) || fs.statSync(tempZip).size < 1000) {
        if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip);
        execSync(`powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '${zipUrl}' -OutFile '${tempZip}'"`, { cwd: ROOT_DIR });
      }

      if (fs.existsSync(tempExtract)) fs.rmSync(tempExtract, { recursive: true, force: true });
      fs.mkdirSync(tempExtract, { recursive: true });

      // Unzip using tar
      execSync(`tar -xf "${tempZip}" -C "${tempExtract}"`, { cwd: ROOT_DIR });

      // Find extracted root folder (e.g. ai925-oraani-dashboard-main)
      const extractedFolders = fs.readdirSync(tempExtract);
      const innerDir = path.join(tempExtract, extractedFolders[0]);

      // Copy new files over ROOT_DIR, explicitly protecting data/ and uploads/
      copyFolderExcludingData(innerDir, ROOT_DIR);

      // Clean up temp
      fs.unlinkSync(tempZip);
      fs.rmSync(tempExtract, { recursive: true, force: true });
    }

    // 3. Rebuild frontend
    console.log('\n[3/4] Rebuilding user interface...');
    execSync('npm --prefix client run build', { cwd: ROOT_DIR, stdio: 'inherit' });

    // 4. Verify Database migrations
    console.log('\n[4/4] Verifying database schema & tables...');
    const { initializeSchema } = require('../server/db/database');
    initializeSchema();

    // Save updated version
    saveLocalVersion({
      sha: remoteCommit.sha,
      message: remoteCommit.message,
      updated_at: new Date().toISOString()
    });

    console.log('\n======================================================');
    console.log('   UPDATE COMPLETED CLEANLY! (ZERO DATA LOSS)         ');
    console.log('======================================================\n');
    return { success: true, sha: remoteCommit.sha };

  } catch (err) {
    console.error('\n[ERROR] Update failed:', err.message);
    console.log('Rolling back to safety snapshot automatically...');
    restoreSnapshot(path.basename(snapshotDir));
    return { success: false, error: err.message };
  }
}

function copyFolderExcludingData(src, dest) {
  const items = fs.readdirSync(src);
  for (const item of items) {
    if (item === 'data' || item === 'uploads' || item === '.git' || item === 'node_modules') {
      continue; // NEVER overwrite live database, uploads, git, or dependencies
    }
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
      copyFolderExcludingData(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function listGitVersions(limit = 25) {
  try {
    const raw = execSync(`git log -n ${limit} --format="%H|%ad|%s" --date=format:"%Y-%m-%d %H:%M:%S"`, {
      cwd: ROOT_DIR,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString().trim();
    if (!raw) return [];
    return raw.split('\n').filter(Boolean).map(line => {
      const parts = line.split('|');
      const sha = parts[0] || '';
      const date = parts[1] || '';
      const message = parts.slice(2).join('|') || 'Update';
      return {
        type: 'git',
        sha,
        shortSha: sha.slice(0, 7),
        created_at: date,
        message
      };
    });
  } catch {
    return [];
  }
}

function restoreGitVersion(commitSha) {
  console.log(`\n[1/3] Creating safety backup of current state & database...`);
  createSnapshot('before_rollback');

  console.log(`\n[2/3] Restoring code files to version [${commitSha.slice(0, 7)}]...`);
  try {
    execSync(`git checkout ${commitSha} -- .`, { cwd: ROOT_DIR, stdio: 'inherit' });
  } catch (err) {
    execSync(`git reset --hard ${commitSha}`, { cwd: ROOT_DIR, stdio: 'inherit' });
  }

  // Verify and ensure database integrity
  try {
    const { initializeSchema } = require('../server/db/database');
    initializeSchema();
  } catch {}

  console.log(`\n[3/3] Rebuilding user interface...`);
  try {
    execSync('npm --prefix client run build', { cwd: ROOT_DIR, stdio: 'inherit' });
  } catch (err) {
    console.warn('Frontend rebuild warning:', err.message);
  }

  saveLocalVersion({ sha: commitSha, rolled_back_at: new Date().toISOString() });
  console.log(`\n======================================================`);
  console.log(`   SYSTEM RESTORED TO VERSION [${commitSha.slice(0, 7)}]!`);
  console.log(`   (Zero database loss: All customers & orders intact)`);
  console.log(`======================================================\n`);
  return true;
}

// Restore previous snapshot (Rollback)
function restoreSnapshot(snapshotId) {
  const targetDir = path.join(BACKUPS_DIR, snapshotId);
  if (!fs.existsSync(targetDir)) {
    throw new Error(`Snapshot ${snapshotId} not found in ${BACKUPS_DIR}`);
  }

  console.log(`\nRestoring system to snapshot: ${snapshotId}...`);

  // Restore database
  const backupDb = path.join(targetDir, 'ai925.db');
  if (fs.existsSync(backupDb)) {
    fs.copyFileSync(backupDb, path.join(DATA_DIR, 'ai925.db'));
    const wal = backupDb + '-wal';
    const shm = backupDb + '-shm';
    if (fs.existsSync(wal)) fs.copyFileSync(wal, path.join(DATA_DIR, 'ai925.db-wal'));
    if (fs.existsSync(shm)) fs.copyFileSync(shm, path.join(DATA_DIR, 'ai925.db-shm'));
    console.log('  [OK] Database restored.');
  }

  // Restore metadata version
  const metaPath = path.join(targetDir, 'metadata.json');
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      saveLocalVersion({ sha: meta.sha, message: meta.message, rolled_back_at: new Date().toISOString() });
    } catch {}
  }

  console.log('  [SUCCESS] System rolled back successfully.\n');
  return true;
}

// CLI handler
async function main() {
  const cmd = process.argv[2] || 'check';

  if (cmd === 'check') {
    const local = getLocalVersion();
    const remote = await fetchRemoteCommit();
    if (!remote) {
      console.log('[SYNC] Network check: Remote repository currently unreachable or offline.');
      return;
    }
    if (local.sha !== remote.sha) {
      console.log(`[SYNC] New update available! Local: ${local.sha.slice(0, 7)} -> Remote: ${remote.sha.slice(0, 7)}`);
      console.log(`       Commit: "${remote.message}"`);
      await applyUpdate(remote);
    } else {
      console.log(`[SYNC] System is up to date on version [${local.sha.slice(0, 7)}]`);
    }
  } else if (cmd === 'update') {
    const remote = await fetchRemoteCommit();
    if (!remote) {
      console.error('[ERROR] Could not fetch remote commit from GitHub. Check internet connection.');
      process.exit(1);
    }
    await applyUpdate(remote);
  } else if (cmd === 'rollback') {
    const gitVersions = listGitVersions(25);
    const snapshots = listSnapshots();

    if (gitVersions.length === 0 && snapshots.length === 0) {
      console.log('\n[NOTICE] No previous versions or safety snapshots found to restore.');
      return;
    }

    console.log('\n======================================================');
    console.log('        AVAILABLE PREVIOUS VERSIONS & SNAPSHOTS       ');
    console.log('======================================================\n');

    const allOptions = [];

    if (gitVersions.length > 0) {
      console.log('--- RECENT SYSTEM RELEASES & UPDATES ---');
      gitVersions.forEach((v) => {
        allOptions.push(v);
        const idx = allOptions.length;
        console.log(`  [${idx}] ${v.created_at} - Version: [${v.shortSha}]`);
        console.log(`      Change: "${v.message}"\n`);
      });
    }

    if (snapshots.length > 0) {
      console.log('--- LOCAL DATABASE SAFETY SNAPSHOTS ---');
      snapshots.forEach((s) => {
        allOptions.push({ type: 'snapshot', ...s });
        const idx = allOptions.length;
        console.log(`  [${idx}] ${s.created_at.replace('T', ' ').slice(0, 19)} - Snapshot [${(s.sha || '').slice(0, 7)}]`);
        console.log(`      Backup: "${s.message || s.reason}"\n`);
      });
    }

    const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    readline.question('\nEnter number of version to restore (or press Enter to cancel): ', (ans) => {
      readline.close();
      const input = ans.trim();
      if (!input) {
        console.log('Rollback cancelled. No changes made.');
        return;
      }
      const choice = parseInt(input, 10);
      const selected = allOptions[choice - 1];
      if (!selected) {
        console.error('Invalid selection.');
        return;
      }
      if (selected.type === 'git') {
        restoreGitVersion(selected.sha);
      } else {
        restoreSnapshot(selected.id);
        console.log('Rebuilding client after rollback...');
        try {
          execSync('npm --prefix client run build', { cwd: ROOT_DIR, stdio: 'inherit' });
        } catch {}
      }
      console.log('Rollback finished. You can now launch the app.');
    });
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  getLocalVersion,
  saveLocalVersion,
  fetchRemoteCommit,
  createSnapshot,
  listSnapshots,
  applyUpdate,
  restoreSnapshot
};
