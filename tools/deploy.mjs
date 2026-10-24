/**
 * Copies the plugin into Ulanzi Studio's Plugins folder.
 *
 *   npm run deploy          keep the existing data/ folder (settings, caches)
 *   npm run deploy:clean    remove stale files (data/ is always preserved)
 *
 * Ulanzi Studio must be restarted (or the plugin toggled) to load new code:
 * the main service is a long-lived Node process.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = path.join(root, 'com.dose.ledcontrol.ulanziPlugin');
const pluginFolder = 'com.dose.ledcontrol.ulanziPlugin';

if (!process.env.APPDATA) {
  console.error('APPDATA is not defined; run this on Windows.');
  process.exit(1);
}
const target = path.join(process.env.APPDATA, 'Ulanzi', 'UlanziDeck', 'Plugins', pluginFolder);
const clean = process.argv.includes('--clean');
const dryRun = process.argv.includes('--dry-run');

if (!fs.existsSync(source)) {
  console.error(`Plugin source not found: ${source}`);
  process.exit(1);
}

// node_modules/ws is required at runtime (Ulanzi runs Node 20, no global WebSocket).
const wsPath = path.join(source, 'node_modules', 'ws');
if (!fs.existsSync(wsPath)) {
  console.log('installing ws dependency…');
  const install = spawnSync('npm', ['install', '--no-audit', '--no-fund'], {
    cwd: source,
    stdio: 'inherit',
    shell: true,
    windowsHide: true
  });
  if (install.status !== 0) {
    console.error('npm install failed; cannot deploy.');
    process.exit(1);
  }
}

function keep(entry) {
  const name = path.basename(entry);
  if (name === 'data') return false;
  if (name === '.git' || name === '__pycache__') return false;
  if (name.endsWith('.log') || name.endsWith('.pyc')) return false;
  return true;
}

function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (!keep(full)) continue;
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full));
  }
  return out;
}

console.log(`source: ${source}`);
console.log(`target: ${target}`);

if (dryRun) {
  for (const file of listFiles(source)) console.log(`  ${file}`);
  process.exit(0);
}

fs.mkdirSync(target, { recursive: true });

if (clean) {
  for (const entry of fs.readdirSync(target)) {
    if (entry === 'data') continue;
    fs.rmSync(path.join(target, entry), { recursive: true, force: true });
  }
  console.log('target cleaned (data preserved)');
}

fs.cpSync(source, target, {
  recursive: true,
  force: true,
  filter: (entry) => keep(entry) || entry === source
});

// Make sure a data folder exists for the bridge cache/settings.
fs.mkdirSync(path.join(target, 'data'), { recursive: true });

const files = listFiles(target).length;
console.log(`\n✓ deployed ${files} files`);

const running = spawnSync('tasklist', ['/FI', 'IMAGENAME eq Ulanzi Studio.exe', '/NH'], {
  encoding: 'utf8',
  windowsHide: true
});
const isRunning = /ulanzi/i.test(running.stdout || '');
if (isRunning) {
  console.log('\nUlanzi Studio is running. Restart it (or disable/enable the plugin)');
  console.log('so the new Node main service is loaded.');
}
console.log('\nNext: add the "Settings & Status" key once, scan/pick the light, then add color keys.');
console.log(`Data folder: ${path.join(target, 'data')}`);
