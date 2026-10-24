/**
 * Power key: toggles the lamp on/off.
 */

import { BaseAction } from './base.js';

export class PowerAction extends BaseAction {
  constructor(context, app) {
    super(context, app);
    this.busy = false;
  }

  defaults() {
    return { label: this.defaultLabel('Power', 'Encendido') };
  }

  normalize(param) {
    const merged = { ...this.defaults(), ...param };
    return { label: String(merged.label ?? this.defaults().label).slice(0, 18) || this.defaults().label };
  }

  render() {
    this.setIcon(this.app.render.powerKey({
      label: this.params.label,
      on: this.app.state.power === true,
      connected: this.app.state.connected,
      busy: this.busy
    }));
  }

  async run() {
    if (this.busy) return;
    this.busy = true;
    this.render();
    const target = this.app.state.power !== true;
    try {
      await this.guarded(target ? 'encender' : 'apagar', () => this.bridge.power(target));
    } finally {
      this.busy = false;
      this.render();
    }
  }
}

export default PowerAction;
