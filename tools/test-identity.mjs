/**
 * Integration test for action identity across drag & drop / replacement.
 *
 * Boots the real plugin against a mock Ulanzi WebSocket server and a mock BLE
 * bridge, then verifies that a moved key keeps its own params and that a new
 * key dropped on an occupied position does not inherit the occupant's params.
 *
 * Run: node tools/test-identity.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = path.join(root, 'com.dose.ledcontrol.ulanziPlugin');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'led-identity-'));
const plugin = path.join(temp, 'plugin-copy');
const require = createRequire(pathToFileURL(path.join(source, 'package.json')).href);
const { WebSocketServer } = require('ws');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

// Copy the deployed package (without runtime data) and force mock mode.
fs.cpSync(source, plugin, {
  recursive: true,
  filter: (entry) => path.basename(entry) !== 'data' && path.basename(entry) !== '__pycache__'
});
const dataDir = path.join(plugin, 'data');
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({
  address: 'C0:00:00:23:0E:D8',
  keepaliveSec: 0,
  mock: true,
  palette: ['#FF3B30', '#00FF00', '#0000FF']
}, null, 2));

const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
await new Promise((resolve) => server.once('listening', resolve));
const port = server.address().port;
console.log('mock Ulanzi on', port);

let client = null;
server.on('connection', (ws) => {
  client = ws;
  ws.on('message', () => { /* acks: ignore */ });
});

const child = spawn(process.execPath, [path.join(plugin, 'plugin', 'app.js'), '127.0.0.1', String(port), 'en'], {
  cwd: plugin,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
});
child.stdout.on('data', (chunk) => {
  const text = String(chunk);
  for (const line of text.split(/\r?\n/)) {
    if (line.includes('[LED]')) console.log(`  ${line}`);
  }
});
child.stderr.on('data', (chunk) => {
  const text = String(chunk);
  if (!text.trim()) return;
  if (text.includes('[ULANZIDECK]')) return; // noisy SDK state dumps
  console.error(`  [stderr] ${text.trim().slice(0, 400)}`);
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const colorUuid = 'com.dose.ledcontrol.deck.color';
const action = (key, id) => `${colorUuid}___${key}___${id}`;
const X = '11111111-1111-4111-8111-111111111111';
const Y = '22222222-2222-4222-8222-222222222222';
const Z = '33333333-3333-4333-8333-333333333333';

function send(cmd, key, id, param) {
  if (!client) throw new Error('no app connection');
  const message = {
    code: 0,
    cmd,
    cmdType: 'REQUEST',
    uuid: colorUuid,
    key,
    actionid: id,
    context: action(key, id)
  };
  if (param !== undefined) message.param = param;
  client.send(JSON.stringify(message));
}

const logFile = path.join(dataDir, 'plugin.log');
const logText = () => {
  try { return fs.readFileSync(logFile, 'utf8'); } catch (error) { return ''; }
};
async function waitFor(match, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (match(logText())) return true;
    await sleep(120);
  }
  return false;
}

try {
  const connected = await waitFor((text) => text.includes('connected'));
  assert(connected, 'plugin did not connect to the mock host');
  await sleep(1500); // let the mock BLE bridge start

  // Two color keys with distinct params.
  send('add', '3_0', X, { color: '#FF0000', label: 'rojo', powerOn: true, showHex: true, brightnessOverride: null });
  await sleep(250);
  send('add', '4_0', Y, { color: '#00FF00', label: 'verde', powerOn: true, showHex: true, brightnessOverride: null });
  await sleep(400);

  // Drag & drop swap: X goes to 4_0, Y goes to 3_0, without params in add.
  send('add', '4_0', X, {});
  await sleep(200);
  send('add', '3_0', Y, {});
  await sleep(400);

  send('run', '4_0', X);
  send('run', '3_0', Y);
  await sleep(900);

  const moved = await waitFor((text) => text.includes('"from":"3_0"') && text.includes('"to":"4_0"'));
  assert(moved, 'plugin did not log the move 3_0 -> 4_0');

  const afterMove = logText();
  const recent = afterMove.slice(afterMove.lastIndexOf('moved'));
  // Both runs must use their own colors (not the previous occupant's).
  assert(/label":"color #FF0000"/.test(recent), 'moved key 4_0 did not run with #FF0000');
  assert(/label":"color #00FF00"/.test(recent), 'moved key 3_0 did not run with #00FF00');

  // New action dropped on an occupied slot must not inherit the old params.
  send('add', '4_0', Z, { color: '#0000FF', label: 'azul', powerOn: true, showHex: true, brightnessOverride: null });
  await sleep(400);
  send('run', '4_0', Z);
  await sleep(900);

  const afterReplace = logText();
  const tail = afterReplace.slice(afterReplace.lastIndexOf('slot replaced'));
  assert(tail.includes('"newType":"color"'), 'plugin did not log the slot replacement');
  assert(/label":"color #0000FF"/.test(tail), 'new key 4_0 did not run with its own #0000FF');

  console.log('\nidentity/move tests passed');
} finally {
  try { child.kill(); } catch (error) { /* ignore */ }
  try { server.close(); } catch (error) { /* ignore */ }
  await sleep(500);
  try { fs.rmSync(temp, { recursive: true, force: true }); } catch (error) { /* ignore */ }
}
