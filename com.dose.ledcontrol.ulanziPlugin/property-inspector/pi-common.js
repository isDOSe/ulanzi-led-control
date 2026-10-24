/**
 * Shared Property Inspector utilities.
 *
 * Classic script on purpose: the Ulanzi HTML SDK exposes global $UD/Utils.
 */

const PI = (() => {
  const pending = new Map();
  let sequence = 0;

  $UD.onSendToPropertyInspector((message) => {
    const payload = message?.payload || {};
    const entry = pending.get(payload.reqId);
    if (!entry) return;
    if (payload.type === 'error') {
      finish(payload.reqId);
      entry.reject(new Error(payload.error || 'Error'));
      return;
    }
    if (payload.type === 'scanning') {
      if (entry.onProgress) entry.onProgress(payload);
      return;
    }
    finish(payload.reqId);
    entry.resolve(payload);
  });

  function finish(reqId) {
    const entry = pending.get(reqId);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(reqId);
  }

  function request(payload, options = {}) {
    const timeout = options.timeout || 20000;
    const reqId = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(reqId);
        reject(new Error('La aplicación no respondió (tiempo agotado)'));
      }, timeout);
      pending.set(reqId, { resolve, reject, timer, onProgress: options.onProgress });
      const socket = $UD.websocket;
      if (!socket || socket.readyState !== 1) {
        clearTimeout(timer);
        pending.delete(reqId);
        reject(new Error('Ulanzi Studio no está conectado. Abre el panel desde la app.'));
        return;
      }
      try {
        $UD.sendToPlugin({ ...payload, reqId });
      } catch (error) {
        clearTimeout(timer);
        pending.delete(reqId);
        reject(error);
      }
    });
  }

  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function $$(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function on(selector, event, handler) {
    const element = typeof selector === 'string' ? $(selector) : selector;
    if (element) element.addEventListener(event, handler);
    return element;
  }

  function debounce(fn, wait = 250) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  function t(key, fallback) {
    const value = $UD.t(key);
    return value === key ? (fallback || key) : value;
  }

  function setToggle(button, value) {
    if (!button) return;
    button.setAttribute('aria-pressed', value ? 'true' : 'false');
  }

  function getToggle(button) {
    return button?.getAttribute('aria-pressed') === 'true';
  }

  function rangeFill(input) {
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const value = Number(input.value || 0);
    const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
    input.style.setProperty('--fill', `${percent}%`);
  }

  function status(element, kind, text, options = {}) {
    if (!element) return;
    element.className = `pi-status ${kind || ''}`;
    element.textContent = '';
    const dot = document.createElement('span');
    dot.className = 'dot';
    if (options.spinner) {
      dot.className = 'pi-spinner';
    }
    const label = document.createElement('span');
    label.className = 'grow';
    if (options.mono) label.classList.add('mono');
    label.textContent = text;
    element.append(dot, label);
  }

  function normalizeHex(value, fallback = '#FFFFFF') {
    if (typeof value !== 'string') return fallback;
    let raw = value.trim().replace('#', '');
    if (!/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw)) return fallback;
    if (raw.length === 3) raw = raw.split('').map((c) => c + c).join('');
    return `#${raw.toUpperCase()}`;
  }

  function luminance(hex) {
    const raw = normalizeHex(hex).slice(1);
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  function contrast(hex) {
    return luminance(hex) > 0.58 ? '#111116' : '#FFFFFF';
  }

  function swatchButton(hex, { editable = false, selected = false } = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pi-chip';
    button.style.background = hex;
    button.dataset.color = hex;
    button.title = hex;
    if (selected) button.classList.add('selected');
    if (editable) button.classList.add('owned');
    return button;
  }

  /** Send action params to the host (saved by Ulanzi Studio + forwarded to main). */
  function sendParams(params) {
    $UD.sendParamFromPlugin(params);
    // Direct channel: guarantees the main service updates the key icon even
    // if this Ulanzi version does not forward `paramfromplugin`. The reqId is
    // required for the host to relay the sendToPlugin message.
    try {
      $UD.sendToPlugin({
        type: 'ledParams',
        params,
        reqId: `led-${Date.now()}-${Math.floor(Math.random() * 100000)}`
      });
    } catch (error) {
      console.warn('[LED] direct params failed:', error);
    }
  }

  function clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, Math.round(number)));
  }

  return {
    ud: $UD,
    request,
    connect: (uuid) => $UD.connect(uuid),
    onAdd: (fn) => $UD.onAdd(fn),
    $,
    $$,
    on,
    debounce,
    t,
    setToggle,
    getToggle,
    rangeFill,
    status,
    normalizeHex,
    luminance,
    contrast,
    swatchButton,
    sendParams,
    clamp
  };
})();
