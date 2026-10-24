/**
 * Node side of the BLE bridge.
 *
 * Spawns backend/ble_bridge.py (persistent bleak connection) and speaks
 * NDJSON over stdin/stdout. Every call resolves with the bridge's state so
 * callers can update key rendering without an extra round trip.
 */

import { spawn, spawnSync } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

import { PLUGIN_ROOT, DATA_DIR } from './settings.js';

const BRIDGE_SCRIPT = path.join(PLUGIN_ROOT, 'backend', 'ble_bridge.py');
const READY_TIMEOUT_MS = 9000;
const DEFAULT_TIMEOUT_MS = 20000;

function log(...args) {
  console.log('[LED]', ...args);
}

function warn(...args) {
  console.warn('[LED]', ...args);
}

export class BleBridge extends EventEmitter {
  constructor(getSettings) {
    super();
    this.getSettings = getSettings;
    this.proc = null;
    this.ready = false;
    this.startPromise = null;
    this.pending = new Map();
    this.nextId = 1;
    this.python = null;
    this.diagnostics = { python: null, version: null, mock: false, bleak: null, lastError: null, stderr: [] };
    this.lastState = {};
    this.stopping = false;
  }

  // ── python discovery ────────────────────────────────────────────

  resolvePython(force = false) {
    if (this.python && !force) return this.python;
    const cfg = this.getSettings();
    const candidates = [];
    if (cfg.pythonPath) candidates.push({ cmd: cfg.pythonPath, args: [] });
    if (process.env.LED_PYTHON) candidates.push({ cmd: process.env.LED_PYTHON, args: [] });
    candidates.push({ cmd: 'python', args: [] });
    candidates.push({ cmd: 'py', args: ['-3'] });
    candidates.push({ cmd: 'python3', args: [] });
    for (const version of ['313', '312', '311', '310', '39']) {
      candidates.push({
        cmd: path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', `Python${version}`, 'python.exe'),
        args: []
      });
      candidates.push({ cmd: `C:\\Python${version}\\python.exe`, args: [] });
    }

    for (const candidate of candidates) {
      if (!candidate.cmd) continue;
      if (candidate.cmd.includes(path.sep) && !fs.existsSync(candidate.cmd)) continue;
      try {
        const probe = spawnSync(
          candidate.cmd,
          [...candidate.args, '-c', 'import sys; sys.stdout.write(sys.executable)'],
          { encoding: 'utf8', timeout: 6000, windowsHide: true }
        );
        if (probe.status !== 0 || !(probe.stdout || '').trim()) continue;
        const executable = probe.stdout.trim();
        const candidateInfo = { cmd: candidate.cmd, args: candidate.args, executable };
        // Prefer an interpreter that can import bleak; keep the first working
        // one as a fallback so the error message in the UI is meaningful.
        if (this.hasBleak(candidateInfo)) {
          this.python = candidateInfo;
          log('python:', executable, '(bleak ok)');
          return this.python;
        }
        if (!this.python) this.python = candidateInfo;
      } catch (err) {
        // keep probing
      }
    }
    if (this.python) log('python:', this.python.executable, '(bleak missing)');
    return this.python;
  }

  hasBleak(python) {
    try {
      const probe = spawnSync(python.executable, ['-c', 'import bleak'], {
        encoding: 'utf8', timeout: 8000, windowsHide: true
      });
      return probe.status === 0;
    } catch (err) {
      return false;
    }
  }

  // ── lifecycle ───────────────────────────────────────────────────

