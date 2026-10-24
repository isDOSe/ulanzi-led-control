/**
 * Settings/status key: press to reconnect, long press is not used.
 * All real configuration happens in the Property Inspector (MAC scan,
 * python path, palette, keepalive).
 */

import { BaseAction } from './base.js';

export class SettingsAction extends BaseAction {
  constructor(context, app) {
    super(context, app);
    this.busy = false;
    this.timer = null;
  }

  defaults() {
    return { label: 'LED' };
  }

  normalize(param) {
    const merged = { ...this.defaults(), ...param };
    return { label: String(merged.label ?? 'LED').slice(0, 12) || 'LED' };
  }

  render() {
    const status = this.bridge.status();
    this.setIcon(this.app.render.settingsKey({
      connected: this.app.state.connected,
      starting: this.busy || status.ready === false,
      address: this.settings.address,
      protocol: this.app.state.protocol || '',
      label: this.params.label,
      error: Boolean(status.lastError) && !this.app.state.connected,
      lang: this.app.lang
    }));
  }

  async run() {
    if (this.busy) return;
    this.busy = true;
    this.render();
    try {
      const result = await this.bridge.connect(this.settings.address);
      this.app.handleSuccess(result);
      this.ud.toast(`LED: ${this.app.state.connected ? 'conectado' : 'sin conexión'}`);
    } catch (error) {
      this.app.handleError(error, this.context, 'conexión');
    } finally {
      this.busy = false;
      this.render();
    }
  }

  onKeyDown() {
    this.timer = setTimeout(() => {
      this.timer = null;
      this.bridge.restart()
        .then(() => this.ud.toast('Puente BLE reiniciado'))
        .catch((error) => this.app.handleError(error, this.context, 'reinicio'))
        .finally(() => this.render());
    }, this.app.config.longPressMs);
  }

  onKeyUp() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  destroy() {
    if (this.timer) clearTimeout(this.timer);
  }
}

export default SettingsAction;
