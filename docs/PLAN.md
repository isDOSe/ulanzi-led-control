# Plan — LED Control BLE para Ulanzi D200H

> Estado: **v0.1.0 implementada**, pendiente validación física en el D200H.
> Autor: Ernesto Flames (DOSe) · Fecha: 2026-10-21

## 1. Problema y objetivo

Cambiar el color de una tira LED BLE china obliga a abrir la app del móvil,
esperar el escaneo y navegar menús. El D200H tiene 13 teclas LCD: es el sitio
natural para tener una paleta física.

**Objetivo:** un plugin de Ulanzi Studio que permita tener teclas de color
pulsables, configurar cada color una vez y (opcionalmente) cambiarlo desde el
propio deck con una pulsación larga — sin depender de apps externas ni de un
servidor web local.

**No objetivos (v0.1):** controlar varias lámparas a la vez, efectos animados
desde el deck, sincronización con música, versión móvil.

## 2. Restricciones y supuestos

| Restricción | Implicación |
|---|---|
| El runtime de plugins es Node 20 dentro de Ulanzi Studio | `ws` debe ir vendorizado; no hay Web Bluetooth ni BLE nativo |
| BLE en Windows vía WinRT | `bleak` (Python) es la vía fiable; `@abandonware/noble` exige compilar módulos nativos |
| Lámpara china `7E … EF` con UUID variable | Reutilizar la detección de `led-control` y cachear el protocolo por MAC |
| Conexión BLE tarda 1–4 s | Mantener un enlace persistente en un proceso aparte |
| El deck no tiene knobs (D200H) | Brillo por pasos/presets en teclas, no encoder |
| La app no recarga el servicio Node | Script de deploy + instrucción explícita de reinicio |
| La MAC es siempre `C0:00:00:23:0E:D8` | Valor por defecto, editable una vez, sin exigir configuración inicial |

## 3. Decisiones de diseño

| # | Decisión | Alternativas descartadas | Motivo |
|---|---|---|---|
| D1 | Puente **Python + bleak** persistente, hablado por NDJSON sobre stdio | noble nativo; HTTP a `led_web.py`; BLE por WebSocket | Sin compilación nativa, reutiliza el protocolo ya probado, latencia baja, aislamiento: si el BLE se cuelga, se reinicia el puente sin tumbar el plugin |
| D2 | **MAC global** (no por tecla), configurable una vez | MAC por acción; hardcode puro | Una lámpara = una MAC. Evita teclas inconsistentes y permite cambiar de lámpara sin tocar 10 teclas |
| D3 | **Settings propios** en `data/settings.json` | `getGlobalSettings/setGlobalSettings` del host | Persistencia comprobable, editable, independiente de que una acción esté activa; el host queda para settings **por tecla** |
| D4 | Cuatro acciones: Color, Power, Brightness, Settings | Una única acción con modos | Descubribilidad en la lista de acciones y PI específico por tipo |
| D5 | Iconos **SVG generados** (data URI base64) | PNG pre-renderizados; canvas | El color es el dato: no hay que empaquetar 12 PNG; se adapta a cualquier hex y al estado (activo/offline/apagado) |
| D6 | **Pulsación larga = ciclar paleta** | Selector modal; teclas de ajuste de color | Cambiar el color desde el propio deck sin ocupar más teclas. La pulsación corta sigue siendo predecible |
| D7 | Estado de conexión visible en la tecla Settings | Solo toasts | El deck está lejos de la pantalla; el color del punto/tecla informa de un vistazo |
| D8 | Modo **mock** en el puente y tests sin hardware | Mocks solo en JS | Permite desarrollar y testear toda la cadena (incluido Python) sin lámpara |
| D9 | Deploy con `npm run deploy` conservando `data/` | Instalación manual | Iteración rápida y reproducible; los ajustes sobreviven a actualizaciones |
| D10 | UI español + inglés, docs español | Solo español | La app puede correr en inglés; coste mínimo con el sistema de i18n del SDK |

## 4. Alcance v0.1

### Incluido

- Acción **Color** con color, etiqueta, hex, brillo opcional, encendido automático.
- Acción **Power** con estado reflejado.
- Acción **Brightness** con modos preset / up / down / cycle.
- Acción **Settings & Status** con MAC, escaneo BLE, paleta, keep-alive,
  ruta de Python, mock, debug, diagnóstico de servicios y apertura de logs.
- Paleta global editable (2–24 colores) y ciclo por pulsación larga.
- Puente BLE persistente con detección y caché de protocolo, reintento y keep-alive.
- Iconos generados, i18n, modo mock, tests automáticos, script de deploy.
- Documentación completa (plan, roadmap, arquitectura, protocolo, pruebas, instalación).

### Fuera de alcance (anotado en el roadmap)

- Efectos/blanco/temperatura desde teclas.
- Varias lámparas/perfiles.
- Encoders del D200X.
- Empaquetado sin Python (binario único).
- Publicación en el marketplace.

## 5. Arquitectura en una página

