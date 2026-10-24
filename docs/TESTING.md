# Pruebas y depuración — LED Control BLE

## 1. Pirámide de pruebas

| Nivel | Qué cubre | Cómo |
|---|---|---|
| Unitario Python | Tramas exactas, tabla de protocolos, efectos | `npm run test:py` |
| Unitario JS | SVG de teclas, contraste, sombreado, data URI | `npm test` |
| Integración sin hardware | Proceso Python real + NDJSON + comandos | `npm test` (mock) |
| Integración con hardware | BLE real, latencia, gestos, keep-alive | checklist manual |
| UI | Property Inspectors en la app real | checklist manual |

## 2. Pruebas automáticas

```powershell
npm test
```

Salida esperada:

```
Python protocol frames
  ✓ frame builders match the 7E…EF protocol
Rendering
  ✓ key SVG output and helpers
BLE bridge (mock)
  ✓ python bridge starts and handshakes
  ✓ status reports mock + bleak availability
  ✓ color command updates bridge state
  ✓ brightness command
  ✓ power command
  ✓ scan returns devices
  ✓ identify returns services
10 checks passed.
```

El test de integración lanza `ble_bridge.py --mock` de verdad: si falla, el
problema está en Python/NDJSON, no en el deck.

### Solo protocolo

```powershell
npm run test:py
```

### Identidad y drag & drop (sin hardware)

```powershell
npm run test:identity
```

Arranca el plugin real contra un Ulanzi simulado por WebSocket y un puente BLE
mock. Comprueba que al mover una tecla conserva **su** color y que una tecla
nueva sobre una posición ocupada no hereda los parámetros del ocupante anterior.

### Latencia real (con hardware)

```powershell
npm run bench
```

Hace 10 cambios de color y muestra mínimo/media/máximo. **Cambia el color de la
lámpara** y lo restaura al terminar. Con el enlace caliente el objetivo es
< 300 ms; la primera escritura tras arrancar puede tardar 1–4 s.

## 3. Modo mock (sin Bluetooth)

Tres formas, de menos a más global:

1. **Ajustes → Advanced → Mock mode** (se guarda y reinicia el puente).
2. Variable de entorno al desarrollar: `LED_MOCK=1 npm test`.
3. Consola directa:
   ```powershell
   npm run bridge:mock
   ```
   y escribe peticiones NDJSON (una por línea, termina con Ctrl+Z / Ctrl+C).

En mock, `scan` devuelve dos dispositivos de ejemplo y todas las escrituras se
registran en hex en `data/bridge.log`.

## 4. Checklist manual — instalación y ajustes

- [ ] La categoría **LED Control** aparece tras reiniciar la app.
- [ ] Los cuatro iconos se ven nítidos en la lista de acciones.
- [ ] El PI de Color abre sin errores y el selector de color funciona.
- [ ] El PI de Brightness cambia entre modos y oculta los campos correctos.
- [ ] El PI de Power muestra el estado si el puente conoce la luz.
- [ ] El PI de Settings carga el estado (Python, mock, MAC, paleta).
- [ ] **Scan** lista la lámpara con RSSI y etiqueta `LED`.
- [ ] Elegir un dispositivo rellena la MAC.
- [ ] **Save settings** persiste tras cerrar y reabrir el PI.
- [ ] **Reconnect** deja la tecla verde con el protocolo.
- [ ] **Diagnose BLE** lista servicios y características.
- [ ] **Open data folder** abre el explorador en `data/`.
- [ ] La paleta permite añadir y quitar colores (mínimo dos).

## 5. Checklist manual — teclas

- [ ] Color: pulsación corta aplica el color en < 1 s (caliente).
- [ ] Color: el anillo/check se mueve a la tecla pulsada.
- [ ] Color: etiqueta y hex se leen bien en el panel real.
- [ ] Color: con `Show hex` desactivado, la etiqueta ocupa el centro.
- [ ] Color: color blanco/amarillo usa texto oscuro (contraste).
- [ ] Color: pulsación larga cambia al siguiente color de la paleta.
- [ ] Color: ese cambio sobrevive a reiniciar Ulanzi Studio.
- [ ] Color: pulsación larga **no** aplica dos colores distintos (ver §8).
- [ ] Color: con la luz apagada, `Turn on if off` la enciende.
- [ ] Color: `Brightness override` aplica color y brillo.
- [ ] Power: enciende y apaga; el glifo cambia ON/OFF.
- [ ] Power: el estado sobrevive a reiniciar el plugin.
- [ ] Brightness preset: aplica el nivel exacto.
- [ ] Brightness up/down: respeta 0–100 y el paso.
- [ ] Brightness cycle: 25 → 50 → 75 → 100 → 25.
- [ ] Brightness: el arco y el % coinciden con la luz.
- [ ] Settings: pulsar reconecta y muestra toast.
- [ ] Settings: pulsación larga reinicia el puente.

