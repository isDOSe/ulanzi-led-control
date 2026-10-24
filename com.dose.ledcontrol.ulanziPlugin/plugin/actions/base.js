/**
 * Shared behaviour for the four actions. Each instance owns one deck key
 * (context). Rendering is always derived from params + global bridge state.
 */

export class BaseAction {
  constructor(context, app) {
    this.context = context;
    this.app = app;
    this.raw = {};
    this.params = this.defaults();
  }

  get ud() {
    return this.app.ud;
  }

  get bridge() {
    return this.app.bridge;
  }

  get settings() {
    return this.app.settings;
  }

  defaults() {
    return { label: '' };
  }

  /** Merge incoming host settings and repaint. */
  setParams(param) {
    this.raw = { ...(param || {}) };
    this.params = this.normalize(this.raw);
    try {
      this.render();
    } catch (error) {
      this.app.log('render error', { type: this.type, key: this.key, error: error.message });
    }
    if (!this.loggedParams) {
      this.loggedParams = true;
      this.app.log('params applied', {
        type: this.type,
        key: this.key,
        params: this.params,
        context: this.context
      });
    }
  }

  normalize(param) {
    return { ...this.defaults(), ...param };
  }

  /** Default labels follow the Ulanzi UI language. */
  defaultLabel(english, spanish) {
    return String(this.app?.lang || 'en').toLowerCase().startsWith('es') ? spanish : english;
  }

  /** Runs when the action is added to a key. */
  onAdd(param) {
    this.setParams(param);
  }

  async run() {}

  onKeyDown() {}

  onKeyUp() {}

  setActive() {
    try {
      this.render();
    } catch (error) {
      this.app.log('render error', { type: this.type, key: this.key, error: error.message });
    }
  }

  destroy() {}

  /** Send a generated SVG to the deck as a base64 data URI. */
  setIcon(svg) {
    if (!this.context) return;
    this.ud.setBaseDataIcon(this.context, this.app.render.dataUri(svg));
  }

  async guarded(label, fn) {
    this.app.log('command', { type: this.type, key: this.key, label });
    try {
      const result = await fn();
      this.app.log('command ok', { type: this.type, key: this.key, label });
      this.app.handleSuccess(result);
      return result;
    } catch (error) {
      this.app.log('command failed', { type: this.type, key: this.key, label, error: error.message });
      this.app.handleError(error, this.context, label);
      this.render();
      return null;
    }
  }
}
