/* Property Inspector for the Color action. */

(() => {
  PI.connect('com.dose.ledcontrol.deck.color');

  const DEFAULT = {
    color: '#FF3B30',
    label: '',
    showHex: true,
    brightnessOverride: null,
    powerOn: true
  };

  const DEFAULT_PALETTE = [
    '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#32ADE6',
    '#007AFF', '#5856D6', '#AF52DE', '#FF2D55', '#FFFFFF', '#FFD9A0'
  ];

  const state = { ...DEFAULT, palette: [...DEFAULT_PALETTE] };

  const hero = PI.$('#hero');
  const heroHex = PI.$('#heroHex');
  const heroLabel = PI.$('#heroLabel');
  const picker = PI.$('#colorPicker');
  const hexInput = PI.$('#colorHex');
  const labelInput = PI.$('#label');
  const showHexToggle = PI.$('#showHex');
  const useBrightnessToggle = PI.$('#useBrightness');
  const brightnessRow = PI.$('#brightnessRow');
  const brightness = PI.$('#brightness');
  const brightnessValue = PI.$('#brightnessValue');
  const powerOnToggle = PI.$('#powerOn');
  const paletteBox = PI.$('#palette');
  const statusBox = PI.$('#status');
  const root = PI.$('#root');

  function paint({ push = true } = {}) {
    const color = PI.normalizeHex(state.color);
    hero.style.background = color;
    heroHex.textContent = color;
    heroLabel.textContent = state.label;
    heroLabel.style.display = state.label ? '' : 'none';
    root.style.setProperty('--pi-accent', color);
    picker.value = color;
    if (document.activeElement !== hexInput) hexInput.value = color;
    PI.setToggle(showHexToggle, state.showHex);
    PI.setToggle(useBrightnessToggle, state.brightnessOverride !== null);
    const level = state.brightnessOverride === null ? 60 : state.brightnessOverride;
    brightness.value = level;
    brightnessValue.textContent = `${level}%`;
    brightnessRow.classList.toggle('pi-hidden', state.brightnessOverride === null);
    PI.rangeFill(brightness);
    PI.setToggle(powerOnToggle, state.powerOn);
    renderPalette();
    if (push) pushParams();
  }

  function renderPalette() {
    paletteBox.textContent = '';
    const current = PI.normalizeHex(state.color);
    for (const color of state.palette) {
      const button = PI.swatchButton(color, { selected: color.toUpperCase() === current });
      button.addEventListener('click', () => {
        state.color = color;
        paint();
      });
      paletteBox.append(button);
    }
  }

  const pushParams = PI.debounce(() => {
    PI.sendParams({
      color: PI.normalizeHex(state.color),
      label: state.label,
      showHex: state.showHex,
      brightnessOverride: state.brightnessOverride,
      powerOn: state.powerOn
    });
    PI.status(statusBox, 'ok', PI.t('Saved', 'Saved'));
  }, 260);

  function setColor(value) {
    const color = PI.normalizeHex(value, state.color);
    state.color = color;
    paint();
  }

  picker.addEventListener('input', () => setColor(picker.value));

  hexInput.addEventListener('input', () => {
    const raw = hexInput.value.trim();
    if (/^#?([0-9a-fA-F]{6})$/.test(raw)) setColor(raw);
  });
  hexInput.addEventListener('blur', () => {
    hexInput.value = PI.normalizeHex(state.color);
  });

  labelInput.addEventListener('input', () => {
    state.label = labelInput.value.slice(0, 24);
    paint();
  });

  showHexToggle.addEventListener('click', () => {
    state.showHex = !state.showHex;
    paint();
  });

  useBrightnessToggle.addEventListener('click', () => {
    state.brightnessOverride = state.brightnessOverride === null
      ? PI.clamp(brightness.value, 0, 100)
      : null;
    paint();
  });

  brightness.addEventListener('input', () => {
    const level = PI.clamp(brightness.value, 0, 100);
    brightnessValue.textContent = `${level}%`;
    PI.rangeFill(brightness);
    if (state.brightnessOverride !== null) {
      state.brightnessOverride = level;
      pushParams();
    }
  });

  powerOnToggle.addEventListener('click', () => {
    state.powerOn = !state.powerOn;
    paint();
  });

  PI.$('#test').addEventListener('click', async () => {
    const button = PI.$('#test');
    button.disabled = true;
    PI.status(statusBox, 'warn', PI.t('Sending…', 'Sending…'), { spinner: true });
    try {
      await PI.request({
        type: 'testColor',
        hex: PI.normalizeHex(state.color),
        brightness: state.brightnessOverride,
        powerOn: state.powerOn
      }, { timeout: 35000 });
      PI.status(statusBox, 'ok', `${PI.t('Color sent', 'Color sent')} ${PI.normalizeHex(state.color)}`);
    } catch (error) {
      PI.status(statusBox, 'err', error.message);
    } finally {
      button.disabled = false;
    }
  });

  PI.onAdd((message) => {
    applyParams(message.param || {});
  });

  // The host does not always replay saved params on add. Ask the main service,
  // which keeps a mirror in action-params.json.
  PI.request({ type: 'getActionParams' })
    .then((reply) => {
      if (reply?.params && Object.keys(reply.params).length) applyParams(reply.params);
    })
    .catch(() => { /* defaults are fine */ });

  $UD.onParamFromApp((message) => {
    if (message?.param && Object.keys(message.param).length) applyParams(message.param);
  });

  function applyParams(param) {
    Object.assign(state, DEFAULT, {
      color: PI.normalizeHex(param.color || DEFAULT.color),
      label: String(param.label ?? ''),
      showHex: param.showHex !== false,
      brightnessOverride: param.brightnessOverride === null || param.brightnessOverride === undefined
        ? null
        : PI.clamp(param.brightnessOverride, 0, 100),
      powerOn: param.powerOn !== false
    });
    labelInput.value = state.label;
    paint({ push: false });
  }

  PI.request({ type: 'getSettings' })
    .then((reply) => {
      const palette = reply?.settings?.palette;
      if (Array.isArray(palette) && palette.length) {
        state.palette = palette.map((color) => PI.normalizeHex(color));
        paint({ push: false });
      }
    })
    .catch(() => { /* settings are optional here */ });

  paint({ push: false });
  PI.status(statusBox, '', PI.t('Changes are saved automatically', 'Changes are saved automatically'));
})();