```
┌────────────┐   USB   ┌─────────────────────────────┐
│  D200H     │────────►│ Ulanzi Studio (WebSocket)   │
└────────────┘         └──────────┬──────────────────┘
                                  │ SDK (ws :3906)
                       ┌──────────▼──────────┐
                       │ plugin/app.js       │  acciones + estado + PI
                       │  ├ render.js        │  SVG de teclas
                       │  ├ settings.js      │  data/settings.json
                       │  └ bridge.js        │
                       └──────────┬──────────┘
                                  │ NDJSON stdio
                       ┌──────────▼──────────┐
                       │ backend/ble_bridge  │  bleak, 1 cliente persistente
                       │  └ led_protocol.py  │  tramas 7E…EF, UUIDs, caché
                       └──────────┬──────────┘
                                  │ BLE (GATT)
                             ┌────▼────┐
                             │ Lámpara │  C0:00:00:23:0E:D8
                             └─────────┘
```

Flujo de una pulsación: `run` → `ColorAction.run()` → `bridge.color()` →
`ble_bridge` escribe la trama → responde `state` → `handleSuccess` actualiza el
estado global y repinta **todas** las teclas (para mover el anillo de "activo").
Si falla: toast + `showAlert` + la tecla Settings pasa a error.

## 6. Hitos

| Hito | Contenido | Estado |
|---|---|---|
| H0 | Investigación: SDK, plugins instalados, `led-control`, requisitos D200H | ✅ |
| H1 | Backend: protocolo + puente NDJSON + modo mock + tests de tramas | ✅ |
| H2 | Plugin Node: puente, settings, render, cuatro acciones | ✅ |
| H3 | Property Inspectors (color, brillo, power, ajustes) + i18n | ✅ |
| H4 | Tooling: deploy, tests, preview de teclas, README/docs | ✅ |
| H5 | Validación física: conexión real, latencia, pulsación larga, keep-alive | 🟡 detección de protocolo y escritura verificadas en la lámpara real; UI del deck pendiente |
| H6 | Ajustes post-prueba (colores, tiempos, mensajes) | 🟡 iconos y drag & drop corregidos; falta validar latencia/gestos en el D200H |
| H7 | Publicación: assets, paquete, ficha y guía del Ulanzi Workshop | ✅ |

## 7. Riesgos y mitigaciones

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Python no está en el PATH del proceso de Ulanzi | Media | Alto | Autodetección con `py -3` y rutas típicas; campo manual; mensaje claro en la tecla y en Ajustes |
| `bleak` instalado en otro Python | Media | Alto | Se busca primero un intérprete que pueda `import bleak`; el estado muestra qué Python se usó |
| La lámpara se desconecta al dormir | Alta | Medio | Reintento automático al escribir + keep-alive configurable |
| El keep-alive molesta (parpadeo) | Baja | Bajo | Desactivable con un slider (0) |
| `run` se dispara al pulsar y no al soltar, duplicando el ciclo largo | Media | Bajo | La pulsación larga aplica el color nuevo al final; `suppressRunUntil` evita duplicados si `run` llega al soltar |
| Diferencia de color percibida (LED barato) | Alta | Bajo | Brillo forzado por tecla + paleta editable |
| Reinicio del plugin con teclas ya colocadas | Media | Bajo | Si no hay params en `run`, se piden con `getSettings` y se ejecuta la acción pendiente |
| Windows BLE se atasca | Baja | Medio | Reinicio del puente con pulsación larga en Settings; logs en `data/bridge.log` |

## 8. Criterios de aceptación

Funcionales:

- [ ] La tecla Settings muestra «Conectado» y el protocolo tras configurar la MAC.
- [ ] Una tecla Color aplica el color en < 300 ms con el enlace caliente.
- [ ] El anillo de activo se mueve a la última tecla pulsada.
- [ ] Power refleja ON/OFF y funciona con la luz apagada.
- [ ] Brightness preset/up/down/cycle respeta 0–100 y se ve en el anillo.
- [ ] Pulsación larga en Color cambia al siguiente color de la paleta y persiste
      tras reiniciar Ulanzi Studio.
- [ ] Cambiar la MAC en Ajustes y reconectar funciona sin reiniciar el plugin.
- [ ] Sin lámpara encendida, las teclas avisan del error sin bloquearse.
- [ ] Con `mock` activo, toda la UI funciona sin Bluetooth.

No funcionales:

- [ ] Sin fugas de procesos Python al cerrar Ulanzi Studio.
- [ ] `bridge.log` rota a 1 MB.
- [ ] El plugin no escribe fuera de su carpeta `data/`.
- [ ] Los ajustes sobreviven a `npm run deploy`.
- [ ] `npm test` pasa en una máquina sin lámpara.

## 9. Métricas objetivo

| Métrica | Objetivo |
|---|---|
| Latencia pulsación → color (enlace caliente) | < 300 ms |
| Latencia primera pulsación tras arranque | < 5 s (incluye conexión BLE) |
| Tamaño del plugin desplegado | < 1.5 MB (sin `data/`) |
| RAM del puente | < 60 MB |
| Cobertura de pruebas sin hardware | protocolo, render, comandos, errores básicos |

## 10. Glosario

- **Puente / bridge**: proceso Python que mantiene la conexión BLE.
- **Context**: identificador único de una tecla (`uuid___key___actionid`).
- **PI**: Property Inspector, el panel de configuración de la tecla.
- **Acción**: tipo de tecla que ofrece el plugin.
- **Paleta**: lista global de colores que recorre la pulsación larga.
