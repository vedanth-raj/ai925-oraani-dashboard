const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('========================================================');
console.log('   CREATING CLEAN DEPLOYMENT ZIP (NO DB OVERWRITE)      ');
console.log('========================================================\n');

const rootDir = path.resolve(__dirname, '..');

// 1. Build frontend first
console.log('[1/4] Building latest frontend with brand & inventory updates...');
try {
  execSync('npm --prefix client run build', { cwd: rootDir, stdio: 'inherit' });
} catch (err) {
  console.error('[ERROR] Frontend build failed:', err.message);
  process.exit(1);
}

// 2. Output ZIP filename
const zipName = `ai925_oraani_clean_release_${new Date().toISOString().slice(0, 10)}.zip`;
const zipPath = path.join(rootDir, zipName);

if (fs.existsSync(zipPath)) {
  try {
    fs.unlinkSync(zipPath);
  } catch (e) {
    // Ignore if not locked
  }
}

// 3. Compress using Windows built-in tar utility
console.log(`\n[2/4] Packaging clean release files into ${zipName}...`);
const itemsToInclude = [
  'client',
  'server',
  'tests',
  'tools',
  'uploads',
  'launch.js',
  'package.json',
  'package-lock.json',
  'run.bat',
  'update.bat',
  'rollback.bat',
  'INSTALL_AI925.bat',
  'package_zip.bat',
  'README.md',
  '.env.example',
  '.gitignore',
  'Dockerfile',
  'render.yaml'
].filter(f => fs.existsSync(path.join(rootDir, f)));

// Create a tar command with exclusions
const excludes = [
  '--exclude="node_modules"',
  '--exclude="client/node_modules"',
  '--exclude=".git"',
  '--exclude=".gemini"',
  '--exclude="*.zip"',
  '--exclude="*.log"',
  '--exclude="data/*.db"',
  '--exclude="data/*.db-wal"',
  '--exclude="data/*.db-shm"',
  '--exclude="data/backups"'
];

const tarCmd = `tar -a -cf "${zipName}" ${excludes.join(' ')} ${itemsToInclude.join(' ')}`;

try {
  execSync(tarCmd, { cwd: rootDir, stdio: 'inherit' });
  
  const stats = fs.statSync(zipPath);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
  
  console.log(`\n[3/4] [SUCCESS] Clean release created: ${zipName} (${sizeMb} MB)`);
  console.log('--------------------------------------------------------');
  console.log('  SAFE DEPLOYMENT GUARANTEE:');
  console.log('  * node_modules is excluded (prevents 200MB bloat)');
  console.log('  * data/*.db is excluded (will NEVER wipe your friend\'s data)');
  console.log('  * client/dist is included (ready-to-run UI)');
  console.log('  * Both brands (AI 925 & Oraani) fully packaged');
  console.log('--------------------------------------------------------');
  console.log('\n[4/4] Done! You can share this ZIP with your friend.');
} catch (err) {
  console.error('[ERROR] Failed to create ZIP:', err.message);
  process.exit(1);
}
