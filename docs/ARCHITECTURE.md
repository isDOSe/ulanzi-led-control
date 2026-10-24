# Arquitectura — LED Control BLE

## 1. Componentes

| Componente | Archivo | Responsabilidad |
|---|---|---|
| Servicio principal | `plugin/app.js` | Ciclo de vida del plugin, registro de acciones, estado global, bus con el Property Inspector, persistencia |
| Puente (cliente) | `plugin/bridge.js` | Localiza Python, lanza `ble_bridge.py`, habla NDJSON, timeouts, reinicio |
| Puente (servidor) | `backend/ble_bridge.py` | Conexión BLE persistente, serialización de comandos, detección de protocolo, keep-alive, logs |
| Protocolo | `backend/led_protocol.py` | Constructores de tramas `7E…EF`, tabla de UUIDs, efectos, paleta por defecto |
| Render | `plugin/render.js` | Genera SVG de las teclas y los convierte a `data:image/svg+xml;base64` |
| Ajustes | `plugin/settings.js` | `data/settings.json` con defaults, saneado y escritura atómica |
| Acciones | `plugin/actions/*.js` | Comportamiento de cada tipo de tecla (params, run, keydown/up, render) |
| PIs | `property-inspector/*` | Configuración visual por acción + ajustes globales |
| SDK | `plugin/sdk/`, `libs/` | UlanziDeck SDK sin modificar (Apache-2.0) |

## 2. Ciclo de vida

1. Ulanzi Studio ejecuta `node plugin/app.js <address> <port> <language>`.
2. `app.js` crea `UlanziApi`, conecta al WebSocket 3906 y registra eventos.
3. Al recibir `connected`, arranca el puente en segundo plano (`ensureStarted`) y
   lanza un `connect` de calentamiento (sin bloquear la UI).
4. El host envía `add` por cada tecla existente; se crean las instancias
   (`context → Action`) y se pintan.
5. Cada pulsación llega como `run`; las de mantener pulsado como
   `keydown`/`keyup`.
6. Al cerrar Ulanzi Studio (o al matar el proceso), `exit`/`SIGINT` envían
   `shutdown` al puente y lo terminan.

## 3. Comunicación Node ↔ Python

NDJSON: una línea JSON por mensaje. **stdout solo protocolo**; logs a
`data/bridge.log` (y stderr en modo debug).
### Petición

```json
{ "id": 12, "cmd": "color", "params": { "hex": "#FF8800", "powerOn": true } }
```

### Respuesta

```json
{ "id": 12, "ok": true, "state": { "connected": true, "power": true, "hex": "#FF8800" } }
```

Error:

```json
{ "id": 12, "ok": false, "error": "no se pudo conectar a C0:…: no encontrado", "state": { ... } }
```

### Eventos no solicitados

```json
{ "event": "ready", "version": "0.1.0", "pid": 1234, "mock": false, "bleak": true }
{ "event": "state", "state": { ... } }
```

### Comandos

| cmd | params | resultado | notas |
|---|---|---|---|
| `ping` | — | `pong`, `version`, `mock`, `bleak` | handshake |
| `status` | — | `state`, `bleak`, `version` | refresca `connected` real |
| `setConfig` | `address`, `keepaliveSec`, `connectTimeout`, `autoconnect` | `state` | cambia MAC ⇒ desconecta |
| `connect` | `address?` | `state` | fuerza conexión + detección |
| `disconnect` | — | `state` | |
| `power` | `on` | `state` | |
| `toggle` | — | `state` | usa `state.power` |
| `color` | `hex` o `r,g,b`, `powerOn?`, `brightness?` | `state` | enciende antes si hace falta |
| `brightness` | `level` 0–100 | `state` | |
| `white` | `level` 0–100 | `state` | modo blanco del protocolo |
| `effect` | `name` o `code`, `speed` | `state` | no usado por la UI v0.1 |
| `scan` | `timeout` | `devices[]` | desconecta mientras escanea |
| `identify` | — | `services[]`, `protocol`, `characteristic` | diagnóstico |
| `raw` | `hex` | `sent`, `state` | consola/diagnóstico |
| `shutdown` | — | `bye` | cierre ordenado |

