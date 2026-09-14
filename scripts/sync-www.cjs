/**
 * Copy static GymTracker assets into www/ for Capacitor.
 * Keeps node_modules / ios / tests out of the native web bundle.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dest = path.join(root, 'www');

const files = [
  'index.html',
  'voice-test.html',
  'setup-menu.html',
  'lockscreen-test.html',
  'manifest.json',
  'sw.js',
  'README.md'
];

const dirs = ['css', 'js'];

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copyFile(rel) {
  const from = path.join(root, rel);
  const to = path.join(dest, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function copyDir(rel) {
  const from = path.join(root, rel);
  const to = path.join(dest, rel);
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const child = path.join(rel, entry.name);
    if (entry.isDirectory()) copyDir(child);
    else copyFile(child);
  }
}

rmrf(dest);
fs.mkdirSync(dest, { recursive: true });
for (const f of files) {
  if (fs.existsSync(path.join(root, f))) copyFile(f);
}
for (const d of dirs) copyDir(d);
console.log('www synced:', dest);
