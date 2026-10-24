# Publicar DOSe LED Control en Ulanzi

Guía para enviar el plugin al **Ulanzi Workshop / UGC** y que aparezca en la
tienda de Ulanzi Studio. Incluye la ficha lista para copiar, los assets y los
puntos que revisa Ulanzi.

> **Autor:** Ernesto Flames “DOSe”
> **Web:** [www.isdose.com](https://www.isdose.com)
> **Versión de esta guía:** 0.1.2 · octubre 2026

---

## 1. Enlaces oficiales

| Qué | Dónde |
|---|---|
| Ulanzi Workshop (UGC): subir y gestionar el plugin | https://ugc.ulanzistudio.com |
| Portal de desarrollador (login) | https://developer.ulanzistudio.com |
| SDK oficial del plugin | https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK |
| Documentación de Ulanzi Studio | https://docs.ulanzistudio.com/en |
| Foro / soporte a desarrolladores | https://bbs.ulanzistudio.com |
| Contacto del equipo de plugins | ustudioservice@ulanzi.com |

El flujo actual del Workshop es: **crear cuenta → Upload Works → Plugins →
subir paquete + portada + banners + capturas → completar la ficha → enviar a
revisión**. El plugin pasa por *Works under review*; si se aprueba aparece en
*Published works* y se lista en la tienda de Ulanzi Studio.

> La interfaz del UGC puede cambiar. Los campos y validaciones de esta guía
> están tomados de la versión de octubre de 2026: icono 1:1, portada 2:1,
> banners 3:2, capturas 366:244, `Version` en formato `x.x.x` y `UUID` igual al
> del `manifest.json`.

---

## 2. Antes de enviar: decisión importante sobre Python

El plugin usa un **puente Python + bleak** para hablar BLE. Ulanzi Studio trae
Node, pero **no trae Python**. Para una publicación pública hay dos caminos:

### Opción A — Beta con requisito visible (lo que permite la versión 0.1.2)

Publicar indicando claramente:

> Requiere Windows 10/11, Ulanzi Studio 3.4+ y **Python 3.10+ con `bleak`**
> (`pip install bleak`). La app detecta Python automáticamente; si no lo
> encuentra, permite indicar la ruta en Ajustes.

Ventaja: se publica ya. Riesgo: parte de los usuarios no tendrá Python y la
tasa de soporte será alta; algunos revisores pueden pedir que sea autónomo.

### Opción B — Recomendada para la 1.0: puente empaquetado

Empaquetar `backend/ble_bridge.py` como ejecutable para que el usuario no
instale nada:

```powershell
pip install pyinstaller
pyinstaller --noconfirm --onedir --name led-bridge `
  com.dose.ledcontrol.ulanziPlugin\backend\ble_bridge.py
```

1. Copiar `dist\led-bridge\` a
   `com.dose.ledcontrol.ulanziPlugin\backend\bin\win\`.
2. En `plugin/bridge.js`, priorizar el ejecutable
   (`backend/bin/win/led-bridge/led-bridge.exe`) y dejar Python como fallback.
3. Probar en una **máquina virtual Windows limpia, sin Python**.
4. Volver a ejecutar `npm run package`.

El ZIP crecerá (~30 MB) pero la instalación será “un zip y listo”, que es lo que
espera la tienda. Para macOS habría que generar y firmar un binario equivalente;
hasta entonces, publicar solo Windows.

### Plataforma de esta versión

- **Windows 10/11**: probado en el equipo del autor con un D200H y una tira
  `LEDBLE-00-D80E` (protocolo `7E…EF`, `ffe0/ffe1`).
- **macOS**: el código es multiplataforma (bleak usa CoreBluetooth) pero **no
  está probado**. En la ficha del UGC selecciona solo **Windows** hasta validarlo.

---

## 3. Checklist antes de subir

- [ ] `manifest.json`: `UUID` de 4 segmentos (`com.dose.ledcontrol.deck`),
      acciones de 5+, `Version` `x.x.x` (`0.1.2`).
- [ ] Nombre visible **DOSe LED Control** en `manifest.json`, `en.json` y
      `es_ES.json`.
- [ ] Iconos del plugin y de las acciones correctos en el menú de Ulanzi.
- [ ] `npm test` verde (validador + 10 comprobaciones + test de identidad).
- [ ] `npm run test:identity` verde.
- [ ] Prueba real: escanear, conectar, color, power, brillo, pulsación larga,
      mover teclas y reiniciar Ulanzi.
- [ ] `LICENSE` y `THIRD-PARTY-LICENSES.md` incluidos.
- [ ] Sin datos personales en el paquete (`data/`, logs, `settings.json`,
      `action-params.json`, `protocol-cache.json`).
- [ ] `npm run package` genera el ZIP con la carpeta del plugin en la raíz.
- [ ] `npm run assets` genera icono, portada, banners y capturas.
- [ ] Ficha ES/EN revisada (sección 6).
- [ ] Cuenta en https://ugc.ulanzistudio.com creada.

---

## 4. Generar el paquete y los assets

```powershell
cd ulanzi-led-control
npm test
npm run package
npm run assets
```

Salidas:

```
dist/com.dose.ledcontrol.ulanziPlugin-0.1.2.zip
docs/store/assets/icon-1024x1024.png            1:1
docs/store/assets/cover-2400x1200.png           2:1
docs/store/assets/banner-1-2400x1600.png        3:2
docs/store/assets/banner-2-2400x1600.png        3:2
docs/store/assets/banner-3-2400x1600.png        3:2
docs/store/assets/screenshot-1-2196x1464.png    366:244
docs/store/assets/screenshot-2-2196x1464.png    366:244
docs/store/assets/screenshot-3-2196x1464.png    366:244
```

El ZIP contiene:

```
com.dose.ledcontrol.ulanziPlugin/
├─ manifest.json
├─ plugin/ … (incluye node_modules/ws)
├─ property-inspector/ …
├─ backend/ …
├─ assets/ …
└─ LICENSE / THIRD-PARTY-LICENSES.md
```

Sin `data/`, sin `__pycache__`, sin logs, sin tests de desarrollo. El usuario
puede descomprimirlo directamente en
`%APPDATA%\Ulanzi\UlanziDeck\Plugins` sin que quede una carpeta anidada dos
veces.

---

## 5. Pasos en el Workshop (UGC)

1. Entra en **https://ugc.ulanzistudio.com** y crea/inicia sesión con tu cuenta.
2. Pulsa **Upload Works** (también aparece como *Click upload works*).
3. Elige el tipo de trabajo: **Plugins**.
4. Rellena la ficha:
   - **Title**: `DOSe LED Control`
   - **Classification / Category**: `Tools` (o `Creative`; elige una y mantenla)
   - **Version**: `0.1.2`
   - **Language**: Español e Inglés
   - **System**: Windows
   - **Devices**: D200, D200H, D200X (teclado; sin encoders)
   - **Tags**: LED, RGB, Bluetooth, BLE, lighting, smart home, D200H
   - **Additional Link**: `https://www.isdose.com`
5. Sube las imágenes en el orden que pida el formulario:
   - **Icon** 1:1 → `icon-1024x1024.png`
   - **Cover** 2:1 → `cover-2400x1200.png`
   - **Banners** 3:2 (hasta 3) → `banner-1…3`
   - **Screenshots** 366:244 (hasta 3) → `screenshot-1…3`
6. Sube el paquete comprimido:
   `dist/com.dose.ledcontrol.ulanziPlugin-0.1.2.zip`.
7. Completa **Name / Summary / Detailed introduction** en los idiomas que
   quieras publicar (mínimo ES y EN). Usa la sección 6 tal cual.
8. Revisa la vista previa y pulsa **Submit**.
9. El trabajo pasa a **Works under review**. Cuando se apruebe aparecerá en
   **Published works** y en la tienda de Ulanzi Studio.
10. Si lo rechazan (**Rejected works**), corrige lo indicado y reenvía. El
    formulario conserva el borrador.

### Validaciones que aplica el UGC

- El `Version` del manifiesto debe ser `x.x.x`.
- El `UUID` del formulario debe coincidir con el del `manifest.json`.
- Icono 1:1 y banners 3:2 (si no, no deja subir).
- Los sistemas soportados deben coincidir con los del paquete.
- Los plugins deben tener un ID único.

---

## 6. Ficha lista para copiar

### Español

**Título**

```
DOSe LED Control
```

**Resumen**

```
Teclas de color, encendido y brillo para tu tira LED RGB por Bluetooth, directamente desde el deck. Sin apps, sin nube.
```

**Descripción**

```
Convierte tu Ulanzi D200H en un panel de luz. DOSe LED Control añade teclas de color, encendido, brillo y ajustes para tiras y lámparas LED RGB controladas por Bluetooth LE (protocolo 7E…EF: ELK-BLEDOM, LEDBLE/JDY, Magic Blue y clones).

Cada tecla de color ES el color: se pinta con el hex elegido, muestra la etiqueta y marca la última aplicada. Mantén pulsada una tecla para recorrer la paleta global y guardar el nuevo color en esa tecla. La tecla de ajustes escanea dispositivos BLE, guarda la MAC una sola vez, permite editar la paleta y el keep-alive, y muestra el estado y el protocolo en vivo. La tecla Power enciende/apaga y la de Brillo fija, sube, baja o cicla el nivel.

Cómo funciona: el deck envía la pulsación a Ulanzi Studio; el plugin habla por un canal local con un pequeño puente BLE persistente, que mantiene la conexión y aplica la trama 7E…EF. Todo ocurre en tu PC: no hay cuenta, ni nube, ni telemetría. La MAC por defecto es C0:00:00:23:0E:D8 y se puede cambiar desde Ajustes con un escaneo BLE.

Requisitos: Windows 10/11, Ulanzi Studio 3.4+ y, en esta versión beta, Python 3.10+ con bleak (pip install bleak). La app detecta Python automáticamente y permite indicar la ruta manualmente. La versión estable incluirá el puente empaquetado para no requerir Python.

Hecho por Ernesto Flames “DOSe” · www.isdose.com
```

**Requisitos**

```
Windows 10/11 · Ulanzi Studio 3.4+ · Python 3.10+ con bleak (beta) · Bluetooth LE activo · D200/D200H/D200X (teclado)
```

**Privacidad**

```
100% local. El plugin no crea cuentas, no envía datos y no hace peticiones de red. Solo habla con la lámpara por Bluetooth LE en tu equipo.
```

**Autor / Web / Soporte**

```
Ernesto Flames “DOSe” — https://www.isdose.com
```

### English

**Title**

```
DOSe LED Control
```

**Summary**

```
Color, power and brightness keys for your Bluetooth RGB LED strip, straight from the deck. No apps, no cloud.
```

**Description**

```
Turn your Ulanzi D200H into a light panel. DOSe LED Control adds color, power, brightness and settings keys for RGB LED strips and lamps controlled over Bluetooth LE (7E…EF protocol: ELK-BLEDOM, LEDBLE/JDY, Magic Blue and clones).

Every color key IS the color: it renders the chosen hex, shows the label and marks the last applied one. Hold a key to cycle the global palette and save the new color on that key. The settings key scans for BLE devices, stores the MAC once, edits the palette and keep-alive, and shows the live connection/protocol. Power toggles the lamp; Brightness sets, steps or cycles the level.

How it works: the deck sends the press to Ulanzi Studio; the plugin talks over a local channel to a small persistent BLE bridge that keeps the link alive and writes the 7E…EF frame. Everything runs on your PC: no account, no cloud, no telemetry. The default MAC is C0:00:00:23:0E:D8 and can be changed from Settings with a BLE scan.

Requirements: Windows 10/11, Ulanzi Studio 3.4+ and, in this beta, Python 3.10+ with bleak (pip install bleak). The app auto-detects Python and lets you set the path manually. The stable release will bundle the bridge so Python is not required.

Made by Ernesto Flames “DOSe” · www.isdose.com
```

**Requirements**

```
Windows 10/11 · Ulanzi Studio 3.4+ · Python 3.10+ with bleak (beta) · Bluetooth LE enabled · D200/D200H/D200X (keypad)
```

**Privacy**

```
100% local. No accounts, no telemetry, no network requests. The plugin only talks to the lamp over Bluetooth LE on your machine.
```

**Author / Website / Support**

```
Ernesto Flames “DOSe” — https://www.isdose.com
```

---

## 7. Después de publicar

- **Soporte**: enlaza www.isdose.com en la ficha y responde en el foro de Ulanzi.
- **Actualizaciones**: desde *Published works*, crea una nueva versión. La
  versión publicada sigue disponible hasta que la nueva pase revisión.
- **Versionado**: sube `manifest.json` y `package.json` (SemVer). Incluye el
  cambio en `docs/CHANGELOG.md` y vuelve a generar ZIP/assets.
- **Cambios de dependencias**: si empaquetas Python (opción B), actualiza la
  ficha para quitar el requisito y vuelve a probar en una VM limpia.

### Errores comunes en la revisión

| Problema | Qué hacer |
|---|---|
| “No funciona en mi equipo” | Empaquetar Python/bleak antes de la 1.0; probar en una VM sin Python. |
| Icono/banner con proporción incorrecta | Usar los PNG de `docs/store/assets` (1:1, 2:1, 3:2) sin recortar. |
| `Version` o `UUID` no coinciden | Comprobar `manifest.json`; el formulario valida ambos. |
| “No es compatible con Mac” | Publicar solo Windows hasta probarlo; no marcar Mac en la ficha. |
| Marca/afiliación | Decir “compatible con Ulanzi Studio / D200H”, no “oficial de Ulanzi”. |
| Privacidad | Mantener la afirmación “sin red” solo si sigue siendo cierta. Revisar dependencias. |

---

## 8. Checklist final de envío

- [ ] ZIP nombrado `com.dose.ledcontrol.ulanziPlugin-0.1.2.zip` y carpeta en la raíz.
- [ ] `manifest.json` con `Version 0.1.2` y UUID `com.dose.ledcontrol.deck`.
- [ ] Icono 1:1, portada 2:1, 3 banners 3:2, 3 capturas 366:244.
- [ ] Ficha ES y EN completas (título, resumen, descripción, requisitos, privacidad).
- [ ] Autor `Ernesto Flames “DOSe”` y web `www.isdose.com`.
- [ ] Categoría `Tools`, sistema Windows, dispositivos D200/D200H/D200X.
- [ ] Enviado a revisión y estado *Works under review*.
