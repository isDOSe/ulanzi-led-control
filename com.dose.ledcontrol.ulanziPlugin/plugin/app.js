/**
 * DOSe LED Control — main service (Node.js).
 *
 * Owns the deck actions, the BLE bridge lifecycle, global settings and the
 * Property Inspector message bus. Rendering lives in render.js, protocol work
 * in backend/ble_bridge.py.
 *
 * Ulanzi identifies an action instance with the message `uuid` (the action
 * UUID) plus `key`/`actionid`. Older SDK examples only look at `actionid`, but
 * Ulanzi 3.4.x sends the action UUID in `uuid` for add/run — so we resolve the
 * type from every candidate field and keep a map by key as a safety net.
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

import UlanziApi from './sdk/index.js';
import settings, {
  DATA_DIR,
  DEFAULT_SETTINGS,
  normalizeHex,
  normalizeMac
} from './settings.js';
import BleBridge from './bridge.js';
import * as render from './render.js';
import ColorAction from './actions/color.js';
import PowerAction from './actions/power.js';
import BrightnessAction from './actions/brightness.js';
import SettingsAction from './actions/settings.js';

const PLUGIN_UUID = 'com.dose.ledcontrol.deck';
const ACTION_IDS = {
  color: `${PLUGIN_UUID}.color`,
  power: `${PLUGIN_UUID}.power`,
  brightness: `${PLUGIN_UUID}.brightness`,
  settings: `${PLUGIN_UUID}.settings`
};
const LOG_FILE = path.join(DATA_DIR, 'plugin.log');
const PARAM_STORE_FILE = path.join(DATA_DIR, 'action-params.json');

function rotateLog(file, maxBytes = 1_000_000) {
  try {
    if (!fs.existsSync(file) || fs.statSync(file).size < maxBytes) return;
    const backup = `${file}.1`;
    if (fs.existsSync(backup)) fs.unlinkSync(backup);
    fs.renameSync(file, backup);
  } catch (error) { /* logging must never break the plugin */ }
}

class LedPlugin {
  constructor() {
    this.ud = new UlanziApi();
    this.bridge = new BleBridge(() => settings.get());
    this.actions = new Map();      // context -> instance
    this.actionsById = new Map();  // actionid (stable per key instance) -> instance
    this.actionsByKey = new Map(); // key -> instance (fallback / current position)
    this.render = render;
    this.settings = settings;
    this.config = { longPressMs: 650 };
    this.state = {
      connected: false,
      power: settings.get().lastPower,
      color: settings.get().lastColor,
      brightness: settings.get().lastBrightness,
      protocol: ''
    };
    this.persistTimer = null;
    this.refreshTimer = null;
    this.paramSaveTimer = null;
    this.paramStore = this.loadParamStore();
    this.startError = null;
    rotateLog(LOG_FILE);
  }

  get lang() {
    return this.ud.language || 'en';
  }

  // ── logging & param backup ─────────────────────────────────────

