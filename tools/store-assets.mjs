/**
 * Generates the store artwork from the real plugin UI and key renderer.
 *
 *   npm run assets
 *
 * Outputs (all 2x where useful) in docs/store/assets/:
 *   icon-1024x1024.png            1:1 plugin icon
 *   cover-2400x1200.png           2:1 cover
 *   banner-1..3-2400x1600.png     3:2 banners
 *   screenshot-1..3-2196x1464.png 366:244 screenshots
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const plugin = path.join(root, 'com.dose.ledcontrol.ulanziPlugin');
const outDir = path.join(root, 'docs', 'store', 'assets');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'led-assets-'));
fs.mkdirSync(outDir, { recursive: true });

const render = await import(pathToFileURL(path.join(plugin, 'plugin/render.js')).href);
const { createRequire } = await import('node:module');
const require = createRequire(pathToFileURL(path.join(plugin, 'package.json')).href);
const { WebSocketServer } = require('ws');

// A tiny WebSocket server so the Property Inspector's `connected` event fires
// and it can load the Spanish localization from disk (onopen -> localizeUI).
const inspectorServer = new WebSocketServer({ host: '127.0.0.1', port: 0 });
await new Promise((resolve) => inspectorServer.once('listening', resolve));
const inspectorPort = inspectorServer.address().port;
inspectorServer.on('connection', (socket) => {
  socket.on('message', () => { /* preview only: ignore PI requests */ });
  socket.on('error', () => { /* ignore */ });
});
const edge = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
if (!fs.existsSync(edge)) {
  console.error('Microsoft Edge not found. Set EDGE_PATH to msedge.exe.');
  process.exit(1);
}

const port = 9351 + Math.floor(Math.random() * 200);
const browser = spawn(edge, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${path.join(temp, 'edge-profile')}`,
  'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let targets = null;
for (let i = 0; i < 40 && !targets; i += 1) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  } catch (error) {
    await sleep(200);
  }
}
if (!targets) throw new Error('Edge did not start');
const page = targets.find((target) => target.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve) => { ws.onopen = resolve; });

let nextId = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
};
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, (message) => (message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = (expression) => call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });

await call('Page.enable');
await call('Runtime.enable');

async function capture({ url, width, height, scale = 2, out, setup, wait = 900 }) {
  await call('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: scale, mobile: false
  });
  await call('Page.navigate', { url });
  await sleep(wait);
  if (setup) {
    await evaluate(setup);
    await sleep(350);
  }
  const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = path.join(outDir, out);
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log(`  ✓ ${out}`);
}

function htmlPage(body, css, { width, height, background = '#0b0b0f' } = {}) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; }
    body {
      background: ${background};
      color: #eef0f6;
      font-family: "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    ${css}
  </style></head><body>${body}</body></html>`;
}

function svgFile(name) {
  return pathToFileURL(path.join(plugin, 'assets', 'icons', `${name}.svg`)).href;
}
function keyArt(options, size = 150) {
  return `<div class="key" style="width:${size}px;height:${size}px">${render.colorKeySVG(options)}</div>`;
}
function artBox(svg, extraClass = '') {
  return `<div class="art ${extraClass}">${svg}</div>`;
}

const COLORS = [
  ['#FF3B30', 'Rojo'], ['#FF9500', 'Ámbar'], ['#FFCC00', 'Amarillo'],
  ['#34C759', 'Verde'], ['#00C7BE', 'Cian'], ['#007AFF', 'Azul']
];