  async ensureStarted() {
    if (this.ready && this.proc) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this._start().catch((err) => {
      this.diagnostics.lastError = err.message;
      warn('bridge start failed:', err.message);
      throw err;
    }).finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  async _start() {
    const cfg = this.getSettings();
    const useMock = cfg.mock === true || process.env.LED_MOCK === '1';
    const python = this.resolvePython(true);
    if (!python) {
      throw new Error('No se encontró Python. Instálalo o indica la ruta en Ajustes.');
    }
    this.diagnostics.python = python.executable;
    this.diagnostics.bleak = this.hasBleak(python);
    this.diagnostics.mock = useMock;
    if (!this.diagnostics.bleak && !useMock) {
      warn('bleak no está instalado: pip install bleak');
    }

    const args = ['-u', BRIDGE_SCRIPT, '--data-dir', DATA_DIR];
    if (useMock) args.push('--mock');
    if (cfg.debug) args.push('--debug');

    log('starting bridge:', python.executable, args.join(' '));
    const proc = spawn(python.cmd, [...python.args, ...args], {
      cwd: PLUGIN_ROOT,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
        PYTHONUNBUFFERED: '1'
      }
    });
    this.proc = proc;

    const readyPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('El puente BLE no respondió a tiempo')), READY_TIMEOUT_MS);
      const onReady = (payload) => {
        clearTimeout(timer);
        this.off('ready', onReady);
        resolve(payload);
      };
      this.once('ready', onReady);
      proc.once('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`No se pudo ejecutar Python: ${err.message}`));
      });
    });

    readline.createInterface({ input: proc.stdout }).on('line', (line) => this._handleLine(line));
    readline.createInterface({ input: proc.stderr }).on('line', (line) => {
      this.diagnostics.stderr.push(line);
      if (this.diagnostics.stderr.length > 40) this.diagnostics.stderr.shift();
      if (this.getSettings().debug) warn('bridge:', line);
    });

    proc.on('exit', (code, signal) => {
      // A restart supersedes the old process; ignore its exit event.
      if (this.proc !== proc) return;
      const wasReady = this.ready;
      this.ready = false;
      this.proc = null;
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error('El puente BLE se cerró'));
      }
      this.pending.clear();
      this.emit('down', { code, signal });
      if (!this.stopping) warn(`bridge exited (code ${code}${signal ? `, ${signal}` : ''})${wasReady ? '' : ' during startup'}`);
    });

    const readyPayload = await readyPromise;
    this.diagnostics.version = readyPayload.version;
    this.diagnostics.bleak = readyPayload.bleak;
    this.diagnostics.mock = readyPayload.mock;
    this.ready = true;
    log(`bridge ready v${readyPayload.version} (mock=${readyPayload.mock}, bleak=${readyPayload.bleak})`);

    await this.setConfig(cfg);
    if (cfg.address && !cfg.mock) {
      // Warm the BLE link so the first key press feels instant.
      this.request('connect', {}, 25000).catch((err) => log('warm-up connect:', err.message));
    }
    return readyPayload;
  }

  stop() {
    this.stopping = true;
    if (this.proc) {
      try {
        this.write({ id: this.nextId++, cmd: 'shutdown', params: {} });
      } catch (err) { /* ignore */ }
      const proc = this.proc;
      setTimeout(() => {
        try { proc.kill(); } catch (err) { /* ignore */ }
      }, 500);
    }
    this.ready = false;
  }

  async restart() {
    this.stopping = true;
    if (this.proc) {
      try { this.proc.kill(); } catch (err) { /* ignore */ }
      this.proc = null;
    }
    this.ready = false;
    this.stopping = false;
    return this.ensureStarted();
  }

  // ── protocol ────────────────────────────────────────────────────

  _handleLine(line) {
    const text = String(line || '').trim();
    if (!text) return;
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (err) {
      warn('bridge non-json output:', text.slice(0, 200));
      return;
    }

    if (payload.event === 'ready') {
      this.emit('ready', payload);
      return;
    }
    if (payload.event === 'state') {
      this.lastState = payload.state || {};
      this.emit('state', this.lastState);
      return;
    }
    if (payload.id != null && this.pending.has(payload.id)) {
      const entry = this.pending.get(payload.id);
      this.pending.delete(payload.id);
      clearTimeout(entry.timer);
      if (payload.state) this.lastState = payload.state;
      if (payload.ok === false) entry.reject(new Error(payload.error || 'Error del puente BLE'));
      else entry.resolve(payload);
      return;
    }
    log('bridge event:', payload);
  }

  write(payload) {
    if (!this.proc || !this.proc.stdin.writable) throw new Error('El puente BLE no está en ejecución');
    this.proc.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  async request(cmd, params = {}, timeout = DEFAULT_TIMEOUT_MS) {
    await this.ensureStarted();
    const id = this.nextId++;
    const payload = { id, cmd, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Tiempo de espera agotado en "${cmd}"`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.write(payload);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  async setConfig(cfg) {
    return this.request('setConfig', {
      address: cfg.address,
      keepaliveSec: cfg.keepaliveSec,
      connectTimeout: cfg.connectTimeout,
      autoconnect: false
    }, 10000);
  }

  status() {
    return {
      ready: this.ready,
      ...this.diagnostics,
      state: this.lastState
    };
  }

  // ── convenience wrappers ────────────────────────────────────────

  color(hex, opts = {}) {
    return this.request('color', { hex, ...opts }, 30000);
  }

  power(on) {
    return this.request('power', { on });
  }

  toggle() {
    return this.request('toggle', {});
  }

  brightness(level) {
    return this.request('brightness', { level });
  }

  white(level) {
    return this.request('white', { level });
  }

  effect(name, speed = 50) {
    return this.request('effect', { name, speed });
  }

  scan(timeoutSec = 8) {
    return this.request('scan', { timeout: timeoutSec }, (timeoutSec + 10) * 1000);
  }

  connect(address) {
    return this.request('connect', address ? { address } : {}, 30000);
  }

  identify() {
    return this.request('identify', {}, 30000);
  }

  raw(hex) {
    return this.request('raw', { hex }, 30000);
  }
}

export default BleBridge;
