# Ficha de tienda — DOSe LED Control (ES)

Copia y pega estos campos en **Ulanzi Workshop → Upload Works → Plugins**.
Versión del plugin: **0.1.2**.

## Título

```
DOSe LED Control
```

## Resumen

```
Teclas de color, encendido y brillo para tu tira LED RGB por Bluetooth, directamente desde el deck. Sin apps, sin nube.
```

## Descripción

```
Convierte tu Ulanzi D200H en un panel de luz. DOSe LED Control añade teclas de color, encendido, brillo y ajustes para tiras y lámparas LED RGB controladas por Bluetooth LE (protocolo 7E…EF: ELK-BLEDOM, LEDBLE/JDY, Magic Blue y clones).

Cada tecla de color ES el color: se pinta con el hex elegido, muestra la etiqueta y marca la última aplicada. Mantén pulsada una tecla para recorrer la paleta global y guardar el nuevo color en esa tecla. La tecla de ajustes escanea dispositivos BLE, guarda la MAC una sola vez, permite editar la paleta y el keep-alive, y muestra el estado y el protocolo en vivo. La tecla Power enciende/apaga y la de Brillo fija, sube, baja o cicla el nivel.

Cómo funciona: el deck envía la pulsación a Ulanzi Studio; el plugin habla por un canal local con un pequeño puente BLE persistente, que mantiene la conexión y aplica la trama 7E…EF. Todo ocurre en tu PC: no hay cuenta, ni nube, ni telemetría. La MAC por defecto es C0:00:00:23:0E:D8 y se puede cambiar desde Ajustes con un escaneo BLE.

Requisitos: Windows 10/11, Ulanzi Studio 3.4+ y, en esta versión beta, Python 3.10+ con bleak (pip install bleak). La app detecta Python automáticamente y permite indicar la ruta manualmente. La versión estable incluirá el puente empaquetado para no requerir Python.

Hecho por Ernesto Flames “DOSe” · www.isdose.com
```

## Requisitos

```
Windows 10/11 · Ulanzi Studio 3.4+ · Python 3.10+ con bleak (beta) · Bluetooth LE activo · D200/D200H/D200X (teclado)
```

## Privacidad

```
100% local. El plugin no crea cuentas, no envía datos y no hace peticiones de red. Solo habla con la lámpara por Bluetooth LE en tu equipo.
```

## Autor, web y soporte

```
Ernesto Flames “DOSe” — https://www.isdose.com
```

## Metadatos

| Campo | Valor |
|---|---|
| Categoría | Tools |
| Versión | 0.1.2 |
| Sistema | Windows 10 / 11 |
| Dispositivos | D200, D200H, D200X (teclado) |
| Idiomas | Español, Inglés |
| Licencia | MIT |
| Etiquetas | LED, RGB, Bluetooth, BLE, lighting, smart home, D200H |
| Enlace adicional | https://www.isdose.com |