`state` siempre incluye: `connected`, `address`, `protocol`, `characteristic`,
`power`, `rgb`, `hex`, `brightness`, `white`, `effect`, `lastError`,
`lastWriteAt`.

### Concurrencia

El bucle principal lee stdin y **procesa los comandos en serie**: evita
escrituras GATT solapadas y mantiene el orden de pulsaciones rápidas. Un
`scan` desconecta y bloquea la cola mientras dura (la UI lo advierte).

### Reintentos

- Conexión: `asyncio.wait_for` 15 s; tras fallo hay back-off de 4 s para no
  martillear una lámpara apagada.
- Escritura: ante excepción se descarta la caché de protocolo, se desconecta y
  se reintenta **una vez** desde cero.
- El puente no se auto-reinicia; el cliente lo relanza en la siguiente petición
  y la tecla Settings permite forzarlo con pulsación larga.

## 4. Estado y render

`app.js` mantiene un único estado global:

```js
{ connected, power, color, brightness, protocol }
```

Se actualiza desde:

- `state` del puente (eventos y respuestas),
- `settings.json` al arrancar (`lastColor`, `lastBrightness`, `lastPower`).

`refreshAll()` coalesce repintados cada 45 ms para que una pulsación repinte
todas las teclas sin 13 renders síncronos.

`isActiveColor(hex)` = `power !== false` y el último color conocido coincide.
Ese valor pinta el anillo blanco y el check de la tecla.

### Arte de teclas (256×256)

| Acción | Fondo | Datos | Estados |
|---|---|---|---|
| Color | gradiente del propio color + brillo radial | etiqueta, hex | activo (anillo + check), offline (!), apagado (velo) |
| Power | panel oscuro | glifo de power | ON verde / OFF gris, offline ámbar |
| Brightness | panel oscuro | arco de progreso + % | nivel, subir/bajar, offline |
| Settings | panel oscuro | engranaje, cola de MAC, protocolo | conectado / iniciando / sin conexión / error |

`contrastText()` elige texto claro u oscuro según luminancia para que una tecla
blanca o amarilla siga siendo legible.

## 5. Ajustes

`data/settings.json` (global, no por tecla):
```json
{
  "address": "C0:00:00:23:0E:D8",
  "pythonPath": "",
  "palette": ["#FF3B30", "#FF9500", "…"],
  "keepaliveSec": 30,
  "connectTimeout": 15,
  "powerOnColor": true,
  "lastColor": "#FFB46B",
  "lastBrightness": 80,
  "lastPower": null,
  "mock": false,
  "debug": false
}
```

Escritura atómica (`tmp` + `rename`). `mock`/`debug`/`pythonPath` cambian el
proceso: al guardarlos, el plugin reinicia el puente.

### Parámetros por tecla (los guarda Ulanzi Studio)

| Acción | Params |
|---|---|
| Color | `color`, `label`, `showHex`, `brightnessOverride` (null o 0–100), `powerOn` |
| Power | `label` |
| Brightness | `label`, `mode` (`preset`/`up`/`down`/`cycle`), `level`, `step` |
| Settings | `label` (además lee la MAC global) |

La pulsación larga de Color escribe el nuevo color con
`$UD.setSettings(params, context)`; el host lo persiste y lo reenvía como
`paramfromplugin`.

## 6. Bus con el Property Inspector

El PI envía `$UD.sendToPlugin({type, …, reqId})`; el servicio responde con
`$UD.sendToPropertyInspector({reqId, type, …}, context)`.
`pi-common.js` correlaciona por `reqId` y expone `PI.request()` con timeout y
progreso (`scanning`).

| type | uso |
|---|---|
| `getSettings` | ajustes globales + estado del puente + `dataDir` |
| `saveSettings` | valida MAC, persiste, reconfigura y (si toca) reinicia el puente |
| `resetSettings` | vuelve a defaults |
| `scan` | escaneo BLE (10 s) con lista ordenada |
| `connect` | fuerza conexión |
| `identify` | lista servicios/características |
| `testColor` / `testPower` / `testBrightness` | probar sin guardar |
| `getStatus` | refresco del panel |
| `openDataFolder` | abre `data/` en el explorador |

