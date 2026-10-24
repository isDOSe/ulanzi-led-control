/**
 * Brightness key: preset, step up/down or cycle 25/50/75/100.
 * The key face shows the last known level as a ring.
 */

import { BaseAction } from './base.js';

const clamp = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

export class BrightnessAction extends BaseAction {
  defaults() {
    return { label: this.defaultLabel('Brightness', 'Brillo'), mode: 'preset', level: 60, step: 10 };
  }

  normalize(param) {
    const merged = { ...this.defaults(), ...param };
    return {
      label: String(merged.label ?? this.defaults().label).slice(0, 18) || this.defaults().label,
      mode: ['preset', 'up', 'down', 'cycle'].includes(merged.mode) ? merged.mode : 'preset',
      level: clamp(merged.level),
      step: clamp(merged.step || 10)
    };
  }

  render() {
    const level = this.app.state.brightness ?? this.settings.lastBrightness ?? 50;
    this.setIcon(this.app.render.brightnessKey({
      label: this.params.label,
      level,
      mode: this.params.mode,
      connected: this.app.state.connected,
      lang: this.app.lang
    }));
  }

  nextLevel() {
    const current = clamp(this.app.state.brightness ?? this.settings.lastBrightness ?? 50);
    switch (this.params.mode) {
      case 'up':
        return clamp(current + this.params.step);
      case 'down':
        return clamp(current - this.params.step);
      case 'cycle': {
        const steps = [25, 50, 75, 100];
        return steps.find((step) => step > current) ?? 25;
      }
      default:
        return this.params.level;
    }
  }

  async run() {
    const level = this.nextLevel();
    await this.guarded(`brillo ${level}`, () => this.bridge.brightness(level));
    this.render();
  }
}

export default BrightnessAction;
