/**
 * Smoke tests that do not need Bluetooth:
 *  - bridge lifecycle in mock mode (real Python process, real NDJSON)
 *  - color/power/brightness/scan commands
 *  - SVG key rendering and color math
 *
 * Run: npm test
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.LED_MOCK = '1';

const here = path.dirname(fileURLToPath(import.meta.url));
const plugin = path.join(here, '..', 'com.dose.ledcontrol.ulanziPlugin');

const { default: BleBridge } = await import(pathToFileURL(path.join(plugin, 'plugin/bridge.js')).href);
const render = await import(pathToFileURL(path.join(plugin, 'plugin/render.js')).href);

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`  ok ${name}`);
}

console.log('\nPython protocol frames');
{
  const result = spawnSync('python', [path.join(plugin, 'backend/test_led_protocol.py')], {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
  });
  if (result.status !== 0) {
    console.error(result.stdout, result.stderr);
    throw new Error('protocol tests failed');
  }
  console.log(result.stdout.trim().split('\n').map((line) => `  ${line}`).join('\n'));
  ok('frame builders match the 7E...EF protocol');
}

console.log('\nRendering');
{
  const color = render.colorKeySVG({ color: '#FF8800', label: 'Studio', active: true });
  assert.match(color, /^<svg xmlns/);
  assert.match(color, /FF8800/);
  assert.match(color, /Studio/);
  assert.match(color, /url\(#sw-/);

  const uri = render.dataUri(color);
  assert.match(uri, /^data:image\/svg\+xml;base64,/);
  const decoded = Buffer.from(uri.split(',')[1], 'base64').toString('utf8');
  assert.equal(decoded, color);

  assert.equal(render.contrastText('#FFFFFF'), '#111116');
  assert.equal(render.contrastText('#101010'), '#FFFFFF');
  assert.equal(render.shade('#000000', 0.5), '#808080');

  const power = render.powerKeySVG({ label: 'Power', on: true });
  assert.match(power, />ON</);
  const brightness = render.brightnessKeySVG({ level: 42, mode: 'preset' });
  assert.match(brightness, />42</);
  const settings = render.settingsKeySVG({ connected: true, address: 'C0:00:00:23:0E:D8', protocol: 'LEDBLE / JDY ffe0/ffe1' });
  assert.match(settings, /CONECTADO|Connected|CONNECTED/);
  ok('key SVG output and helpers');

  // Regression: actions must use the exported render aliases. A mismatch here
  // used to abort every add/run silently.
  const { default: ColorAction } = await import(pathToFileURL(path.join(plugin, 'plugin/actions/color.js')).href);
  const painted = [];
  const fakeApp = {
    render,
    settings: { palette: ['#FF3B30', '#FFAA00'], get: () => ({ lastColor: '#FF3B30' }) },
    state: { connected: true, power: true, color: '#FF3B30' },
    config: { longPressMs: 10 },
    lang: 'es',
    log: () => {},
    isActiveColor: () => true,
    handleSuccess: () => {},
    handleError: () => {}
  };
  fakeApp.ud = {
    setBaseDataIcon: (context, data) => painted.push({ context, data }),
    setSettings: () => {},
    toast: () => {},
    showAlert: () => {}
  };
  const action = new ColorAction('com.dose.ledcontrol.deck.color___4_0___test', fakeApp);
  action.setParams({ color: '#FFAA00', label: 'amarillo', showHex: true });
  assert.equal(painted.length, 1);
  assert.match(painted[0].data, /^data:image\/svg\+xml;base64,/);
  const decodedAction = Buffer.from(painted[0].data.split(',')[1], 'base64').toString('utf8');
  assert.match(decodedAction, /FFAA00/);
  assert.match(decodedAction, /amarillo/);
  ok('ColorAction renders its own color through the app.render aliases');
}

console.log('\nBLE bridge (mock)');
{
  const bridge = new BleBridge(() => ({
    address: 'C0:00:00:23:0E:D8',
    keepaliveSec: 0,
    connectTimeout: 15,
    mock: true,
    debug: false
  }));

  try {
    await bridge.ensureStarted();
    ok('python bridge starts and handshakes');

    const status = await bridge.request('status');
    assert.equal(status.ok, true);
    assert.equal(status.mock, true);
    assert.equal(status.bleak, true);
    ok('status reports mock + bleak availability');

    const color = await bridge.color('#FF8800', { powerOn: true });
    assert.equal(color.state.hex, '#FF8800');
    assert.equal(color.state.power, true);
    ok('color command updates bridge state');

    const brightness = await bridge.brightness(42);
    assert.equal(brightness.state.brightness, 42);
    ok('brightness command');

    const power = await bridge.power(false);
    assert.equal(power.state.power, false);
    ok('power command');

    const scan = await bridge.scan(1);
    assert.ok(Array.isArray(scan.devices) && scan.devices.length >= 1);
    assert.ok(scan.devices[0].address);
    ok('scan returns devices');

    const identify = await bridge.identify();
    assert.ok(Array.isArray(identify.services));
    ok('identify returns services');
  } finally {
    bridge.stop();
  }
}

console.log(`\n${passed} checks passed.\n`);