const baseCss = `
  .kicker { font-size: 15px; letter-spacing: 4px; text-transform: uppercase; color: #7f8798; }
  h1 { font-size: 58px; line-height: 0.98; margin: 10px 0 14px; letter-spacing: -1.4px; }
  h2 { font-size: 40px; margin: 0 0 8px; letter-spacing: -0.8px; }
  p.lead { font-size: 20px; line-height: 1.45; color: #aeb5c4; margin: 0; }
  .brand { display: flex; align-items: center; gap: 20px; }
  .brand img { width: 92px; height: 92px; }
  .accent { color: #00C7BE; }
  .amber { color: #FFB020; }
  .art svg, .key svg { width: 100%; height: 100%; display: block; }
  .key { filter: drop-shadow(0 22px 30px rgba(0,0,0,0.5)); }
  .chips { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 22px; }
  .chip { border: 1px solid #2f303b; background: #16161d; color: #b8bfcd;
          border-radius: 999px; padding: 8px 14px; font-size: 14px; }
  .footer { position: absolute; left: 56px; bottom: 34px; color: #6f7688; font-size: 14px; }
  .footer strong { color: #b8bfcd; font-weight: 600; }
  .card { position: relative; background: #14141b; border: 1px solid #292a35; border-radius: 22px;
          box-shadow: 0 30px 60px rgba(0,0,0,0.45); overflow: hidden; }
  .card.fade::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 90px;
          background: linear-gradient(to bottom, rgba(20,20,27,0), #14141b 88%); pointer-events: none; }
  .pi { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }
  .grid { display: grid; gap: 26px; }
`;

function composeCover() {
  const tiles = [
    render.colorKeySVG({ color: '#FF3B30', label: 'Estudio', showHex: true, active: true }),
    render.powerKeySVG({ label: 'Power', on: true }),
    render.brightnessKeySVG({ label: 'Brillo', level: 80, mode: 'preset', lang: 'es' }),
    render.settingsKeySVG({ connected: true, address: 'C0:00:00:23:0E:D8', protocol: 'LEDBLE / JDY ffe0/ffe1', label: 'LED', lang: 'es' })
  ];
  const body = `
    <div style="position:absolute;inset:0;background:
      radial-gradient(900px 520px at 78% 22%, rgba(0,199,190,0.16), transparent 62%),
      radial-gradient(700px 420px at 12% 88%, rgba(255,176,32,0.10), transparent 60%),
      linear-gradient(135deg,#0e0e14,#08080b 70%)"></div>
    <div style="position:absolute;left:64px;top:72px;width:600px">
      <div class="brand">
        <img src="${svgFile('pluginIcon')}" alt="">
        <div>
          <div class="kicker">Ulanzi Deck · D200H</div>
          <div style="font-size:17px;color:#8b91a1;margin-top:4px">LED Control BLE</div>
        </div>
      </div>
      <h1>DOSe<br><span class="accent">LED Control</span></h1>
      <p class="lead">Tu tira LED BLE, en el deck.<br>Un botón, un color. Sin abrir apps.</p>
      <div class="chips">
        <span class="chip">Windows 10/11</span>
        <span class="chip">Bluetooth LE</span>
        <span class="chip">100% local</span>
      </div>
    </div>
    <div style="position:absolute;right:58px;top:72px;width:462px;height:462px;
      display:grid;grid-template-columns:repeat(2,220px);grid-auto-rows:220px;gap:22px;transform:rotate(-2deg)">
      ${tiles.map((svg) => `<div class="key">${svg}</div>`).join('')}
    </div>
    <div class="footer">por <strong>Ernesto Flames “DOSe”</strong> · <strong>www.isdose.com</strong></div>
  `;
  const css = baseCss + `h1 { font-size: 66px; }`;
  return htmlPage(body, css, { width: 1200, height: 600 });
}

function composeBanner1() {
  const colors = COLORS.map(([color, label]) => `
      <div class="key" style="width:150px;height:150px">${render.colorKeySVG({ color, label, showHex: false })}</div>`).join('');
  const actions = [
    { svg: render.powerKeySVG({ label: 'Power', on: true }), caption: 'Encendido' },
    { svg: render.brightnessKeySVG({ label: 'Brillo', level: 80, mode: 'preset', lang: 'es' }), caption: 'Brillo' },
    { svg: render.settingsKeySVG({ connected: true, address: 'C0:00:00:23:0E:D8', protocol: 'LEDBLE / JDY ffe0/ffe1', label: 'LED', lang: 'es' }), caption: 'Ajustes' }
  ].map(({ svg, caption }) => `
      <div style="text-align:center">
        <div class="key" style="width:140px;height:140px;margin:0 auto">${svg}</div>
        <div style="margin-top:12px;color:#8b91a1;font-size:15px">${caption}</div>
      </div>`).join('');
  const body = `
    <div style="padding:58px 64px 0">
      <div class="kicker">La tecla es el color</div>
      <h2 style="margin-top:12px">Elige el color. La tecla <span class="accent">lo es</span>.</h2>
      <p class="lead" style="max-width:930px">Cada botón muestra su color, etiqueta y hex. Mantén pulsado para ciclar la paleta y guardar el nuevo color en esa tecla.</p>
    </div>
    <div style="display:flex;gap:22px;justify-content:center;margin-top:38px">${colors}</div>
    <div style="display:flex;gap:48px;justify-content:center;margin-top:42px">${actions}</div>
    <div style="position:absolute;left:64px;right:64px;bottom:78px;display:flex;justify-content:space-between;
      border-top:1px solid #23242e;padding-top:18px;color:#6f7688;font-size:14px">
      <span>Funciona con ELK-BLEDOM, LEDBLE/JDY, Magic Blue y clones 7E…EF</span>
      <span><strong style="color:#b8bfcd">www.isdose.com</strong></span>
    </div>
    <div class="footer">DOSe LED Control · por <strong>Ernesto Flames “DOSe”</strong></div>
  `;
  return htmlPage(body, baseCss, { width: 1200, height: 800 });
}

