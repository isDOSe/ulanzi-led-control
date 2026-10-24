/**
 * Key artwork. Everything is generated as SVG (the deck's renderer accepts
 * data:image/svg+xml;base64) so icons always match the configured color.
 *
 * Notes:
 *  - Gradient ids are unique per color: inline SVG previews share the document
 *    id namespace, and duplicated ids would paint every key with the first hue.
 *  - Text on the key follows the Ulanzi UI language (es/en) where it is not
 *    universal (ON/OFF, hex codes and user labels are language-neutral).
 */

import { hexToRgb, luminance, normalizeHex } from './settings.js';

const SIZE = 256;

const STRINGS = {
  es: {
    connected: 'CONECTADO',
    offline: 'SIN CONEXIÓN',
    starting: 'INICIANDO',
    error: 'ERROR',
    level: 'NIVEL',
    up: 'SUBIR',
    down: 'BAJAR',
    cycle: 'CICLO'
  },
  en: {
    connected: 'CONNECTED',
    offline: 'OFFLINE',
    starting: 'STARTING',
    error: 'ERROR',
    level: 'LEVEL',
    up: 'UP',
    down: 'DOWN',
    cycle: 'CYCLE'
  }
};

function strings(lang) {
  const key = String(lang || 'en').slice(0, 2).toLowerCase();
  return STRINGS[key] || STRINGS.en;
}

