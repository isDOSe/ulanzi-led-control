/**
 * Builds docs/key-preview.html so the key artwork can be reviewed without
 * touching the deck. Run: npm run preview
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const plugin = path.join(root, 'com.dose.ledcontrol.ulanziPlugin');
const render = await import(pathToFileURL(path.join(plugin, 'plugin/render.js')).href);
const { DEFAULT_PALETTE } = await import(pathToFileURL(path.join(plugin, 'plugin/settings.js')).href);

const cases = [];

for (const color of DEFAULT_PALETTE) {
  cases.push({ title: color, svg: render.colorKeySVG({ color, label: '', active: false }) });
}
cases.push({ title: 'Label + active', svg: render.colorKeySVG({ color: '#FF3B30', label: 'Studio', active: true }) });
cases.push({ title: 'Offline', svg: render.colorKeySVG({ color: '#32ADE6', label: 'Desk', connected: false }) });
cases.push({ title: 'Power off overlay', svg: render.colorKeySVG({ color: '#34C759', label: 'Desk', powerOff: true }) });

cases.push({ title: 'Power ON', svg: render.powerKeySVG({ label: 'Power', on: true }) });
cases.push({ title: 'Power OFF', svg: render.powerKeySVG({ label: 'Power', on: false }) });
cases.push({ title: 'Power offline', svg: render.powerKeySVG({ label: 'Power', on: false, connected: false }) });

for (const level of [0, 25, 60, 100]) {
  cases.push({ title: `Brightness ${level}%`, svg: render.brightnessKeySVG({ level, mode: 'preset', lang: 'es' }) });
}
cases.push({ title: 'Brightness up', svg: render.brightnessKeySVG({ level: 70, mode: 'up', lang: 'es' }) });
cases.push({ title: 'Brightness down', svg: render.brightnessKeySVG({ level: 40, mode: 'down', lang: 'es' }) });

cases.push({ title: 'Settings connected', svg: render.settingsKeySVG({ connected: true, address: 'C0:00:00:23:0E:D8', protocol: 'LEDBLE / JDY ffe0/ffe1', lang: 'es' }) });
cases.push({ title: 'Settings idle', svg: render.settingsKeySVG({ connected: false, address: 'C0:00:00:23:0E:D8', lang: 'es' }) });
cases.push({ title: 'Settings error', svg: render.settingsKeySVG({ connected: false, address: 'C0:00:00:23:0E:D8', error: true, lang: 'es' }) });

const cards = cases.map(({ title, svg }) => `
    <figure class="key">
      <div class="face">${svg}</div>
      <figcaption>${title}</figcaption>
    </figure>`).join('');

const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>LED Control - Key artwork preview</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; padding: 40px 32px 64px;
    background: radial-gradient(1200px 600px at 20% -10%, #1d1d27, #0b0b0f 60%);
    color: #eef0f6; font-family: "Segoe UI", system-ui, sans-serif;
  }
  header { max-width: 980px; margin: 0 auto 28px; }
  h1 { font-size: 22px; margin: 0 0 6px; letter-spacing: .3px; }
  p { color: #8b91a1; font-size: 13px; margin: 0; }
  .grid {
    max-width: 980px; margin: 0 auto;
    display: grid; grid-template-columns: repeat(auto-fill, minmax(152px, 1fr)); gap: 22px;
  }
  .key { margin: 0; }
  .face { width: 144px; height: 144px; filter: drop-shadow(0 16px 24px rgba(0,0,0,.55)); }
  .face svg { width: 100%; height: 100%; display: block; }
  figcaption { margin-top: 8px; font-size: 11.5px; color: #8b91a1; font-family: Consolas, monospace; }
</style>
</head>
<body>
  <header>
    <h1>LED Control - key artwork</h1>
    <p>Generado por tools/preview.mjs - ${new Date().toISOString().slice(0, 10)}</p>
  </header>
  <div class="grid">${cards}
  </div>
</body>
</html>
`;

const out = path.join(root, 'docs', 'key-preview.html');
fs.writeFileSync(out, html, 'utf8');
console.log(`preview written to ${out}`);