function composeBanner2(piColor, piSettings) {
  const body = `
    <div style="padding:56px 64px 0;display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div class="kicker">Configura una vez</div>
        <h2 style="margin-top:12px">MAC, paleta y brillo, <span class="amber">sin tocar código</span>.</h2>
      </div>
      <div style="text-align:right;color:#8b91a1;font-size:14px;line-height:1.7;margin-top:8px">
        <div style="color:#00C7BE;font-weight:700">www.isdose.com</div>
        <div>Windows 10/11 · Ulanzi Studio 3.4+</div>
        <div style="color:#6f7688">Todo local · sin cuenta · sin telemetría</div>
      </div>
    </div>
    <div style="display:flex;gap:34px;justify-content:center;margin-top:30px">
      <div>
        <div class="card fade" style="width:330px;height:590px">
          <img class="pi" src="${pathToFileURL(piColor).href}" alt="">
        </div>
      </div>
      <div>
        <div class="card fade" style="width:330px;height:590px">
          <img class="pi" src="${pathToFileURL(piSettings).href}" alt="">
        </div>
      </div>
    </div>
  `;
  return htmlPage(body, baseCss, { width: 1200, height: 800 });
}

function composeBanner3() {
  const steps = [
    ['01', 'Pulsa una tecla', 'El deck envía el color al plugin.'],
    ['02', 'Plugin → puente BLE', 'Un proceso local mantiene la conexión.'],
    ['03', 'La lámpara cambia', 'Protocolo 7E…EF, sin nube.'],
    ['04', 'Estado en el deck', 'Anillo de activo y aviso si se cae.']
  ];
  const body = `
    <div style="padding:62px 64px 0">
      <div class="kicker">Cómo funciona</div>
      <h2 style="margin-top:12px">Deck → Ulanzi Studio → BLE. <span class="accent">Nada sale de tu PC.</span></h2>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:18px;padding:52px 64px 0">
      ${steps.map(([n, title, text]) => `
        <div style="background:#14141b;border:1px solid #292a35;border-radius:20px;padding:22px;min-height:176px">
          <div style="font-family:Consolas,monospace;color:#00C7BE;font-size:14px">${n}</div>
          <div style="font-size:21px;font-weight:700;margin-top:12px;line-height:1.2">${title}</div>
          <div style="color:#9aa1b0;font-size:15px;line-height:1.45;margin-top:10px">${text}</div>
        </div>`).join('')}
    </div>
    <div style="display:flex;gap:12px;padding:34px 64px 0">
      <span class="chip">Sin cuenta</span>
      <span class="chip">Sin telemetría</span>
      <span class="chip">Sin conexión a internet</span>
      <span class="chip">Código abierto (MIT)</span>
    </div>
    <div style="margin:34px 64px 0;display:flex;align-items:center;gap:18px;background:#14141b;
      border:1px solid #292a35;border-radius:18px;padding:18px 22px">
      <img src="${svgFile('pluginIcon')}" style="width:58px;height:58px">
      <div>
        <div style="font-size:18px;font-weight:700">DOSe LED Control</div>
        <div style="font-size:14px;color:#9aa1b0;margin-top:3px">Búscalo en Ulanzi Studio · Windows 10/11 · v0.1.2</div>
      </div>
      <div style="margin-left:auto;color:#00C7BE;font-weight:700;font-size:15px">www.isdose.com</div>
    </div>
    <div class="footer">Hecho por <strong>Ernesto Flames “DOSe”</strong> · <strong>www.isdose.com</strong></div>
  `;
  return htmlPage(body, baseCss, { width: 1200, height: 800 });
}

