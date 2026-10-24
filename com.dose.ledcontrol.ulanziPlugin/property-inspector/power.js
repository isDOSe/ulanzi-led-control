/* Property Inspector for the Power action. */

(() => {
  PI.connect('com.dose.ledcontrol.deck.power');

  const DEFAULT = { label: 'Power' };
  const state = { ...DEFAULT };

  const labelInput = PI.$('#label');
  const glyph = PI.$('#glyph');
  const stateText = PI.$('#stateText');
  const statusBox = PI.$('#status');

  function paint({ push = true } = {}) {
    if (push) pushParams();
  }

  const pushParams = PI.debounce(() => {
    PI.sendParams({ label: state.label });
    PI.status(statusBox, 'ok', PI.t('Saved', 'Saved'));
  }, 240);

  labelInput.addEventListener('input', () => {
    state.label = labelInput.value.slice(0, 18) || DEFAULT.label;
    paint();
  });

  async function test(on) {
    const buttons = [PI.$('#testOn'), PI.$('#testOff')];
    buttons.forEach((button) => { button.disabled = true; });
    PI.status(statusBox, 'warn', PI.t('Sending…', 'Sending…'), { spinner: true });
    try {
      const reply = await PI.request({ type: 'testPower', on }, { timeout: 30000 });
      const power = reply?.state?.power;
      glyph.classList.toggle('on', power === true);
      stateText.textContent = power === true
        ? PI.t('The light is ON', 'The light is ON')
        : PI.t('The light is OFF', 'The light is OFF');
      PI.status(statusBox, 'ok', PI.t('Command sent', 'Command sent'));
    } catch (error) {
      PI.status(statusBox, 'err', error.message);
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
    }
  }

  PI.$('#testOn').addEventListener('click', () => test(true));
  PI.$('#testOff').addEventListener('click', () => test(false));

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
    state.label = String(param.label ?? DEFAULT.label);
    labelInput.value = state.label;
  }

  PI.request({ type: 'getStatus' })
    .then((reply) => {
      const power = reply?.state?.power ?? reply?.status?.state?.power;
      glyph.classList.toggle('on', power === true);
      if (power === true) stateText.textContent = PI.t('The light is ON', 'The light is ON');
      else if (power === false) stateText.textContent = PI.t('The light is OFF', 'The light is OFF');
    })
    .catch(() => { /* status is optional */ });
})();
