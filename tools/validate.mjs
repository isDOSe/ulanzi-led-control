/**
 * Static validation of the plugin package (no app, no Bluetooth).
 * Run with: npm run validate
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const plugin = path.join(root, 'com.dose.ledcontrol.ulanziPlugin');

const errors = [];
const warnings = [];
const ok = [];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`${path.relative(root, file)}: JSON inválido (${error.message})`);
    return null;
  }
}

function exists(relative, label) {
  const full = path.join(plugin, relative);
  if (!fs.existsSync(full)) {
    errors.push(`${label}: falta ${relative}`);
    return false;
  }
  return true;
}

const manifest = readJson(path.join(plugin, 'manifest.json'));
if (manifest) {
  if (!/^[^.]+(\.[^.]+){3}$/.test(manifest.UUID || '')) {
    errors.push('manifest.UUID debe tener exactamente 4 segmentos');
  }
  if (manifest.Type !== 'JavaScript') errors.push('manifest.Type debe ser "JavaScript"');
  exists(manifest.CodePath, 'CodePath');
  exists(manifest.Icon, 'Icon');
  exists(manifest.CategoryIcon, 'CategoryIcon');
  if (!Array.isArray(manifest.Actions) || manifest.Actions.length === 0) {
    errors.push('manifest.Actions está vacío');
  } else {
    for (const action of manifest.Actions) {
      const prefix = `${manifest.UUID}.`;
      if (!action.UUID?.startsWith(prefix) || action.UUID.split('.').length < 5) {
        errors.push(`Acción ${action.Name}: UUID inválido (${action.UUID})`);
      }
      if (action.PropertyInspectorPath) exists(action.PropertyInspectorPath, `PI de ${action.Name}`);
      exists(action.Icon, `Icono de ${action.Name}`);
      if (!Array.isArray(action.States) || action.States.length === 0) {
        errors.push(`Acción ${action.Name}: sin States`);
      }
    }
  }
  for (const lang of ['en.json', 'es_ES.json']) {
    const file = path.join(plugin, lang);
    const data = readJson(file);
    if (!data) continue;
    if (manifest.Actions && (!Array.isArray(data.Actions) || data.Actions.length !== manifest.Actions.length)) {
      warnings.push(`${lang}: el array Actions debería tener ${manifest.Actions.length} entradas`);
    }
    if (!data.Localization || typeof data.Localization !== 'object') {
      warnings.push(`${lang}: falta el objeto Localization`);
    }
  }
}

for (const file of [
  'backend/ble_bridge.py',
  'backend/led_protocol.py',
  'plugin/app.js',
  'plugin/bridge.js',
  'plugin/render.js',
  'plugin/settings.js',
  'plugin/sdk/index.js',
  'plugin/actions/color.js',
  'plugin/actions/power.js',
  'plugin/actions/brightness.js',
  'plugin/actions/settings.js',
  'libs/js/ulanziApi.js',
  'libs/css/uspi.css',
  'THIRD-PARTY-LICENSES.md',
  'LICENSE'
]) {
  exists(file, 'Archivo requerido');
}

if (!fs.existsSync(path.join(plugin, 'node_modules', 'ws', 'index.js'))) {
  warnings.push('node_modules/ws no está instalado: ejecuta npm run setup antes de desplegar');
} else {
  ok.push('ws instalado');
}

if (!fs.existsSync(path.join(plugin, 'data'))) {
  warnings.push('data/ no existe todavía (se crea al ejecutar el plugin)');
}

if (errors.length) {
  console.error(`\n✗ ${errors.length} error(es):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
if (warnings.length) {
  console.warn(`\n${warnings.length} aviso(s):`);
  for (const warning of warnings) console.warn(`  - ${warning}`);
}
console.log(`\n✓ paquete válido (${manifest?.Actions?.length || 0} acciones)${ok.length ? ` · ${ok.join(', ')}` : ''}\n`);
