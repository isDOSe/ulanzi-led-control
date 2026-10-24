/**
 * Color key.
 *
 * Short press  -> apply the configured color (optionally with a brightness).
 * Long press   -> cycle to the next color in the global palette and persist it
 *                 on this key, so the deck can be re-themed without opening
 *                 the Property Inspector.
 */

import { BaseAction } from './base.js';
import { normalizeHex } from '../settings.js';

export class ColorAction extends BaseAction {
  constructor(context, app) {
    super(context, app);
    this.longTimer = null;
    this.cycled = false;
    this.suppressRunUntil = 0;
  }

  defaults() {
    return {
      color: '#FF3B30',
      label: '',
      showHex: true,
      brightnessOverride: null,
      powerOn: true
    };
  }

  normalize(param) {
    const merged = { ...this.defaults(), ...param };
    return {
      color: normalizeHex(merged.color, '#FF3B30'),
      label: String(merged.label ?? '').slice(0, 24),
      showHex: merged.showHex !== false,
      brightnessOverride: merged.brightnessOverride === null || merged.brightnessOverride === ''
        ? null
        : Math.max(0, Math.min(100, Number(merged.brightnessOverride) || 0)),
      powerOn: merged.powerOn !== false
    };
  }

  render() {
    const svg = this.app.render.colorKey({
      color: this.params.color,
      label: !this.params.showHex && !this.params.label ? this.params.color.replace('#', '') : this.params.label,
      showHex: this.params.showHex,
      active: this.app.isActiveColor(this.params.color),
      connected: this.app.state.connected,
      powerOff: this.app.state.power === false
    });
    this.setIcon(svg);
  }

  async run() {
    if (Date.now() < this.suppressRunUntil) return;
    const { color, brightnessOverride, powerOn } = this.params;
    if (!powerOn && this.app.state.power === false) {
      this.ud.toast(this.app.lang.startsWith('es')
        ? 'La luz está apagada: activa "Encender si está apagada" en esta tecla'
        : 'The light is off: enable "Turn on if off" on this key');
    }
    await this.guarded(`color ${color}`, () =>
      this.bridge.color(color, {
        brightness: brightnessOverride === null ? undefined : brightnessOverride,
        powerOn
      })
    );
  }

  onKeyDown() {
    this.clearTimer();
    this.cycled = false;
    this.longTimer = setTimeout(() => {
      this.longTimer = null;
      this.cycled = true;
      this.cyclePalette();
    }, this.app.config.longPressMs);
  }

  onKeyUp() {
    this.clearTimer();
    if (this.cycled) {
      // `run` may fire after keyup on some firmwares; ignore that duplicate.
      this.suppressRunUntil = Date.now() + 400;
      this.cycled = false;
    }
  }

  clearTimer() {
    if (this.longTimer) {
      clearTimeout(this.longTimer);
      this.longTimer = null;
    }
  }

  cyclePalette() {
    const palette = this.app.settings.palette;
    if (!palette.length) return;
    const current = this.params.color.toUpperCase();
    const index = palette.findIndex((entry) => entry.toUpperCase() === current);
    const next = palette[(index + 1) % palette.length];
    this.params = { ...this.params, color: next };
    this.raw = { ...this.raw, color: next };
    this.ud.setSettings(this.params, this.context);
    this.render();
    this.run();
  }

  destroy() {
    this.clearTimer();
  }
}

export default ColorAction;
