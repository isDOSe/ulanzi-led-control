# Roadmap — DOSe LED Control

Prioridad: **P0** imprescindible para uso diario · **P1** mejora clara ·
**P2** nice-to-have · **P3** exploratorio.

## v0.1.2 — base funcional y publicación (actual)

- [x] Acción Color (color, etiqueta, hex, brillo opcional, encendido automático)
- [x] Acción Power con estado
- [x] Acción Brightness (preset / up / down / cycle)
- [x] Acción Settings & Status (MAC, scan, paleta, keep-alive, Python, mock, debug, diagnóstico)
- [x] Puente BLE persistente + detección/caché de protocolo + reintento
- [x] Pulsación larga para ciclar la paleta y persistir por tecla
- [x] Iconos SVG dinámicos y estados (activo, offline, apagado, error)
- [x] Drag & drop por ActionID y persistencia de parámetros con `setSettings`
- [x] Iconos de menú corregidos (Power/categoría) y repintado de teclas nuevas
- [x] i18n español/inglés, modo mock, tests, preview, assets y paquete de tienda
- [x] Documentación (plan, arquitectura, protocolo, pruebas, instalación, publicación)

**Pendiente de validación en hardware (0.1.3):**

- [ ] P0 Ajustar `longPressMs` y comportamiento real de `keydown/keyup/run` en D200H
- [ ] P0 Verificar si el keep-alive de 30 s provoca parpadeo → ajustar default
- [ ] P0 Medir latencia real y documentarla
- [ ] P1 Revisar contraste/legibilidad de etiquetas en el panel real (256 px)
- [ ] P1 Confirmar que `PrivateAPI: true` no es necesario (retirarlo si no)
- [ ] P1 Empaquetar Python/bleak para publicar sin requisitos (ver `docs/PUBLISHING.md`)

## v0.2.0 — más control sin más teclas

- [ ] P1 **Efectos**: acción `Effect` (efecto fijo + velocidad) y `Next effect`
- [ ] P1 **Blanco / temperatura**: acción White con nivel y temperatura cálida/fría
- [ ] P1 **Tecla "estado"**: brillo + color actual + potencia en una sola tecla
- [ ] P1 **Doble pulsación** en color para "aplicar y volver al color anterior"
- [ ] P2 Export/import de paleta y teclas (JSON) para copiar perfiles entre PCs
- [ ] P2 Traducciones pt_PT, de_DE, ja_JP (la infraestructura ya existe)
- [ ] P2 Preview de la tecla dentro del PI (mismo SVG que el deck)

## v0.3.0 — varias luces y D200X

- [ ] P1 **Multi-lámpara**: lista de dispositivos con nombre y acción Color que
      elige destino; un puente por MAC o multiplexado
- [ ] P1 **Encoders (D200X)**: brillo con `dialrotate`, color con `hold-rotate`
- [ ] P2 **Escenas**: una tecla aplica color + brillo + (futuro) efecto
- [ ] P2 Programación horaria / apagado automático
- [ ] P2 Detección automática de la primera lámpara `LED*` al instalar

## v1.0.0 — listo para compartir

- [ ] P0 Instalador sin Python (PyInstaller onedir del puente) para usuarios sin Python
- [ ] P0 CI: tests en Windows + lint + build del paquete `.ulanziPlugin`
- [ ] P1 Manejo de reconexión tras suspensión del PC / cambio de adaptador Bluetooth
- [ ] P1 Telemetría local opcional de latencia (sin red)
- [ ] P2 Publicación en el marketplace de Ulanzi (requiere revisión y assets)
- [ ] P2 Soporte macOS verificado (bleak usa CoreBluetooth; misma API)

## Ideas descartadas por ahora

- **BLE nativo en Node**: exige módulos compilados contra el ABI de Electron/Node
  de Ulanzi; frágil en Windows y sin ventaja de latencia frente a bleak.
- **Servidor HTTP propio**: obliga a mantener un proceso adicional y abrir un
  puerto; el puente por stdio ya resuelve el problema con menos superficie.
- **Color por tecla con MAC por tecla**: redundante para una sola lámpara.

## Cómo priorizar

1. Si algo impide usar el plugin a diario → P0.
2. Si reduce pulsaciones o evita abrir el PI → P1.
3. Si solo mejora la estética o casos raros → P2/P3.