## 6. Checklist manual — errores y resiliencia

- [ ] Apagar la lámpara del todo: la tecla avisa (toast + alerta) y no se queda
      bloqueada.
- [ ] Volver a encenderla y pulsar: reconecta sin reiniciar la app.
- [ ] MAC errónea en Ajustes: error claro, la app sigue funcionando.
- [ ] Cerrar y abrir Ulanzi Studio: no quedan procesos `python.exe` huérfanos
      (mirar en el Administrador de tareas).
- [ ] Cambiar de red/adaptador Bluetooth: Settings → Reconnect recupera.
- [ ] Con la app del móvil conectada a la lámpara, el plugin falla con un
      mensaje comprensible (la lámpara solo admite una conexión).

## 7. Cómo depurar

### Logs

| Log | Ruta |
|---|---|
| Puente | `…\com.dose.ledcontrol.ulanziPlugin\data\bridge.log` |
| Plugin (eventos/presiones) | `…\com.dose.ledcontrol.ulanziPlugin\data\plugin.log` |
| Ulanzi | `%APPDATA%\Ulanzi\UlanziDeck\logs` |
| Consola del plugin | consola de Ulanzi Studio (`[LED] …`) |

Sube el detalle con **Settings → Advanced → Verbose bridge logs** (reinicia el
puente y escribe stderr en el log de la app).

### Flags de Ulanzi Studio

```powershell
"C:\ruta\Ulanzi Studio.exe" --log --webRemoteDebug --nodeRemoteDebug
```

- PIs HTML: `http://localhost:9292`
- Servicio Node: `chrome://inspect` → *inspect* en el plugin.

### Probar el puente a mano

```powershell
@(
  '{"id":1,"cmd":"ping"}',
  '{"id":2,"cmd":"setConfig","params":{"address":"C0:00:00:23:0E:D8"}}',
  '{"id":3,"cmd":"connect"}',
  '{"id":4,"cmd":"identify"}',
  '{"id":5,"cmd":"color","params":{"hex":"#FF8800"}}'
) | python com.dose.ledcontrol.ulanziPlugin\backend\ble_bridge.py --data-dir com.dose.ledcontrol.ulanziPlugin\data --debug
```

### Reset de estado

- Ajustes → **Reset** (MAC + paleta).
- Borrar `data\protocol-cache.json` fuerza redetección.
- Borrar `data\settings.json` restaura defaults completos.
- Borrar `data\bridge.log` no afecta (se recrea).

## 8. Comportamiento de pulsación larga a verificar

El SDK documenta `keydown`/`keyup` y `run`, pero el orden exacto puede variar
según firmware. La implementación tolera los dos casos:

- Si `run` llega **al soltar**: el temporizador de 650 ms dispara el ciclo; al
  soltar, `run` se ignora con `suppressRunUntil`.
- Si `run` llega **al pulsar**: se aplica el color actual y, a los 650 ms, el
  ciclo aplica el siguiente. El resultado final es correcto (un solo cambio
  visible relevante).

Qué comprobar en el D200H:

- [ ] Un toque rápido cambia exactamente una vez.
- [ ] Mantener 1 s cambia una sola vez al siguiente color.
- [ ] Mantener 3 s no recorre toda la paleta (no hay repetición).

Si el dedo «rebota» y a veces cuenta como largo, subir `longPressMs` en
`plugin/app.js` (`this.config`).

## 9. Matriz de hardware

| Dispositivo | Protocolo | Probado |
|---|---|---|
| LEDBLE-00-D80E (`C0:00:00:23:0E:D8`) | `7E…EF`, ffe0/ffe1 | ✅ detección, servicios y escritura verificados 2026-10-21; UI del deck pendiente |
| ELK-BLEDOM | `7E…EF`, fff0/fff3 | ❌ sin unidad |
| Magic Blue | `56…AA` | ❌ sin unidad |

Verificación realizada con el puente real:

```
connect  → LEDBLE / JDY ffe0/ffe1
services → 0000ffe0 / 0000ffe1 [read, notify, write-without-response]
power on → ok (lastWriteAt actualizado)
scan     → LEDBLE-00-D80E, likely=true, RSSI -87 dBm
```

Queda pendiente la comprobación visual en el D200H (pulsación corta/larga, latencia
percibida y keep-alive).

Cuando pruebes una variante nueva, añádela a `backend/led_protocol.py` y a esta
tabla.

## 10. Definición de «terminado»

- `npm test` verde en una máquina sin lámpara.
- Checklist de §4–§6 completo en el D200H real.
- Sin procesos huérfanos tras cerrar la app.
- Latencia media < 300 ms documentada en el README/CHANGELOG.
- `bridge.log` sin excepciones no controladas en un ciclo de uso normal.
