/* Property Inspector for the Brightness action. */

(() => {
  PI.connect('com.dose.ledcontrol.deck.brightness');

  const DEFAULT = { label: 'Brightness', mode: 'preset', level: 60, step: 10 };
  const state = { ...DEFAULT };

  const preview = PI.$('#preview');
  const previewValue = PI.$('#previewValue');
  const modeCaption = PI.$('#modeCaption');
  const levelField = PI.$('#levelField');
  const stepField = PI.$('#stepField');
  const level = PI.$('#level');
  const levelValue = PI.$('#levelValue');
  const step = PI.$('#step');
  const stepValue = PI.$('#stepValue');
  const labelInput = PI.$('#label');
  const statusBox = PI.$('#status');

  const cap = (key, fallback) => PI.t(key, fallback);

  function updateCaption() {
    const captions = {
      preset: cap('Applies a fixed level', 'Applies a fixed level'),
      up: cap('Raises by the step', 'Raises by the step'),
      down: cap('Lowers by the step', 'Lowers by the step'),
      cycle: cap('Cycles 25 → 50 → 75 → 100', 'Cycles 25 → 50 → 75 → 100')
    };
    modeCaption.textContent = captions[state.mode] || captions.preset;
    levelField.classList.toggle('pi-hidden', state.mode !== 'preset');
    stepField.classList.toggle('pi-hidden', !['up', 'down'].includes(state.mode));
  }

  function paint({ push = true } = {}) {
    preview.style.setProperty('--level', state.level);
    previewValue.textContent = `${state.level}%`;
    level.value = state.level;
    levelValue.textContent = `${state.level}%`;
    step.value = state.step;
    stepValue.textContent = String(state.step);
    PI.rangeFill(level);
    PI.rangeFill(step);
    PI.$$('#mode button').forEach((button) => {
      button.classList.toggle('active', button.dataset.mode === state.mode);
    });
    updateCaption();
    if (push) pushParams();
  }

  const pushParams = PI.debounce(() => {
    PI.sendParams({ label: state.label, mode: state.mode, level: state.level, step: state.step });
    PI.status(statusBox, 'ok', PI.t('Saved', 'Saved'));
  }, 260);

  PI.$$('#mode button').forEach((button) => {
    button.addEventListener('click', () => {
      state.mode = button.dataset.mode;
      paint();
    });
  });

  level.addEventListener('input', () => {
    state.level = PI.clamp(level.value, 0, 100);
    paint();
  });

  step.addEventListener('input', () => {
    state.step = PI.clamp(step.value, 1, 50);
    paint();
  });

  labelInput.addEventListener('input', () => {
    state.label = labelInput.value.slice(0, 18);
    if (ready) pushParams();
  });

  PI.$('#test').addEventListener('click', async () => {
    const button = PI.$('#test');
    button.disabled = true;
    PI.status(statusBox, 'warn', PI.t('Sending…', 'Sending…'), { spinner: true });
    try {
      await PI.request({ type: 'testBrightness', level: state.level }, { timeout: 30000 });
      PI.status(statusBox, 'ok', `${PI.t('Brightness sent', 'Brightness sent')} ${state.level}%`);
    } catch (error) {
      PI.status(statusBox, 'err', error.message);
    } finally {
      button.disabled = false;
    }
  });

  PI.onAdd((message) => {
    applyParams(message.param || {});
  });

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
      label: String(param.label ?? DEFAULT.label),
      mode: ['preset', 'up', 'down', 'cycle'].includes(param.mode) ? param.mode : DEFAULT.mode,
      level: PI.clamp(param.level ?? DEFAULT.level, 0, 100),
      step: PI.clamp(param.step ?? DEFAULT.step, 1, 50)
    });
    labelInput.value = state.label;
    paint({ push: false });
  }

  paint({ push: false });
})();
