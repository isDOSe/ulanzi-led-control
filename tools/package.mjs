/**
 * Builds the store-ready plugin ZIP.
 *
 *   npm run package
 *
 * The archive contains the plugin folder at its root, so users can unzip it
 * straight into %APPDATA%\Ulanzi\UlanziDeck\Plugins (or upload it to the UGC).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = path.join(root, 'com.dose.ledcontrol.ulanziPlugin');
const dist = path.join(root, 'dist');
const folderName = 'com.dose.ledcontrol.ulanziPlugin';

const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
const version = manifest.Version;
const zipName = `${folderName}-${version}.zip`;
const zipPath = path.join(dist, zipName);

const skip = new Set(['data', '__pycache__', '.git', '.vscode']);
const skipFiles = new Set(['package-lock.json', 'test_led_protocol.py']);
function keep(entry) {
  const name = path.basename(entry);
  if (skip.has(name)) return false;
  if (skipFiles.has(name)) return false;
  if (name.endsWith('.log') || name.endsWith('.pyc') || name.endsWith('.tmp')) return false;
  return true;
}

fs.mkdirSync(dist, { recursive: true });
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'led-package-'));
const stagingPlugin = path.join(staging, folderName);
fs.cpSync(source, stagingPlugin, { recursive: true, filter: keep });

// Remove an old archive; Compress-Archive refuses to overwrite by default.
if (fs.existsSync(zipPath)) fs.rmSync(zipPath);
const command = process.platform === 'win32'
  ? `Compress-Archive -Path '${stagingPlugin.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -CompressionLevel Optimal`
  : `cd '${staging}' && zip -qr '${zipPath}' '${folderName}'`;
const zipped = spawnSync(process.platform === 'win32' ? 'powershell' : 'bash',
  process.platform === 'win32' ? ['-NoProfile', '-Command', command] : ['-c', command],
  { encoding: 'utf8', windowsHide: true });

if (zipped.status !== 0) {
  console.error(zipped.stderr || zipped.stdout);
  fs.rmSync(staging, { recursive: true, force: true });
  process.exit(1);
}

fs.rmSync(staging, { recursive: true, force: true });

const size = fs.statSync(zipPath).size;
const hash = spawnSync('powershell', ['-NoProfile', '-Command',
  `(Get-FileHash -Algorithm SHA256 '${zipPath.replace(/'/g, "''")}').Hash`], { encoding: 'utf8', windowsHide: true })
  .stdout.trim();

console.log(`\n✓ ${zipName}`);
console.log(`  ${(size / 1024 / 1024).toFixed(2)} MB`);
console.log(`  SHA-256 ${hash}`);
console.log(`  ${zipPath}`);
console.log('\nUpload this ZIP to https://ugc.ulanzistudio.com → Upload Works → Plugins.');
