/* Property Inspector for the Settings & Status action. */

(() => {
  PI.connect('com.dose.ledcontrol.deck.settings');

  const DEFAULT_PALETTE = [
    '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#32ADE6',
    '#007AFF', '#5856D6', '#AF52DE', '#FF2D55', '#FFFFFF', '#FFD9A0'
  ];

  const fields = {
    address: PI.$('#address'),
    pythonPath: PI.$('#pythonPath'),
    keepalive: PI.$('#keepalive'),
    keepaliveValue: PI.$('#keepaliveValue'),
    mock: PI.$('#mock'),
    debug: PI.$('#debug'),
    palette: PI.$('#palette'),
    devices: PI.$('#devices'),
    connStatus: PI.$('#connStatus'),
    connDetail: PI.$('#connDetail'),
    status: PI.$('#status'),
    dataDir: PI.$('#dataDir'),
    diagnostics: PI.$('#diagnostics')
  };

  let palette = [...DEFAULT_PALETTE];
  let selectedDevice = null;
  let scanning = false;

  function setPalette(next) {
    palette = next.map((color) => PI.normalizeHex(color)).slice(0, 24);
    if (palette.length < 2) palette = [...DEFAULT_PALETTE];
    renderPalette();
  }

  function renderPalette() {
    fields.palette.textContent = '';
    palette.forEach((color, index) => {
      const button = PI.swatchButton(color, { editable: true });
      const remove = document.createElement('span');
      remove.className = 'remove';
      remove.textContent = '×';
      remove.title = PI.t('Remove', 'Remove');
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        if (palette.length <= 2) {
          PI.status(fields.status, 'warn', PI.t('Keep at least two colors', 'Keep at least two colors'));
          return;
        }
        palette.splice(index, 1);
        renderPalette();
      });
      button.append(remove);
      fields.palette.append(button);
    });

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'pi-add-chip';
    add.textContent = '+';
    add.title = PI.t('Add color', 'Add color');
    add.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'color';
      input.value = '#FF3B30';
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.append(input);
      input.addEventListener('input', () => {
        if (palette.length >= 24) return;
        palette.push(PI.normalizeHex(input.value));
        renderPalette();
      });
      input.addEventListener('change', () => input.remove());
      input.click();
    });
    fields.palette.append(add);
  }

  function renderStatus(reply) {
    const status = reply?.status || {};
    const state = reply?.state || status.state || {};
    const connected = state.connected === true;
    const protocol = state.protocol || '';
    const address = state.address || fields.address.value || '—';

    PI.status(
      fields.connStatus,
      connected ? 'ok' : 'err',
      connected
        ? `${PI.t('Connected', 'Connected')}${protocol ? ` · ${protocol}` : ''}`
        : PI.t('Not connected', 'Not connected')
    );

    const details = [];
    if (address) details.push(address);
    if (state.lastError) details.push(state.lastError);
    if (status.python) details.push(`Python ${status.version || ''} ${status.python}`);
    if (status.mock) details.push(PI.t('mock mode', 'mock mode'));
    if (status.bleak === false) details.push(PI.t('bleak not installed', 'bleak not installed'));
    fields.connDetail.textContent = details.filter(Boolean).join(' · ');
  }

  function populate(settings, reply) {
    fields.address.value = settings.address || '';
    fields.pythonPath.value = settings.pythonPath || '';
    fields.keepalive.value = settings.keepaliveSec ?? 30;
    fields.keepaliveValue.textContent = String(settings.keepaliveSec ?? 30);
    PI.rangeFill(fields.keepalive);
    PI.setToggle(fields.mock, settings.mock === true);
    PI.setToggle(fields.debug, settings.debug === true);
    setPalette(Array.isArray(settings.palette) && settings.palette.length ? settings.palette : DEFAULT_PALETTE);
    if (reply?.dataDir) fields.dataDir.textContent = reply.dataDir;
    renderStatus(reply);
  }

  async function load() {
    PI.status(fields.status, 'warn', PI.t('Loading…', 'Loading…'), { spinner: true });
    try {
      const reply = await PI.request({ type: 'getSettings' });
      populate(reply.settings || {}, reply);
      if (reply.startError) {
        PI.status(fields.status, 'err', reply.startError);
      } else {
        PI.status(fields.status, 'ok', PI.t('Ready', 'Ready'));
      }
    } catch (error) {
      PI.status(fields.status, 'err', error.message);
    }
  }

  PI.$('#scan').addEventListener('click', async () => {
    if (scanning) return;
    scanning = true;
    const button = PI.$('#scan');
    button.disabled = true;
    button.textContent = PI.t('Scanning…', 'Scanning…');
    fields.devices.classList.remove('pi-hidden');
    fields.devices.textContent = '';
    PI.status(fields.status, 'warn', PI.t('Scanning for BLE devices…', 'Scanning for BLE devices…'), { spinner: true });
    try {
      const reply = await PI.request({ type: 'scan', timeout: 10 }, { timeout: 30000 });
      renderDevices(reply.devices || []);
      PI.status(fields.status, 'ok', `${reply.devices?.length || 0} ${PI.t('devices found', 'devices found')}`);
    } catch (error) {
      PI.status(fields.status, 'err', error.message);
    } finally {
      scanning = false;
      button.disabled = false;
      button.textContent = PI.t('Scan', 'Scan');
    }
  });

  function renderDevices(devices) {
    fields.devices.textContent = '';
    const visible = devices.filter((device) => device.address).slice(0, 20);
    if (!visible.length) {
      const empty = document.createElement('div');
      empty.className = 'pi-hint';
      empty.textContent = PI.t('No devices found. Make sure the lamp is powered on.', 'No devices found. Make sure the lamp is powered on.');
      fields.devices.append(empty);
      return;
    }

    for (const device of visible) {
      const row = document.createElement('div');
      row.className = 'pi-device';
      if (device.address.toUpperCase() === fields.address.value.toUpperCase()) row.classList.add('current');

      const meta = document.createElement('div');
      meta.className = 'meta';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = device.name || PI.t('Unknown device', 'Unknown device');
      const addr = document.createElement('div');
      addr.className = 'addr';
      addr.textContent = device.address;
      meta.append(name, addr);

      const rssi = document.createElement('span');
      rssi.className = 'rssi';
      rssi.textContent = device.rssi != null ? `${device.rssi} dBm` : '';

      row.append(meta, rssi);
      if (device.likely) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = 'LED';
        row.append(tag);
      }

      row.addEventListener('click', () => {
        selectedDevice = device.address;
        fields.address.value = device.address;
        renderDevices(visible);
        PI.status(fields.status, 'ok', `${PI.t('Selected', 'Selected')} ${device.address}`);
      });
      fields.devices.append(row);
    }
  }

  fields.keepalive.addEventListener('input', () => {
    fields.keepaliveValue.textContent = String(fields.keepalive.value);
    PI.rangeFill(fields.keepalive);
  });

  PI.$('#save').addEventListener('click', async () => {
    const button = PI.$('#save');
    button.disabled = true;
    const settings = {
      address: fields.address.value.trim().toUpperCase().replace(/-/g, ':'),
      pythonPath: fields.pythonPath.value.trim(),
      keepaliveSec: PI.clamp(fields.keepalive.value, 0, 120),
      palette,
      mock: PI.getToggle(fields.mock),
      debug: PI.getToggle(fields.debug)
    };
    if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(settings.address)) {
      PI.status(fields.status, 'err', PI.t('Invalid MAC address', 'Invalid MAC address'));
      button.disabled = false;
      return;
    }
    PI.status(fields.status, 'warn', PI.t('Saving…', 'Saving…'), { spinner: true });
    try {
      const reply = await PI.request({ type: 'saveSettings', settings }, { timeout: 35000 });
      populate(reply.settings || settings, reply);
      PI.status(fields.status, 'ok', PI.t('Settings saved', 'Settings saved'));
    } catch (error) {
      PI.status(fields.status, 'err', error.message);
    } finally {
      button.disabled = false;
    }
  });

  PI.$('#reset').addEventListener('click', async () => {
    if (!window.confirm(PI.t('Restore default settings?', 'Restore default settings?'))) return;
    PI.status(fields.status, 'warn', PI.t('Resetting…', 'Resetting…'), { spinner: true });
    try {
      const reply = await PI.request({ type: 'resetSettings' });
      populate(reply.settings || {}, reply);
      PI.status(fields.status, 'ok', PI.t('Defaults restored', 'Defaults restored'));
    } catch (error) {
      PI.status(fields.status, 'err', error.message);
    }
  });

  PI.$('#refresh').addEventListener('click', async () => {
    try {
      const reply = await PI.request({ type: 'getStatus' });
      renderStatus(reply);
      PI.status(fields.status, 'ok', PI.t('Status updated', 'Status updated'));
    } catch (error) {
      PI.status(fields.status, 'err', error.message);
    }
  });

  PI.$('#reconnect').addEventListener('click', async () => {
    const button = PI.$('#reconnect');
    button.disabled = true;
    PI.status(fields.status, 'warn', PI.t('Connecting…', 'Connecting…'), { spinner: true });
    try {
      const reply = await PI.request({ type: 'connect', address: fields.address.value.trim().toUpperCase() }, { timeout: 35000 });
      renderStatus(reply);
      PI.status(fields.status, 'ok', PI.t('Connected', 'Connected'));
    } catch (error) {
      PI.status(fields.status, 'err', error.message);
    } finally {
      button.disabled = false;
    }
  });

  PI.$('#identify').addEventListener('click', async () => {
    const pre = fields.diagnostics;
    pre.classList.remove('pi-hidden');
    pre.textContent = PI.t('Reading services…', 'Reading services…');
    try {
      const reply = await PI.request({ type: 'identify' }, { timeout: 35000 });
      const lines = [];
      if (reply.protocol) lines.push(`protocol: ${reply.protocol}`);
      if (reply.characteristic) lines.push(`characteristic: ${reply.characteristic}`);
      for (const service of reply.services || []) {
        lines.push(`service ${service.uuid}`);
        for (const char of service.characteristics || []) {
          lines.push(`  ${char.uuid} [${(char.properties || []).join(', ')}]`);
        }
      }
      pre.textContent = lines.join('\n') || PI.t('No services reported', 'No services reported');
    } catch (error) {
      pre.textContent = error.message;
    }
  });

  PI.$('#openData').addEventListener('click', () => {
    PI.request({ type: 'openDataFolder' }).catch(() => { /* best effort */ });
  });

  PI.onAdd((message) => {
    if (message.param?.address) fields.address.value = message.param.address;
  });

  setPalette(DEFAULT_PALETTE);
  load();
})();
