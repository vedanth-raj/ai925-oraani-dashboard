// Used by run.bat. `node tools/check-setup.js <check>` exits 0 when the check passes, 1 when work is needed.
//   node-version  Node.js is new enough for the client build (Vite needs 20.19+)
//   server-deps   every server dependency in package.json is installed
//   client-deps   every client dependency in client/package.json is installed
//   client-build  client/dist is newer than every client source file
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CLIENT = path.join(ROOT, 'client');

function depsInstalled(dir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const names = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
  return names.every(name => fs.existsSync(path.join(dir, 'node_modules', ...name.split('/'), 'package.json')));
}

function newestMtime(target) {
  if (!fs.existsSync(target)) return 0;
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) return stat.mtimeMs;
  let newest = 0;
  for (const entry of fs.readdirSync(target)) {
    newest = Math.max(newest, newestMtime(path.join(target, entry)));
  }
  return newest;
}

function buildIsCurrent() {
  const built = path.join(CLIENT, 'dist', 'index.html');
  if (!fs.existsSync(built)) return false;
  const sources = ['src', 'public', 'index.html', 'package.json', 'vite.config.ts', 'tailwind.config.js', 'postcss.config.js', 'tsconfig.app.json']
    .map(p => newestMtime(path.join(CLIENT, p)));
  return Math.max(...sources) <= fs.statSync(built).mtimeMs;
}

const checks = {
  'node-version': () => {
    const [major, minor] = process.versions.node.split('.').map(Number);
    return major > 20 || (major === 20 && minor >= 19);
  },
  'server-deps': () => depsInstalled(ROOT),
  'client-deps': () => depsInstalled(CLIENT),
  'client-build': buildIsCurrent
};

const check = checks[process.argv[2]];
if (!check) {
  console.error(`Unknown check "${process.argv[2]}". Use one of: ${Object.keys(checks).join(', ')}`);
  process.exit(2);
}
process.exit(check() ? 0 : 1);
