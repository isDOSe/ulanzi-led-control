# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Versionado [SemVer](https://semver.org/lang/es/).

## [0.1.2] — 2026-10-21

### Corregido

- **Iconos del menú**: el glifo de Power dibujaba una circunferencia completa
  más un arco extra (se veía “con errores”). Ahora usa un solo arco con hueco
  superior y línea central, legible a 40 px. El icono de categoría se unificó
  con las tres barras RGB del icono del plugin.
- **Glifo de Power en la tecla del deck**: mismo arreglo (arco limpio + línea),
  sin la circunferencia y el arco solapados.
- **Drag & drop e identidad**: se consolida la identidad por **ActionID**; mover
  una tecla conserva sus parámetros y una tecla nueva sobre una posición ocupada
  no hereda los del ocupante.
- **Iconos de teclas nuevas**: repintados a los 250/900/1800 ms y al activar una
  tecla, para que Ulanzi no deje el icono estático del manifiesto.
- **Persistencia de parámetros**: el servicio principal usa `setSettings` al
  recibir `ledParams`; `paramfromplugin` es solo passthrough. Los `add` ya
  llegan con `param` y las respuestas vacías no borran la configuración.

### Añadido

- **Publicación**: `docs/PUBLISHING.md` con el flujo del Ulanzi Workshop, la
  ficha ES/EN, requisitos, revisión y actualizaciones.
- **Ficha de tienda**: `docs/store/listing-es.md`, `listing-en.md` y
  `listing.json`, con autor **Ernesto Flames “DOSe”** y web **www.isdose.com**.
- **Assets de tienda**: `npm run assets` genera icono 1:1, portada 2:1, tres
  banners 3:2 y tres capturas 366:244 a partir de la UI real.
- **Paquete**: `npm run package` genera un ZIP limpio con la carpeta del plugin
  en la raíz, listo para el UGC o para descomprimir en Plugins.
- Versión **0.1.2**.

## [0.1.1] — 2026-10-21

### Corregido

- **Nombre del plugin**: ahora se muestra como **DOSe LED Control**.
- **Las teclas no se registraban**: Ulanzi 3.4.x identifica el tipo de acción por
  el campo `uuid` (UUID de la acción), no por `actionid` (ID de instancia). El
  plugin solo miraba `actionid`, así que no creaba la instancia: ni icono propio
  ni `run`. Ahora resuelve el tipo por `uuid`, `actionid` y contexto, y mantiene
  un índice por posición de tecla.
- **Iconos idénticos en todas las teclas**: las acciones llamaban a
  `render.colorKey`/`brightnessKey`, pero el módulo exporta
  `colorKeySVG`/`brightnessKeySVG`; además se enviaba el SVG en crudo en lugar
  del data URI base64 que espera `setBaseDataIcon`. Ambos fallos corregidos y
  cubiertos por un test de regresión.
- **Parámetros PI → plugin**: además de `sendParamFromPlugin`, el PI envía los
  parámetros por un canal directo (`sendToPlugin` con `type:'ledParams'`) y el
  plugin los guarda. Descubrimiento clave: `paramfromplugin` es **solo
  passthrough** en Ulanzi 3.4; la persistencia real se hace con
  `setSettings(params, context)`. El servicio principal ahora llama a
  `setSettings` al recibir `ledParams`, así que el color/etiqueta queda guardado
  en el perfil y el icono se actualiza al instante.
- **Respuestas vacías del host**: `paramfromapp`/`didReceiveSettings` con `{}`
  ya no borran los parámetros guardados de una tecla.
- **Teclas movidas (drag & drop)**: la identidad de una tecla es su
  **ActionID**, no la posición. Al mover una tecla conserva su color/etiqueta, y
  una tecla nueva soltada sobre una posición ocupada ya no hereda los parámetros
  del ocupante anterior. El store de parámetros se migra a claves por ActionID
  (las entradas por posición se descartan).
- **Teclas nuevas con el icono viejo (4 cuadritos)**: el `state` enviado justo
  después del `add` podía perderse. Ahora se repinta a los 250/900/1800 ms, al
  recibir parámetros y al activar cualquier tecla; las teclas movidas recuperan
  su arte generado.
- **El PI ya no depende de `onAdd`**: si el host no reproduce los parámetros al
  abrir el panel, el PI los pide al plugin (`getActionParams`) y escucha
  `paramfromapp`; los cambios se envían siempre (se eliminó el flag `ready`).
- **Color impreciso**: el brillo se envía **antes** que el RGB (el comando de
  brillo podía resetear el modo de color), con 120 ms tras el encendido y 80 ms
  entre tramas, y 250 ms de asentamiento tras conectar. El botón de prueba ahora
  usa el mismo brillo y `powerOn` que la tecla.
- **Botón de prueba**: respeta `Brightness override` y `Turn on if off`, igual
  que la pulsación real.

### Añadido

- `data/plugin.log`: registro de eventos `add`/`run`/params/errores y comandos,
  con rotación a 1 MB, para diagnosticar sin depender del log comprimido de la app.
- Aviso en la tecla cuando `Turn on if off` está desactivado y la luz está apagada.
- Test de regresión de render de acciones (ahora 10 comprobaciones).

## [0.1.0] — 2026-10-21

### Añadido

- Plugin `com.dose.ledcontrol.deck` para Ulanzi D200H (compatible con cualquier deck
  de teclas del ecosistema Ulanzi Studio).
- Acción **Color** con color, etiqueta, hex, brillo forzado y encendido
  automático; anillo/check de color activo y aviso de desconexión.
- Acción **Power** con estado ON/OFF.
- Acción **Brightness** con modos preset, subir, bajar y ciclo.
- Acción **Settings & Status** con MAC, escaneo BLE, paleta global (2–24),
  keep-alive, ruta de Python, mock, logs, diagnóstico de servicios BLE y estado
  en vivo.
- Pulsación larga en teclas de color para ciclar la paleta y guardar el color
  por tecla.
- Puente BLE persistente en Python/bleak con detección y caché de protocolo,
  reintento de escritura y keep-alive configurable.
- Protocolo `7E…EF` (ELK-BLEDOM, LEDBLE/JDY, custom 305bdd41) y `56…AA`
  (Magic Blue).
- Iconos SVG dinámicos generados en runtime, i18n español/inglés.
- Modo mock, tests automáticos (protocolo, render y puente), preview de teclas.
- Scripts `npm run setup|test|preview|deploy|deploy:clean|bridge|bench`.
- Documentación: plan, roadmap, arquitectura, protocolo BLE, instalación y
  pruebas.

### Conocido / pendiente

- Validación visual en el D200H (orden de `keydown`/`run`, latencia percibida,
  conveniencia del keep-alive de 30 s). La detección de protocolo, los servicios
  BLE y la escritura `power on` sí se verificaron contra la lámpara real
  (`C0:00:00:23:0E:D8`, `ffe0/ffe1`, `write-without-response`).
- Una sola lámpara configurada a la vez.
- Efectos y modo blanco existen en el puente pero aún no tienen tecla propia.
