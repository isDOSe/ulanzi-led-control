/**
 * Settings store for the LED Control plugin.
 *
 * Global settings (MAC, palette, python path, keepalive…) live in
 * <plugin>/data/settings.json. That keeps them independent from Ulanzi's
 * global settings storage (which is tied to action activity) and easy to
 * inspect while debugging.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(PLUGIN_ROOT, 'data');
export const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

export const DEFAULT_PALETTE = [
  '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#32ADE6',
  '#007AFF', '#5856D6', '#AF52DE', '#FF2D55', '#FFFFFF', '#FFD9A0'
];

export const DEFAULT_SETTINGS = {
  address: 'C0:00:00:23:0E:D8',
  pythonPath: '',
  palette: DEFAULT_PALETTE,
  keepaliveSec: 30,
  connectTimeout: 15,
  powerOnColor: true,
  lastColor: '#FFB46B',
  lastBrightness: 80,
  lastPower: null,
  mock: false,
  debug: false
};

export function normalizeMac(value) {
  const mac = String(value || '').trim().toUpperCase().replace(/-/g, ':');
  if (!mac) return '';
  if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac)) return null;
  return mac;
}

export function isHexColor(value) {
  return typeof value === 'string' && /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

export function normalizeHex(value, fallback = '#FFFFFF') {
  if (!isHexColor(value)) return fallback;
  let raw = String(value).trim().replace('#', '');
  if (raw.length === 3) raw = raw.split('').map((c) => c + c).join('');
  return `#${raw.toUpperCase()}`;
}

export function hexToRgb(hex) {
  const raw = normalizeHex(hex).slice(1);
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16)
  };
}

export function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

class SettingsStore {
  constructor() {
    this.data = { ...DEFAULT_SETTINGS };
    this.load();
  }

  load() {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = this._sanitize({ ...DEFAULT_SETTINGS, ...parsed });
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('[LED] settings load failed:', err.message);
      this.data = { ...DEFAULT_SETTINGS };
    }
    return this.data;
  }

  get() {
    return this.data;
  }

  merge(patch = {}) {
    this.data = this._sanitize({ ...this.data, ...patch });
    this.save();
    return this.data;
  }

  save() {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${SETTINGS_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, SETTINGS_FILE);
    } catch (err) {
      console.error('[LED] settings save failed:', err.message);
    }
  }

  _sanitize(data) {
    const mac = normalizeMac(data.address);
    const palette = Array.isArray(data.palette)
      ? data.palette.filter(isHexColor).map((c) => normalizeHex(c)).slice(0, 24)
      : [];
    return {
      ...DEFAULT_SETTINGS,
      ...data,
      address: mac === null ? data.address : mac,
      palette: palette.length >= 2 ? palette : [...DEFAULT_PALETTE],
      keepaliveSec: clampNumber(data.keepaliveSec, 0, 300, DEFAULT_SETTINGS.keepaliveSec),
      connectTimeout: clampNumber(data.connectTimeout, 5, 60, DEFAULT_SETTINGS.connectTimeout),
      lastColor: normalizeHex(data.lastColor, DEFAULT_SETTINGS.lastColor),
      lastBrightness: clampNumber(data.lastBrightness, 0, 100, DEFAULT_SETTINGS.lastBrightness),
      powerOnColor: data.powerOnColor !== false,
      mock: data.mock === true,
      debug: data.debug === true
    };
  }
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

export const settings = new SettingsStore();
export default settings;
