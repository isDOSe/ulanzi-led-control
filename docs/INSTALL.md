# Instalación — LED Control BLE

## 0. Comprobaciones previas

Requisitos: **Windows 10/11**, **Ulanzi Studio 3.4+** y **Python 3.10+** con `bleak`.

```powershell
python --version                 # 3.10 o superior
python -c "import bleak; print('bleak ok')"
node --version                   # solo para desarrollar
```

Si `bleak` falla:

```powershell
python -m pip install --upgrade bleak
```

> **Importante:** Ulanzi Studio arranca el plugin con el entorno del sistema, no
> con tu terminal. El plugin busca el primer Python que pueda `import bleak`
> (`python`, `py -3`, rutas típicas de `%LOCALAPPDATA%\Programs\Python`). Si usas
> un venv concreto, indícalo en **Ajustes → Advanced → Python executable**.
> El panel de estado muestra la versión de Python que se está usando.

## 1. Dependencias del plugin

```powershell
git clone https://github.com/isDOSe/ulanzi-led-control.git
cd ulanzi-led-control
npm run setup
```

Esto instala `ws` dentro de `com.dose.ledcontrol.ulanziPlugin/node_modules`
(Ulanzi ejecuta Node 20, que no trae `WebSocket` global).

## 2. Pruebas sin hardware

```powershell
npm test
```

Debe terminar con `10 checks passed`. También puedes generar la hoja de estilos
de teclas:

```powershell
npm run preview
start docs\key-preview.html
```

## 3. Desplegar

```powershell
npm run deploy
```

Copia el plugin a:

```
%APPDATA%\Ulanzi\UlanziDeck\Plugins\com.dose.ledcontrol.ulanziPlugin
```

conservando la carpeta `data/` (ajustes y caché). Para limpiar archivos
obsoletos:

```powershell
npm run deploy:clean
```

## 4. Reiniciar Ulanzi Studio

El servicio principal es un proceso Node de larga duración. Cerrar el panel de
configuración **no** recarga el código.

1. Cierra Ulanzi Studio por completo (bandeja del sistema incluida).
2. Vuelve a abrirlo.
3. En la lista de acciones debe aparecer la categoría **LED Control** con
   *Color*, *Power*, *Brightness* y *Settings & Status*.

Si no aparece: revisa que el `manifest.json` esté en la raíz de la carpeta
desplegada y que el JSON sea válido.

## 5. Primera configuración (una sola vez)

1. Arrastra **Settings & Status** a una tecla.
2. Abre su Property Inspector.
3. Pulsa **Scan** (10 s). La lámpara debe estar encendida y sin conexión de la
   app del móvil.
4. Elige tu dispositivo (MAC por defecto: `C0:00:00:23:0E:D8`).
5. **Save settings**.
6. **Reconnect**. La tecla debe quedar verde y mostrar el protocolo detectado
   (probablemente `LEDBLE / JDY ffe0/ffe1`).

> Si no aparece en el escaneo, escribe la MAC a mano y pulsa **Reconnect**. El
> escaneo y la conexión no pueden convivir: el panel avisa de que la luz se
> desconecta unos segundos.

## 6. Añadir teclas de color

1. Arrastra **Color** a una tecla.
2. En el PI elige el color (selector o hex), una etiqueta opcional y, si quieres,
   un brillo forzado.
3. **Test on light** para comprobar sin guardar.
4. Repite con los colores que quieras. La tecla muestra el color y el hex.

Pulsación corta = aplica. **Pulsación larga (≈0,65 s)** = siguiente color de la
paleta global, guardado en esa tecla.

## 7. Actualizar

```powershell
git pull            # si trabajas con git
npm run setup
npm test
npm run deploy      # conserva data/
```

Reinicia Ulanzi Studio.

## 8. Desinstalar

1. Cierra Ulanzi Studio.
2. Borra la carpeta:
   ```
   %APPDATA%\Ulanzi\UlanziDeck\Plugins\com.dose.ledcontrol.ulanziPlugin
   ```
3. Vuelve a abrir la app. Las teclas del perfil quedarán vacías o con error de
   acción; elimínalas del perfil.

El plugin no escribe nada fuera de su carpeta (`data/`). No instala servicios ni
tareas programadas.

## 9. Restablecer ajustes

- Desde el PI de Settings: **Reset** (vuelve a la MAC por defecto y la paleta
  original).
- O manualmente: cierra Ulanzi Studio y borra
  `…\com.dose.ledcontrol.ulanziPlugin\data\settings.json` y
  `protocol-cache.json`.

## 10. Copiar a otro PC

Copia el proyecto (o solo la carpeta del plugin ya desplegada) y ejecuta
`npm run setup` + `npm run deploy` en el destino. La configuración viaja en
`data/settings.json`; la caché de protocolo se regenera sola.

## 11. Rutas de referencia

| Qué | Dónde |
|---|---|
| Plugin desplegado | `%APPDATA%\Ulanzi\UlanziDeck\Plugins\com.dose.ledcontrol.ulanziPlugin` |
| Ajustes | `…\data\settings.json` |
| Caché de protocolo | `…\data\protocol-cache.json` |
| Log del puente | `…\data\bridge.log` (rota a 1 MB) |
| Logs de Ulanzi | `%APPDATA%\Ulanzi\UlanziDeck\logs` |
| Proyecto | carpeta donde clonaste el repositorio |
