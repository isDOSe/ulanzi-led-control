# Contribuir a DOSe LED Control

¡Gracias por pasarte! Este proyecto nació para controlar una tira LED barata
desde el deck, y mejora mucho cuando alguien aporta otra lámpara, otro modelo de
deck o una idea nueva.

## Antes de abrir un issue

- Busca en los issues existentes: puede estar reportado.
- Para fallos, incluye: modelo de lámpara, MAC parcial (no hace falta la
  completa), versión de Ulanzi Studio, versión de Python y `bleak`, y las
  últimas líneas de `data\bridge.log` y `data\plugin.log`.
- Para lámparas no reconocidas, adjunta la salida de **Settings → Identify**
  (servicios y características BLE). Con eso se puede añadir el protocolo.

## Entorno de desarrollo

Requisitos: **Node.js 20+**, **Python 3.10+** con `bleak` y, opcionalmente,
**Ulanzi Studio 3.4+** con el deck conectado.

```powershell
git clone https://github.com/isDOSe/ulanzi-led-control.git
cd ulanzi-led-control

npm run setup     # instala ws dentro del plugin
npm test          # validador + protocolo + render + puente + identidad
npm run test:py   # tramas BLE exactas (no necesita Bluetooth)
```

Sin lámpara puedes trabajar con el puente simulado:

```powershell
npm run bridge:mock
```

Y probar la UI con **Mock mode** activo en Ajustes.

### Probar en el deck real

```powershell
npm run deploy
# reinicia Ulanzi Studio por completo
```

`npm run deploy` conserva la carpeta `data/` (ajustes y caché). Usa
`npm run deploy:clean` si has borrado o renombrado archivos.

## Estructura rápida

| Ruta | Qué hay |
|---|---|
| `com.dose.ledcontrol.ulanziPlugin/plugin/app.js` | Servicio principal, acciones y bus del PI |
| `plugin/render.js` | Arte SVG de las teclas |
| `plugin/actions/` | Comportamiento de cada tipo de tecla |
| `property-inspector/` | UI de configuración (HTML/CSS/JS sin framework) |
| `backend/ble_bridge.py` | Puente BLE persistente (NDJSON sobre stdio) |
| `backend/led_protocol.py` | Tramas `7E…EF` / `56…AA` y UUIDs |
| `tools/` | Validación, tests, deploy, preview, assets y paquete |

## Convenciones

- **JavaScript**: módulos ESM, 2 espacios, punto y coma, comentarios en inglés
  (como el código existente). Sin dependencias nuevas si se pueden evitar: el
  plugin se despliega con `ws` y el SDK vendorizado.
- **Python**: 3.10+, sin dependencias más allá de `bleak`, tipos en las firmas
  públicas y `unittest` para las tramas.
- **Textos de UI**: añade la cadena en `en.json` y `es_ES.json`, y usa el
  sistema de i18n del SDK. El español es la referencia.
- **Documentación**: en español, en `docs/`, con enlaces relativos.
- **Assets**: los de tienda se generan con `npm run assets`; no los edites a
  mano. El preview de teclas se genera con `npm run preview`.
- **Commits**: mensajes cortos en imperativo, con prefijo cuando aplique:
  `feat:`, `fix:`, `docs:`, `test:`, `chore:`.

## Añadir una acción nueva

1. Crea `plugin/actions/<nombre>.js` extendiendo `actions/base.js`.
2. Regístrala en `plugin/app.js` (`ACTION_IDS` y el mapa de clases).
3. Añádela al `manifest.json` (UUID, icono, tooltip, `PropertyInspectorPath`).
4. Crea su PI en `property-inspector/` reutilizando `pi-common.js` y `pi.css`.
5. Añade las cadenas a `en.json` y `es_ES.json`.
6. Añade un test en `tools/test.mjs` y, si genera arte, en `tools/test-identity.mjs`.
7. Actualiza `README.md`, `README.en.md` y `docs/CHANGELOG.md`.

## Checklist antes de un PR

- [ ] `npm test` pasa.
- [ ] `npm run test:py` pasa.
- [ ] `npm run validate` no añade avisos nuevos.
- [ ] Probado con `npm run bridge:mock` o con una lámpara real.
- [ ] Sin datos personales, MACs reales ni rutas absolutas en el código o los docs.
- [ ] Documentación y changelog actualizados si cambia el comportamiento.

## Código de conducta

Sé amable y constructivo. Este es un proyecto personal mantenido en ratos
libres: las respuestas pueden tardar, pero todos los reportes útiles se leen.