export function dataUri(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function shade(hex, factor) {
  const { r, g, b } = hexToRgb(hex);
  const target = factor < 0 ? 0 : 255;
  const amount = Math.abs(factor);
  const mix = (channel) => clampChannel(channel + (target - channel) * amount);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function contrastText(hex) {
  return luminance(hex) > 0.58 ? '#111116' : '#FFFFFF';
}

export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fitFont(text, base, min, maxChars = 9) {
  const length = String(text || '').length;
  if (length <= maxChars) return base;
  return Math.max(min, Math.round(base * (maxChars / length)));
}

function statusDot({ x, y, color, on = true }) {
  return `
    <circle cx="${x}" cy="${y}" r="13" fill="${color}" opacity="${on ? 0.18 : 0.1}"/>
    <circle cx="${x}" cy="${y}" r="7" fill="${color}" opacity="${on ? 1 : 0.4}"/>`;
}

function frame({ body, border = '#2A2A33' }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
    <rect x="0" y="0" width="${SIZE}" height="${SIZE}" rx="44" fill="#08080B"/>
    <rect x="5" y="5" width="246" height="246" rx="38" fill="#101016" stroke="${border}" stroke-width="2"/>
    ${body}
  </svg>`;
}

/**
 * Color tile: the key itself is the swatch.
 */
export function colorKeySVG({
  color = '#FF3B30',
  label = '',
  showHex = true,
  active = false,
  connected = true,
  powerOff = false
} = {}) {
  const hex = normalizeHex(color);
  const textColor = contrastText(hex);
  const top = shade(hex, 0.12);
  const bottom = shade(hex, -0.28);
  const caption = escapeXml(label || '');
  const fontSize = fitFont(caption, 38, 15);
  const captionY = 130;
  const hexY = caption ? 186 : 150;
  const hexSize = caption ? 20 : 28;
  const swatchId = `sw-${hex.slice(1)}`;
  const sheenId = `sh-${hex.slice(1)}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
    <defs>
      <linearGradient id="${swatchId}" x1="0" y1="0" x2="0.75" y2="1">
        <stop offset="0" stop-color="${top}"/>
        <stop offset="1" stop-color="${bottom}"/>
      </linearGradient>
      <radialGradient id="${sheenId}" cx="0.22" cy="0.12" r="0.9">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.24"/>
        <stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0.04"/>
        <stop offset="1" stop-color="#000000" stop-opacity="0.1"/>
      </radialGradient>
    </defs>
    <rect x="0" y="0" width="${SIZE}" height="${SIZE}" rx="44" fill="#08080B"/>
    <rect x="6" y="6" width="244" height="244" rx="38" fill="url(#${swatchId})"/>
    <rect x="6" y="6" width="244" height="244" rx="38" fill="url(#${sheenId})"/>
    <rect x="6" y="6" width="244" height="244" rx="38" fill="none"
          stroke="#FFFFFF" stroke-opacity="${active ? 1 : 0.22}"
          stroke-width="${active ? 5 : 2}" opacity="${active ? 0.95 : 1}"/>

    ${caption ? `<text x="128" y="${captionY}" text-anchor="middle" fill="${textColor}"
          font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700"
          letter-spacing="1.6" opacity="0.96">${caption}</text>` : ''}
    ${showHex ? `<text x="128" y="${hexY}" text-anchor="middle" fill="${textColor}"
          font-family="Consolas, 'Courier New', monospace" font-size="${hexSize}" letter-spacing="2"
          opacity="${connected ? 0.7 : 0.45}">${hex.replace('#', '')}</text>` : ''}

    ${active ? `<g transform="translate(212,212)">
      <circle cx="0" cy="0" r="17" fill="#000000" opacity="0.22"/>
      <path d="M-8 0 L-2 6 L9 -7" fill="none" stroke="${textColor}" stroke-width="5"
            stroke-linecap="round" stroke-linejoin="round"/>
    </g>` : ''}

    ${powerOff ? `<rect x="6" y="6" width="244" height="244" rx="38" fill="#05050A" opacity="0.58"/>` : ''}
    ${connected ? '' : `<g transform="translate(212,44)">
      <circle cx="0" cy="0" r="15" fill="#FFB020"/>
      <text x="0" y="6" text-anchor="middle" fill="#1A1200" font-size="20" font-weight="900"
            font-family="Arial, sans-serif">!</text>
    </g>`}
  </svg>`;
}

export function powerKeySVG({
  label = 'POWER',
  on = false,
  connected = true,
  busy = false
} = {}) {
  const accent = on ? '#34C759' : '#7A8194';
  const glow = on ? '#34C759' : '#3A3A46';
  const stateText = busy ? '...' : (on ? 'ON' : 'OFF');
  return frame({
    border: on ? '#2E7D46' : '#2A2A33',
    body: `
    <text x="128" y="52" text-anchor="middle" fill="#9AA0AE" font-size="20" font-weight="700"
          letter-spacing="3" font-family="Arial, sans-serif">${escapeXml(label).toUpperCase()}</text>

    <circle cx="128" cy="126" r="58" fill="${glow}" opacity="${on ? 0.16 : 0.1}"/>
    <path d="M92 81 A56 56 0 1 0 164 81" fill="none" stroke="${accent}" stroke-width="10"
          stroke-linecap="round" opacity="${on ? 1 : 0.75}"/>
    <path d="M128 64 L128 124" stroke="${accent}" stroke-width="10" stroke-linecap="round"/>

    <text x="128" y="222" text-anchor="middle" fill="${accent}" font-size="28" font-weight="800"
          letter-spacing="4" font-family="Arial, sans-serif">${stateText}</text>

    <g transform="translate(44,44)">${statusDot({ x: 0, y: 0, color: connected ? '#34C759' : '#FFB020', on: connected })}</g>`
  });
}

export function brightnessKeySVG({
  label = 'BRIGHTNESS',
  level = 80,
  mode = 'preset',
  connected = true,
  lang = 'en'
} = {}) {
  const value = Math.max(0, Math.min(100, Number(level) || 0));
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dash = (circumference * value) / 100;
  const accent = '#FFB020';
  const words = strings(lang);
  const sublabel = mode === 'up' ? `↑ ${words.up}`
    : mode === 'down' ? `↓ ${words.down}`
      : mode === 'cycle' ? `⟳ ${words.cycle}`
        : words.level;

  return frame({
    body: `
    <text x="128" y="42" text-anchor="middle" fill="#9AA0AE" font-size="17" font-weight="700"
          letter-spacing="2.2" font-family="Arial, sans-serif">${escapeXml(label).toUpperCase()}</text>

    <circle cx="128" cy="130" r="${radius}" fill="none" stroke="#22222B" stroke-width="11"/>
    <circle cx="128" cy="130" r="${radius}" fill="none" stroke="${accent}" stroke-width="11"
            stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${circumference.toFixed(1)}"
            transform="rotate(-90 128 130)"/>
    <circle cx="128" cy="130" r="44" fill="${accent}" opacity="0.08"/>

    <text x="128" y="146" text-anchor="middle" fill="#FFFFFF" font-size="46" font-weight="800"
          font-family="Arial, sans-serif">${value}<tspan font-size="24" fill="#C9CEDB">%</tspan></text>
    <text x="128" y="222" text-anchor="middle" fill="${accent}" font-size="14" font-weight="700"
          letter-spacing="2.4" font-family="Arial, sans-serif">${escapeXml(sublabel)}</text>

    <g transform="translate(44,44)">${statusDot({ x: 0, y: 0, color: connected ? '#34C759' : '#FFB020', on: connected })}</g>`
  });
}

export function settingsKeySVG({
  connected = false,
  starting = false,
  address = '',
  protocol = '',
  label = 'LED',
  error = false,
  lang = 'en'
} = {}) {  const words = strings(lang);
  const tail = address || '—';
  const dot = error ? '#FF453A' : connected ? '#34C759' : starting ? '#FFB020' : '#7A8194';
  const statusText = error ? words.error : connected ? words.connected : starting ? words.starting : words.offline;
  const statusSize = statusText.length > 10 ? 14 : 16;

  const teeth = Array.from({ length: 8 }, (_, i) => `
    <rect x="-7" y="-40" width="14" height="20" rx="4" fill="#E8EAF2"
          transform="rotate(${i * 45})"/>`).join('');

  return frame({
    border: connected ? '#2E7D46' : '#2A2A33',
    body: `
    <text x="128" y="40" text-anchor="middle" fill="#9AA0AE" font-size="17" font-weight="700"
          letter-spacing="3" font-family="Arial, sans-serif">${escapeXml(label).toUpperCase()}</text>

    <g transform="translate(128,100)">
      ${teeth}
      <circle cx="0" cy="0" r="27" fill="#E8EAF2"/>
      <circle cx="0" cy="0" r="12" fill="#101016"/>
    </g>

    <text x="128" y="178" text-anchor="middle" fill="#F2F3F8" font-size="17" font-weight="700"
          font-family="Consolas, monospace" letter-spacing="0.5">${escapeXml(tail)}</text>
    <g transform="translate(128,204)">
      <circle cx="-62" cy="-5" r="7" fill="${dot}"/>
      <text x="-48" y="3" fill="#B9BFCC" font-size="${statusSize}" font-weight="700"
            font-family="Arial, sans-serif" letter-spacing="1">${statusText}</text>
    </g>
    ${protocol ? `<text x="128" y="236" text-anchor="middle" fill="#6F7688" font-size="10"
          font-family="Arial, sans-serif">${escapeXml(protocol.slice(0, 28))}</text>` : ''}`
  });
}

// Aliases used by the action classes.
export const colorKey = colorKeySVG;
export const powerKey = powerKeySVG;
export const brightnessKey = brightnessKeySVG;
export const settingsKey = settingsKeySVG;