## 7. Errores y observabilidad

- Todo error de comando: `toast` (110 chars), `showAlert` en la tecla, entrada en
  `bridge.log` y `lastError` en el estado.
- La tecla Settings pinta el error en rojo (si no hay conexión).
- Logs:
  - `data/bridge.log` (rota a 1 MB → `bridge.log.1`),
  - consola de Ulanzi Studio para `[LED] …`.
- `mock` permite reproducir toda la cadena sin Bluetooth; `debug` añade stderr
  del puente al log de Ulanzi.

## 8. Añadir una acción nueva

1. Crea `plugin/actions/miaccion.js` extendiendo `BaseAction`
   (`defaults`, `normalize`, `render`, `run`).
2. Añádela a `ACTION_IDS` y a las factorías de `app.js`.
3. Crea `property-inspector/miaccion.html|js` (puedes reutilizar `pi-common.js`).
4. Declara la acción en `manifest.json` (UUID de 5 segmentos, PI, estado).
5. Añade textos a `en.json`/`es_ES.json`.
6. Si necesita un comando nuevo, añádelo en `ble_bridge.py` (tabla `handlers`).
7. Añade un caso a `tools/preview.mjs` y, si aplica, a `tools/test.mjs`.

## 9. Identidad de mensajes y parámetros (importante)

En Ulanzi 3.4.x cada mensaje del host trae:

```json
{
  "cmd": "add",
  "uuid": "com.dose.ledcontrol.deck.color",
  "key": "4_0",
  "actionid": "fd087416-f308-4740-a3d1-6ec5553f6e41",
  "context": "com.dose.ledcontrol.deck.color___4_0___fd087416-…"
}
```

- `uuid` es el **UUID de la acción** (`…deck.color`), no el del plugin.
- `actionid` es el **ID de instancia de esa tecla** (`fd08…`), no el tipo.
- El tipo se resuelve probando `uuid`, `actionid`, `actionUuid` y los segmentos
  del contexto.
- La **identidad estable es el ActionID**, no la posición: al mover una tecla
  (drag & drop) se reindexa el mismo objeto, se conservan sus parámetros y se
  actualiza su `context`. La posición (`key`) solo se usa como fallback si el
  ActionID coincide o no viene en el mensaje. Si una acción distinta ocupa la
  posición, la anterior se “aparca” (no se destruye) para que pueda reaparecer
  en su nueva tecla sin heredar parámetros ajenos.
- Los parámetros se guardan en `data/action-params.json` **por ActionID**;
  las entradas antiguas por posición se descartan al arrancar.
- Los iconos generados se envían como `data:image/svg+xml;base64,…` mediante
  `setBaseDataIcon` (el SVG en crudo no lo acepta el deck). Tras un `add` se
  repinta a los 250/900/1800 ms porque el host puede sobrescribir el icono con
  el del manifiesto al crear la tecla.

### Parámetros por tecla

El host **no siempre reenvía** `paramfromplugin` al servicio principal y su
`getSettings` puede responder `{}`. Por eso:

1. El PI manda los parámetros por dos vías: `sendParamFromPlugin` (reenvío al
   plugin; en Ulanzi 3.4 **no persiste**) y `sendToPlugin({type:'ledParams'})`
   (canal directo al plugin).
2. El plugin los guarda en `data/action-params.json` y llama a
   `setSettings(params, context)`, que es la API que **sí** actualiza el
   `ActionParam` del perfil. `paramfromplugin` solo hace passthrough.
3. Al arrancar, si `add` no trae `param`, se usan los del store; si el host
   responde `{}` a `getSettings`/`paramfromapp`, se ignora para no borrar los
   guardados.

## 10. Límites conocidos

- Una sola lámpara (un `address` global).
- Sin multiplexación de escaneo y comandos.
- El keep-alive reenvía `power on`; si tu controlador lo interpreta como cambio
  de modo, ponlo a 0.
- El render usa las fuentes por defecto del rasterizador (no se puede elegir
  familia tipográfica, igual que en otros plugins).