  log(...args) {
    const text = args.map((value) => {
      if (typeof value === 'string') return value;
      try { return JSON.stringify(value); } catch (error) { return String(value); }
    }).join(' ');
    try {
      fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${text}\n`, 'utf8');
    } catch (error) { /* ignore */ }
    console.log('[LED]', text);
  }

  loadParamStore() {
    try {
      const raw = JSON.parse(fs.readFileSync(PARAM_STORE_FILE, 'utf8')) || {};
      // Only keep entries keyed by ActionID (a UUID). Older builds also stored
      // params by key position, which made moved keys inherit the previous
      // occupant's color.
      const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
      const clean = {};
      for (const [storeKey, value] of Object.entries(raw)) {
        const suffix = storeKey.includes(':') ? storeKey.slice(storeKey.indexOf(':') + 1) : '';
        if (!isUuid(suffix)) continue;
        if (!value || !Object.keys(value).length) continue;
        clean[storeKey] = value;
      }
      if (Object.keys(clean).length !== Object.keys(raw).length) {
        this.paramStore = clean;
        this.saveParamStore();
      }
      return clean;
    } catch (error) {
      return {};
    }
  }

  saveParamStore() {
    if (this.paramSaveTimer) clearTimeout(this.paramSaveTimer);
    this.paramSaveTimer = setTimeout(() => {
      this.paramSaveTimer = null;
      try {
        const tmp = `${PARAM_STORE_FILE}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(this.paramStore, null, 2), 'utf8');
        fs.renameSync(tmp, PARAM_STORE_FILE);
      } catch (error) {
        this.log('param store save failed', error.message);
      }
    }, 250);
  }

  rememberParams(instance, params) {
    if (!instance || !params) return;
    if (!Object.keys(params).length) return;
    // ActionID is the only stable identity: it survives drag & drop and
    // plugin restarts. Never store by key position.
    if (!instance.instanceId) return;
    this.paramStore[`${instance.type}:${instance.instanceId}`] = params;
    this.saveParamStore();
  }

  storedParams(instance) {
    if (!instance || !instance.instanceId) return null;
    const candidate = this.paramStore[`${instance.type}:${instance.instanceId}`];
    return candidate && Object.keys(candidate).length ? candidate : null;
  }

  // ── lifecycle ──────────────────────────────────────────────────

  start() {
    this.ud.connect(PLUGIN_UUID);

    this.ud.onConnected(() => {
      this.log('connected', { language: this.ud.language, uuid: this.ud.uuid });
      this.refreshAll();
      this.warmBridge();
    });

    this.ud.onError((error) => this.log('api error', String(error)));
    this.ud.onAdd((message) => this.handleAdd(message));
    this.ud.onRun((message) => this.handleRun(message));
    this.ud.onKeyDown((message) => this.handleKey(message, 'onKeyDown'));
    this.ud.onKeyUp((message) => this.handleKey(message, 'onKeyUp'));
    this.ud.onSetActive((message) => {
      const instance = this.getAction(message);
      if (instance) instance.setActive(message.active);
      // Dragging/reordering keys redraws them with the manifest icon; repaint
      // every instance so moved keys recover their generated artwork.
      this.refreshAll();
    });
    this.ud.onParamFromApp((message) => this.handleParams(message, 'paramfromapp'));
    this.ud.onParamFromPlugin((message) => this.handleParams(message, 'paramfromplugin'));
    this.ud.onDidReceiveSettings((message) => this.handleParams(message, 'didReceiveSettings', true));
    this.ud.onClear((message) => this.handleClear(message));
    this.ud.onSendToPlugin((message) => this.handleInspector(message));

    this.bridge.on('state', (state) => {
      this.applyBridgeState(state);
      this.refreshAll();
    });
    this.bridge.on('down', () => {
      this.state.connected = false;
      this.refreshAll();
    });
  }

  async warmBridge() {
    try {
      await this.bridge.ensureStarted();
      this.startError = null;
      this.applyBridgeState(this.bridge.lastState);
      this.log('bridge ready', this.bridge.status().version, this.bridge.status().mock ? 'mock' : 'real');
    } catch (error) {
      this.startError = error.message;
      this.log('bridge unavailable', error.message);
    }
    this.refreshAll();
  }

  // ── action resolution ─────────────────────────────────────────

  describeMessage(message) {
    let decoded = {};
    if (message?.context) {
      try { decoded = this.ud.decodeContext(message.context); } catch (error) { /* ignore */ }
    }
    return {
      cmd: message?.cmd,
      uuid: message?.uuid || null,
      key: message?.key || decoded.key || null,
      actionid: message?.actionid || decoded.actionid || null,
      context: message?.context || null
    };
  }

  actionType(message) {
    const candidates = [];
    const add = (value) => {
      if (typeof value === 'string' && value && !candidates.includes(value)) candidates.push(value);
    };
    add(message?.uuid);
    add(message?.actionUuid);
    add(message?.action_uuid);
    add(message?.actionid);
    add(message?.actionId);
    if (message?.context) {
      try {
        const decoded = this.ud.decodeContext(message.context);
        add(decoded.uuid);
        add(decoded.actionid);
      } catch (error) { /* ignore */ }
    }
    for (const candidate of candidates) {
      for (const [type, id] of Object.entries(ACTION_IDS)) {
        if (candidate === id) return type;
      }
    }
    // Some firmwares only send the short action name as the last segment.
    for (const candidate of candidates) {
      const tail = candidate.split('.').pop();
      if (Object.prototype.hasOwnProperty.call(ACTION_IDS, tail)) return tail;
    }
    return null;
  }

  messageParts(message) {
    let decoded = {};
    if (message?.context) {
      try { decoded = this.ud.decodeContext(message.context); } catch (error) { /* ignore */ }
    }
    return {
      key: message?.key || decoded.key || null,
      instanceId: message?.actionid || decoded.actionid || null,
      uuid: message?.uuid || decoded.uuid || null,
      context: message?.context || null
    };
  }

  detachInstance(instance) {
    if (!instance) return;
    if (instance.key && this.actionsByKey.get(instance.key) === instance) {
      this.actionsByKey.delete(instance.key);
    }
    if (instance.context && this.actions.get(instance.context) === instance) {
      this.actions.delete(instance.context);
    }
    // Keep it in actionsById: a drag & drop will re-attach it to its new key
    // with its params intact.
    instance.context = null;
    instance.key = null;
  }

  attachInstance(instance, parts, context) {
    const oldKey = instance.key;
    const oldInstanceId = instance.instanceId;

    if (parts.instanceId) instance.instanceId = parts.instanceId;
    if (parts.key) instance.key = parts.key;

    // If another instance still owns the destination key, park it (do not
    // destroy it): Ulanzi may swap two keys and send the adds out of order.
    if (instance.key) {
      const occupant = this.actionsByKey.get(instance.key);
      if (occupant && occupant !== instance) this.detachInstance(occupant);
    }

    // Re-index the ActionID (stable across moves).
    if (instance.instanceId) this.actionsById.set(instance.instanceId, instance);

    // Key positions change on drag & drop: drop the old mapping and point the
    // new position at the same instance (keeping its params/state).
    if (oldKey && oldKey !== instance.key && this.actionsByKey.get(oldKey) === instance) {
      this.actionsByKey.delete(oldKey);
    }
    if (instance.key) this.actionsByKey.set(instance.key, instance);
    if (oldKey && instance.key && oldKey !== instance.key) {
      this.log('moved', { type: instance.type, actionid: instance.instanceId, from: oldKey, to: instance.key });
    }

    // Rebuild the context if the key changed, otherwise prefer the host's.
    let nextContext = context || instance.context;
    if (instance.key && instance.instanceId) {
      if (!nextContext || this.messageParts({ context: nextContext }).key !== instance.key) {
        nextContext = `${instance.actionUuid}___${instance.key}___${instance.instanceId}`;
      }
    }
    if (nextContext) {
      const occupant = this.actions.get(nextContext);
      if (occupant && occupant !== instance) this.detachInstance(occupant);
    }
    if (instance.context && instance.context !== nextContext) {
      if (this.actions.get(instance.context) === instance) this.actions.delete(instance.context);
    }
    instance.context = nextContext;
    if (nextContext) this.actions.set(nextContext, instance);

    if (oldInstanceId && oldInstanceId !== instance.instanceId
        && this.actionsById.get(oldInstanceId) === instance) {
      this.actionsById.delete(oldInstanceId);
    }
  }

  scheduleRender(instance, delays = [250, 900, 1800]) {
    if (!instance) return;
    for (const delay of delays) {
      setTimeout(() => {
        try {
          instance.render();
        } catch (error) {
          this.log('delayed render failed', { key: instance.key, type: instance.type, error: error.message });
        }
      }, delay);
    }
  }

  createAction(message, typeOverride) {
    const type = typeOverride || this.actionType(message);
    const parts = this.messageParts(message);
    if (!type) {
      this.log('unknown action', this.describeMessage(message));
      return null;
    }

    const existingById = parts.instanceId ? this.actionsById.get(parts.instanceId) : null;
    const existingByKey = parts.key ? this.actionsByKey.get(parts.key) : null;
    const keyMatches = existingByKey
      && (!parts.instanceId || existingByKey.instanceId === parts.instanceId)
      && existingByKey.type === type;
    const existing = existingById || (keyMatches ? existingByKey : null);

    if (existing) {
      if (existing.type === type) {
        this.attachInstance(existing, parts, message.context);
        return existing;
      }
      // Same slot but a different action type: replace it.
      existing.destroy?.();
      this.actionsById.delete(existing.instanceId);
      this.actionsByKey.delete(existing.key);
      this.actions.delete(existing.context);
    } else if (existingByKey && existingByKey !== existing) {
      // A different action is being dropped on this position: park the old one
      // (it may be moving elsewhere) instead of letting it inherit the new ID.
      this.log('slot replaced', {
        key: parts.key,
        oldActionid: existingByKey.instanceId,
        newActionid: parts.instanceId,
        oldType: existingByKey.type,
        newType: type
      });
      this.detachInstance(existingByKey);
    }

    const factories = {
      color: ColorAction,
      power: PowerAction,
      brightness: BrightnessAction,
      settings: SettingsAction
    };
    const ActionClass = factories[type];
    const context = message.context
      || (parts.key && parts.instanceId ? `${ACTION_IDS[type]}___${parts.key}___${parts.instanceId}` : null);
    if (!context) {
      this.log('cannot build context', this.describeMessage(message));
      return null;
    }
    const instance = new ActionClass(context, this);
    instance.type = type;
    instance.actionUuid = ACTION_IDS[type];
    this.attachInstance(instance, parts, context);
    this.log('instance created', { type, key: parts.key, actionid: parts.instanceId, context: instance.context });
    this.scheduleRender(instance);
    return instance;
  }

  getAction(message) {
    if (message?.context && this.actions.has(message.context)) {
      const instance = this.actions.get(message.context);
      this.attachInstance(instance, this.messageParts(message), message.context);
      return instance;
    }
    const parts = this.messageParts(message);
    if (parts.instanceId && this.actionsById.has(parts.instanceId)) {
      const instance = this.actionsById.get(parts.instanceId);
      this.attachInstance(instance, parts, message.context);
      return instance;
    }
    if (parts.key && this.actionsByKey.has(parts.key)) {
      const occupant = this.actionsByKey.get(parts.key);
      const type = this.actionType(message);
      const sameInstance = !parts.instanceId || occupant.instanceId === parts.instanceId;
      const sameType = !type || occupant.type === type;
      if (sameInstance && sameType) {
        this.attachInstance(occupant, parts, message.context);
        return occupant;
      }
      // Different action/type at this position: createAction will park the old
      // instance and create the new one with its own params.
    }
    return this.createAction(message);
  }

  // ── event handlers ────────────────────────────────────────────

  handleAdd(message) {
    this.log('add', this.describeMessage(message), { hasParam: Boolean(message.param && Object.keys(message.param).length) });
    const instance = this.getAction(message);
    if (!instance) return;
    const param = message.param || message.settings || {};
    const stored = this.storedParams(instance);
    if (param && Object.keys(param).length) {
      this.rememberParams(instance, param);
      instance.onAdd(param);
    } else if (stored) {
      instance.onAdd(stored);
    } else if (!Object.keys(instance.raw || {}).length) {
      instance.onAdd({});
      this.ud.getSettings(message.context);
    } else {
      // Move/re-add: keep the in-memory params instead of resetting to defaults.
      this.log('add kept current params', { key: instance.key, type: instance.type });
      instance.render();
    }
    this.scheduleRender(instance);
  }

  handleParams(message, source = 'host', fromHost = false) {
    this.log(source, this.describeMessage(message), {
      param: message.param || message.settings || null
    });
    const instance = this.getAction(message);
    if (!instance) return;
    const params = message.param || message.settings || {};
    if (Object.keys(params).length === 0) {
      // Ulanzi 3.4 sends paramfromapp/didReceiveSettings with `{}` when the key
      // has no saved settings. Applying that would reset a configured key.
      this.log('empty params ignored', { source, key: instance.key, type: instance.type });
      return;
    }
    this.rememberParams(instance, params);
    instance.paramsResolved = true;
    instance.setParams(params);
    if (fromHost && instance.pendingRun) {
      instance.pendingRun = false;
      instance.run(message);
    }
  }

  handleRun(message) {
    this.log('run', this.describeMessage(message));
    const instance = this.getAction(message);
    if (!instance) return;
    if (!Object.keys(instance.raw || {}).length) {
      const stored = this.storedParams(instance);
      if (stored) {
        instance.setParams(stored);
      } else {
        this.pendingSettings = this.pendingSettings || new Set();
        if (!this.pendingSettings.has(instance.key)) {
          this.pendingSettings.add(instance.key);
          this.ud.getSettings(message.context);
        }
      }
    }
    instance.run(message);
  }

  handleKey(message, handler) {
    const instance = this.getAction(message);
    if (instance && typeof instance[handler] === 'function') instance[handler](message);
  }

  handleClear(message) {
    if (!message.param) return;
    for (const item of message.param) {
      const parts = this.messageParts(item);
      const instance = this.actions.get(item.context)
        || (parts.instanceId && this.actionsById.get(parts.instanceId))
        || (parts.key && this.actionsByKey.get(parts.key));
      if (instance) {
        this.log('clear', { key: instance.key, type: instance.type, actionid: instance.instanceId });
        instance.destroy();
        this.actions.delete(instance.context);
        if (instance.key) this.actionsByKey.delete(instance.key);
        if (instance.instanceId) this.actionsById.delete(instance.instanceId);
      }
    }
  }

  // ── state ──────────────────────────────────────────────────────

  applyBridgeState(state) {
    if (!state) return;
    if (typeof state.connected === 'boolean') this.state.connected = state.connected;
    if (state.power !== undefined && state.power !== null) this.state.power = state.power;
    if (state.hex) this.state.color = state.hex;
    if (state.brightness !== undefined && state.brightness !== null) this.state.brightness = state.brightness;
    if (state.protocol) this.state.protocol = state.protocol;
  }

  isActiveColor(hex) {
    const current = this.state.color || this.settings.get().lastColor;
    return this.state.power !== false && normalizeHex(current, '') === normalizeHex(hex, '');
  }

  handleSuccess(result) {
    if (result?.state) this.applyBridgeState(result.state);
    this.persistState();
    this.refreshAll();
  }

  handleError(error, context, label = '') {
    const message = error?.message || String(error);
    this.log('command error', { label, message });
    this.ud.toast(`LED ${label ? `(${label}) ` : ''}${message}`.slice(0, 110));
    if (context) this.ud.showAlert(context);
    this.state.connected = false;
    this.settings.merge({ lastError: message });
  }

  persistState() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.settings.merge({
        lastColor: this.state.color || this.settings.get().lastColor,
        lastBrightness: this.state.brightness ?? this.settings.get().lastBrightness,
        lastPower: this.state.power ?? this.settings.get().lastPower
      });
    }, 350);
  }

  refreshAll() {
    if (this.refreshTimer) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      for (const instance of this.actions.values()) {
        try {
          instance.render();
        } catch (error) {
          this.log('render failed', { context: instance.context, error: error.message });
        }
      }
    }, 45);
  }

  // ── property inspector bus ─────────────────────────────────────

  async handleInspector(message) {
    const payload = message.payload || {};
    this.log('inspector', payload.type, this.describeMessage(message));
    const reply = (data) => {
      if (payload.reqId == null) return;
      try {
        this.ud.sendToPropertyInspector({ reqId: payload.reqId, ...data }, message.context);
      } catch (error) {
        this.log('PI reply failed', error.message);
      }
    };

    try {
      switch (payload.type) {
        case 'ledParams':
        case 'params': {
          // Direct PI -> main channel: do not depend on the host forwarding
          // paramfromplugin. This is what keeps key icons/labels in sync.
          const instance = this.getAction(message);
          if (!instance) throw new Error('No se encontró la tecla para guardar los parámetros');
          const params = payload.params || {};
          if (!Object.keys(params).length) throw new Error('Parámetros vacíos');
          this.log('ledParams', { key: instance.key, type: instance.type, params });
          this.rememberParams(instance, params);
          // Persist in Ulanzi Studio. `paramfromplugin` is a pass-through only:
          // it reaches the main service but does NOT update the profile unless
          // the main (or the PI) calls setSettings.
          this.ud.setSettings(params, instance.context);
          instance.setParams(params);
          reply({ type: 'paramsSaved' });
          break;
        }
        case 'getActionParams': {
          const instance = this.getAction(message);
          reply({
            type: 'actionParams',
            actionType: instance ? instance.type : null,
            params: instance ? (instance.raw || {}) : {}
          });
          break;
        }
        case 'getSettings': {
          reply({
            type: 'settings',
            settings: this.settings.get(),
            status: this.bridge.status(),
            startError: this.startError,
            dataDir: DATA_DIR
          });
          break;
        }
        case 'saveSettings': {
          const old = { ...this.settings.get() };
          const patch = payload.settings || {};
          const address = patch.address === undefined ? old.address : normalizeMac(patch.address);
          if (address === null) throw new Error('MAC inválida (formato AA:BB:CC:DD:EE:FF)');
          const merged = this.settings.merge({ ...patch, address: address ?? old.address });
          const needsRestart = (patch.pythonPath !== undefined && patch.pythonPath !== old.pythonPath)
            || (patch.mock !== undefined && Boolean(patch.mock) !== Boolean(old.mock))
            || (patch.debug !== undefined && Boolean(patch.debug) !== Boolean(old.debug));
          await this.bridge.setConfig(merged);
          if (needsRestart) await this.bridge.restart();
          this.ud.toast('Ajustes LED guardados');
          reply({ type: 'saved', settings: merged, status: this.bridge.status(), restarted: needsRestart });
          break;
        }
        case 'resetSettings': {
          const merged = this.settings.merge({ ...DEFAULT_SETTINGS });
          await this.bridge.setConfig(merged);
          reply({ type: 'saved', settings: merged, status: this.bridge.status() });
          this.ud.toast('Ajustes LED restaurados');
          break;
        }
        case 'scan': {
          reply({ type: 'scanning' });
          const result = await this.bridge.scan(Number(payload.timeout) || 8);
          reply({ type: 'devices', devices: result.devices || [] });
          break;
        }
        case 'connect': {
          const result = await this.bridge.connect(payload.address || this.settings.get().address);
          this.applyBridgeState(result.state);
          this.refreshAll();
          reply({ type: 'status', status: this.bridge.status(), state: result.state });
          break;
        }
        case 'identify': {
          const result = await this.bridge.identify();
          reply({ type: 'identify', ...result });
          break;
        }
        case 'testColor': {
          const hex = normalizeHex(payload.hex || this.settings.get().lastColor);
          const brightness = payload.brightness === null || payload.brightness === undefined
            ? undefined
            : Math.max(0, Math.min(100, Number(payload.brightness)));
          const powerOn = payload.powerOn !== false;
          const result = await this.bridge.color(hex, { powerOn, brightness });
          this.applyBridgeState(result.state);
          this.persistState();
          this.refreshAll();
          reply({ type: 'colorApplied', hex, state: result.state });
          break;
        }
        case 'testPower': {
          const result = await this.bridge.power(Boolean(payload.on));
          this.applyBridgeState(result.state);
          this.persistState();
          this.refreshAll();
          reply({ type: 'status', status: this.bridge.status(), state: result.state });
          break;
        }
        case 'testBrightness': {
          const result = await this.bridge.brightness(Number(payload.level) || 50);
          this.applyBridgeState(result.state);
          this.persistState();
          this.refreshAll();
          reply({ type: 'status', status: this.bridge.status(), state: result.state });
          break;
        }
        case 'openDataFolder': {
          this.openDataFolder();
          reply({ type: 'ok' });
          break;
        }
        case 'getStatus': {
          reply({ type: 'status', status: this.bridge.status(), state: this.state });
          break;
        }
        default:
          throw new Error(`Tipo de mensaje desconocido: ${payload.type}`);
      }
    } catch (error) {
      this.log('inspector error', { type: payload.type, error: error.message });
      reply({ type: 'error', error: error.message });
    }
  }

  openDataFolder() {
    try {
      if (process.platform === 'win32') spawn('explorer.exe', [DATA_DIR], { detached: true, windowsHide: true }).unref();
      else if (process.platform === 'darwin') spawn('open', [DATA_DIR], { detached: true }).unref();
      else spawn('xdg-open', [DATA_DIR], { detached: true }).unref();
    } catch (error) {
      this.log('cannot open data folder', error.message);
    }
  }
}

const plugin = new LedPlugin();
plugin.start();

process.on('exit', () => plugin.bridge.stop());
process.on('SIGINT', () => {
  plugin.bridge.stop();
  process.exit(0);
});
process.on('uncaughtException', (error) => {
  plugin.log('uncaught exception', error.stack || error.message);
});
process.on('unhandledRejection', (error) => {
  plugin.log('unhandled rejection', error?.stack || String(error));
});
