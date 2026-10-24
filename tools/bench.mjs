/**
 * Measures real BLE latency. CHANGES THE LAMP COLOR (restores it at the end).
 *
 *   npm run bench
 *   npm run bench -- --address=C0:00:00:23:0E:D8
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const plugin = path.join(here, '..', 'com.dose.ledcontrol.ulanziPlugin');

const { default: BleBridge } = await import(pathToFileURL(path.join(plugin, 'plugin/bridge.js')).href);
const { default: settings } = await import(pathToFileURL(path.join(plugin, 'plugin/settings.js')).href);

const arg = process.argv.find((value) => value.startsWith('--address='));
const address = arg ? arg.split('=')[1] : settings.get().address;

const cfg = { ...settings.get(), address, keepaliveSec: 0 };
const bridge = new BleBridge(() => cfg);

const colors = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#32ADE6', '#007AFF', '#AF52DE'];
const original = cfg.lastColor || '#FFFFFF';

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    min: sorted[0],
    avg: Math.round(sum / values.length),
    max: sorted[sorted.length - 1]
  };
}

console.log(`address: ${address}`);
console.log('warming up BLE link…');
await bridge.ensureStarted();
const t0 = Date.now();
await bridge.connect(address);
console.log(`connected in ${Date.now() - t0} ms`);

const times = [];
try {
  for (const color of colors) {
    const start = performance.now();
    await bridge.color(color, { powerOn: false });
    times.push(Math.round(performance.now() - start));
    process.stdout.write(`  ${color}  ${times.at(-1)} ms\n`);
  }
} finally {
  await bridge.color(original, { powerOn: true }).catch(() => {});
  const { min, avg, max } = stats(times);
  console.log(`\ncolor change: min ${min} ms · avg ${avg} ms · max ${max} ms`);
  bridge.stop();
}