function composeShot1(piColor) {
  const body = `
    <div style="position:absolute;inset:0;background:
      radial-gradient(700px 400px at 82% 10%, rgba(255,59,48,0.14), transparent 60%),
      linear-gradient(135deg,#101016,#08080b)"></div>
    <div style="position:absolute;left:48px;top:12px;width:360px;height:700px" class="card">
      <img class="pi" src="${pathToFileURL(piColor).href}" alt="">
    </div>
    <div style="position:absolute;right:44px;bottom:24px;color:#6f7688;font-size:13px">
      <strong style="color:#b8bfcd">www.isdose.com</strong>
    </div>
    <div style="position:absolute;left:470px;top:92px;width:560px">
      <div class="kicker">Acción Color</div>
      <h2 style="font-size:48px;margin-top:14px">Un botón,<br>un color.</h2>
      <p class="lead">Elige color, etiqueta y, si quieres, un brillo fijo. La tecla se pinta sola y marca la que está activa.</p>
      <div style="display:flex;gap:18px;margin-top:34px">
        ${['#FF3B30', '#FFB020', '#00C7BE'].map((color) => `<div class="key" style="width:104px;height:104px">${render.colorKeySVG({ color, label: '', showHex: true })}</div>`).join('')}
      </div>
      <div style="margin-top:34px;color:#8b91a1;font-size:14px">Mantén pulsado para ciclar la paleta global.</div>
    </div>
  `;
  return htmlPage(body, baseCss, { width: 1098, height: 732 });
}

function composeShot2(piSettings) {
  const body = `
    <div style="position:absolute;inset:0;background:
      radial-gradient(700px 400px at 80% 8%, rgba(0,199,190,0.14), transparent 60%),
      linear-gradient(135deg,#101016,#08080b)"></div>
    <div style="position:absolute;left:48px;top:16px;width:370px;height:680px" class="card fade">
      <img class="pi" src="${pathToFileURL(piSettings).href}" alt="">
    </div>
    <div style="position:absolute;right:44px;bottom:24px;color:#6f7688;font-size:13px">
      <strong style="color:#b8bfcd">www.isdose.com</strong>
    </div>
    <div style="position:absolute;left:480px;top:86px;width:550px">
      <div class="kicker">Ajustes</div>
      <h2 style="font-size:46px;margin-top:14px">Escanea, elige<br>y listo.</h2>
      <div style="margin-top:26px;display:grid;gap:16px;color:#b8bfcd;font-size:17px">
        <div>• MAC guardada una sola vez</div>
        <div>• Escaneo BLE con nombre y RSSI</div>
        <div>• Paleta editable para la pulsación larga</div>
        <div>• Keep-alive y diagnóstico de servicios</div>
        <div>• Mock mode para probar sin lámpara</div>
      </div>
      <div style="margin-top:28px;color:#8b91a1;font-size:14px">Estado en vivo: verde conectado, ámbar buscando, rojo error.</div>
    </div>
  `;
  return htmlPage(body, baseCss, { width: 1098, height: 732 });
}

function composeShot3() {
  const tiles = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#007AFF']
    .map((color) => `<div class="key" style="width:142px;height:142px">${render.colorKeySVG({ color, label: '', showHex: true })}</div>`)
    .join('');
  const body = `
    <div style="padding:52px 54px 0">
      <div class="kicker">La tecla es el color</div>
      <h2 style="margin-top:12px;font-size:44px">Tu paleta, en el deck.</h2>
      <p class="lead">Cada tecla muestra el color elegido. El anillo marca la última aplicada.</p>
    </div>
    <div style="display:flex;gap:20px;justify-content:center;margin-top:46px">${tiles}</div>
    <div class="footer">DOSe LED Control · <strong>www.isdose.com</strong></div>
  `;
  return htmlPage(body, baseCss, { width: 1098, height: 732 });
}

