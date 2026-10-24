# Protocolo BLE — `7E … EF`

Documentación de las tramas que usa el plugin y cómo se elige el
servicio/característica correctos. Basado en la ingeniería inversa de
`led-control` (ver créditos al final).

## 1. Formato de trama

Nueve bytes, delimitados por `7E` y `EF`:

```
7E 00 CMD SUB A1 A2 A3 00 EF
```

| Byte | Campo | Descripción |
|---|---|---|
| 0 | start | `0x7E` |
| 1 | pad | `0x00` |
| 2 | CMD | comando |
| 3 | SUB | subcomando / modo |
| 4–6 | args | R, G, B, nivel, velocidad… |
| 7 | pad | `0x00` |
| 8 | end | `0xEF` |

### Comandos usados

| Acción | CMD | SUB | Bytes exactos |
|---|---|---|---|
| Encender | `04` | `01` | `7E 00 04 01 00 00 00 00 EF` |
| Apagar | `04` | `00` | `7E 00 04 00 00 00 00 00 EF` |
| Color RGB | `05` | `03` | `7E 00 05 03 R G B 00 EF` |
| Blanco | `05` | `01` | `7E 00 05 01 nivel 00 00 00 EF` |
| Brillo | `01` | nivel | `7E 00 01 nivel 00 00 00 00 EF` |
| Velocidad de efecto | `02` | velocidad | `7E 00 02 velocidad 00 00 00 00 EF` |
| Efecto | `03` | código | `7E 00 03 código 03 velocidad 00 00 EF` |

Los valores están verificados en `backend/test_led_protocol.py`.

### Magic Blue (`56 … AA`)

| Acción | Bytes |
|---|---|
| Encender | `CC 23 33` |
| Apagar | `CC 24 33` |
| Color | `56 R G B 00 F0 AA` |
| Brillo | `56 00 00 00 (nivel·255/100) 0F AA` |
| Blanco | `56 00 00 00 nivel 0F AA` |

## 2. Servicios y características

Se prueban en este orden, emparejando la característica de escritura presente en
el dispositivo:

| # | Nombre | Service UUID | Characteristic | Notas |
|---|---|---|---|---|
| 1 | ELK-BLEDOM | `0000fff0-…` | `0000fff3-…` | el más común |
| 2 | ELK-BLEDOM | `0000fff0-…` | `0000fff1-…` | variante de escritura |
| 3 | LEDBLE / JDY | `0000ffe0-…` | `0000ffe1-…` | probado con `LEDBLE-00-D80E` |
| 4 | LED LAMP custom | `305bdd41-271f-4618-a1ea-0793da9e04ef` | mismo UUID | encontrado en el APK `com.ledlamp` |
| 5 | Magic Blue | `0000ffe5-…` | `0000ffe9-…` | tramas `56…AA` |
| — | Genérico | — | primera característica escribible | fallback `7E…EF` |

UUID base completo: `0000XXXX-0000-1000-8000-00805f9b34fb`.

## 3. Detección en el puente

```
connect(address)
  ├─ si hay caché para la MAC y su characteristic sigue siendo escribible → usarla
  ├─ enumerar características con write / write-without-response
  ├─ recorrer PROTOCOLS en orden y elegir la primera cuyo characteristic exista
  ├─ si no hay coincidencia → GENÉRICO con la primera escribible
  └─ guardar { protocol, characteristic } en data/protocol-cache.json
```

Ventajas frente a «escribir y ver si funciona»:

- No enciende la lámpara al conectar (evita efectos secundarios al abrir Ajustes).
- La detección es instantánea tras la primera vez.
- Si una escritura falla, se invalida la caché y se vuelve a detectar.

### Formato de la caché

```json
{
  "C0:00:00:23:0E:D8": {
    "protocol": "LEDBLE / JDY ffe0/ffe1",
    "characteristic": "0000ffe1-0000-1000-8000-00805f9b34fb"
  }
}
```

### Modo de escritura

`response=False` si la característica anuncia `write-without-response`; si solo
acepta `write`, se usa `response=True`. Eso evita timeouts en clones que no
implementan acuses.

## 4. Efectos (protocolo 1)

Códigos disponibles en `led_protocol.EFFECTS`:

| Grupo | Códigos |
|---|---|
| Colores fijos | `red 80`, `green 81`, `blue 82`, `yellow 83`, `cyan 84`, `magenta 85`, `white 86` |
| Salto | `jump_rgb 87`, `jump_rgbycmw 88` |
| Degradado | `gradient_rgb 89`, `gradient_rgbycmw 8A` |
| Degradado por color | `gradient_r 8B` … `gradient_w 91` |
| Degradado doble | `gradient_rg 92`, `gradient_rb 93`, `gradient_gb 94` |
| Parpadeo | `blink_rgbycmw 95`, `blink_r 96` … `blink_w 9C` |

El puente ya acepta `effect`; la UI los expondrá en v0.2.

## 5. Keep-alive

`7E 00 04 01 …` (encender) es idempotente y no cambia color ni efecto en los
controladores probados. El puente lo reenvía cada `keepaliveSec` (30 s por
defecto) **solo si**:

- hay dirección configurada y no estamos en mock,
- el último estado conocido es `power === true`,
- el cliente sigue conectado,
- no ha habido ninguna escritura en ese intervalo.

Objetivo: que el primer botón tras 10 minutos no pague 1–4 s de reconexión.
Si tu controlador parpadea o reinicia efectos, ponlo a 0 en Ajustes.

## 6. Limitaciones observadas

- Los clones ignoran el byte de `SUB` en algunos comandos; el plugin usa solo los
  documentados.
- La escala de brillo es 0–100 del firmware, no porcentaje de potencia lineal.
- El color percibido cambia con el brillo (LED barato); usa `Brightness override`.
- Algunos adaptadores Bluetooth de portátil tardan en liberar el dispositivo tras
  un cierre abrupto de Ulanzi Studio (espera unos segundos).
- Windows no expone la MAC en minúsculas de forma consistente: el puente
  normaliza a mayúsculas.

## 7. Créditos / referencias

- [`led-control`](https://github.com/isDOSe/led-control) — implementación original del protocolo y detección.
- [Reverse Engineering a Bluetooth Lightbulb — Uri Shaked](https://medium.com/@urish/reverse-engineering-a-bluetooth-lightbulb-56580fcb7546)
- [ble_rgb_led_strip_controller — arduino12](https://github.com/arduino12/ble_rgb_led_strip_controller)
- [bleak](https://github.com/hbldh/bleak) — BLE multiplataforma en Python.