function writePage(name, html) {
  const file = path.join(temp, `${name}.html`);
  fs.writeFileSync(file, html, 'utf8');
  return pathToFileURL(file).href;
}

console.log('Capturing Property Inspectors…');
const piColor = path.join(temp, 'pi-color.png');
const piSettings = path.join(temp, 'pi-settings.png');
const piBase = pathToFileURL(path.join(plugin, 'property-inspector')).href;

await capture({
  url: `${piBase}/color.html?language=es_ES&port=${inspectorPort}&uuid=com.dose.ledcontrol.deck.color&key=3_0&actionid=preview`,
  width: 360,
  height: 700,
  out: 'pi-color.png',
  wait: 1200,
  setup: `(() => {
    const picker = document.querySelector('#colorPicker');
    const label = document.querySelector('#label');
    picker.value = '#FFAA00';
    picker.dispatchEvent(new Event('input', { bubbles: true }));
    label.value = 'Naranja';
    label.dispatchEvent(new Event('input', { bubbles: true }));
  })()`
});
fs.copyFileSync(path.join(outDir, 'pi-color.png'), piColor);
fs.rmSync(path.join(outDir, 'pi-color.png'));

await capture({
  url: `${piBase}/settings.html?language=es_ES&port=${inspectorPort}&uuid=com.dose.ledcontrol.deck.settings&key=0_0&actionid=preview`,
  width: 380,
  height: 960,
  out: 'pi-settings.png',
  wait: 1400,
  setup: `(() => {
    const set = (sel, cls, html) => { const el = document.querySelector(sel); if (!el) return; if (cls) el.className = cls; el.innerHTML = html; };
    set('#connStatus', 'pi-status ok', '<span class="dot"></span><span class="grow">Conectado · LEDBLE / JDY ffe0/ffe1</span>');
    set('#connDetail', 'pi-hint', 'C0:00:00:23:0E:D8 · Python 3.11.15');
    set('#status', 'pi-status ok', '<span class="dot"></span><span class="grow">Listo</span>');
    document.querySelector('#address').value = 'C0:00:00:23:0E:D8';
    const advanced = document.querySelector('#advanced');
    if (advanced) advanced.style.display = 'none';
    const save = document.querySelector('#save');
    if (save && save.parentElement) save.parentElement.style.display = 'none';
  })()`
});
fs.copyFileSync(path.join(outDir, 'pi-settings.png'), piSettings);
fs.rmSync(path.join(outDir, 'pi-settings.png'));

console.log('Composing artwork…');
await capture({
  url: writePage('icon', htmlPage(
    `<div style="width:512px;height:512px;background:#0b0b0f">
       <img src="${svgFile('pluginIcon')}" style="width:100%;height:100%;display:block">
     </div>`,
    '', { width: 512, height: 512 }
  )),
  width: 512, height: 512, out: 'icon-1024x1024.png'
});

await capture({ url: writePage('cover', composeCover()), width: 1200, height: 600, out: 'cover-2400x1200.png' });
await capture({ url: writePage('banner1', composeBanner1()), width: 1200, height: 800, out: 'banner-1-2400x1600.png' });
await capture({ url: writePage('banner2', composeBanner2(piColor, piSettings)), width: 1200, height: 800, out: 'banner-2-2400x1600.png' });
await capture({ url: writePage('banner3', composeBanner3()), width: 1200, height: 800, out: 'banner-3-2400x1600.png' });
await capture({ url: writePage('shot1', composeShot1(piColor)), width: 1098, height: 732, out: 'screenshot-1-2196x1464.png' });
await capture({ url: writePage('shot2', composeShot2(piSettings)), width: 1098, height: 732, out: 'screenshot-2-2196x1464.png' });
await capture({ url: writePage('shot3', composeShot3()), width: 1098, height: 732, out: 'screenshot-3-2196x1464.png' });

ws.close();
try { inspectorServer.close(); } catch (error) { /* ignore */ }
browser.kill();
await sleep(600);
try {
  fs.rmSync(temp, { recursive: true, force: true });
} catch (error) {
  console.warn(`(temp folder left: ${temp})`);
}
console.log(`\nAssets in ${outDir}`);
