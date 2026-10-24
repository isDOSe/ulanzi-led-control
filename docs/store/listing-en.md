# Store listing — DOSe LED Control (EN)

Copy and paste into **Ulanzi Workshop → Upload Works → Plugins**.
Plugin version: **0.1.2**.

## Title

```
DOSe LED Control
```

## Summary

```
Color, power and brightness keys for your Bluetooth RGB LED strip, straight from the deck. No apps, no cloud.
```

## Description

```
Turn your Ulanzi D200H into a light panel. DOSe LED Control adds color, power, brightness and settings keys for RGB LED strips and lamps controlled over Bluetooth LE (7E…EF protocol: ELK-BLEDOM, LEDBLE/JDY, Magic Blue and clones).

Every color key IS the color: it renders the chosen hex, shows the label and marks the last applied one. Hold a key to cycle the global palette and save the new color on that key. The settings key scans for BLE devices, stores the MAC once, edits the palette and keep-alive, and shows the live connection/protocol. Power toggles the lamp; Brightness sets, steps or cycles the level.

How it works: the deck sends the press to Ulanzi Studio; the plugin talks over a local channel to a small persistent BLE bridge that keeps the link alive and writes the 7E…EF frame. Everything runs on your PC: no account, no cloud, no telemetry. The default MAC is C0:00:00:23:0E:D8 and can be changed from Settings with a BLE scan.

Requirements: Windows 10/11, Ulanzi Studio 3.4+ and, in this beta, Python 3.10+ with bleak (pip install bleak). The app auto-detects Python and lets you set the path manually. The stable release will bundle the bridge so Python is not required.

Made by Ernesto Flames “DOSe” · www.isdose.com
```

## Requirements

```
Windows 10/11 · Ulanzi Studio 3.4+ · Python 3.10+ with bleak (beta) · Bluetooth LE enabled · D200/D200H/D200X (keypad)
```

## Privacy

```
100% local. No accounts, no telemetry, no network requests. The plugin only talks to the lamp over Bluetooth LE on your machine.
```

## Author, website and support

```
Ernesto Flames “DOSe” — https://www.isdose.com
```

## Metadata

| Field | Value |
|---|---|
| Category | Tools |
| Version | 0.1.2 |
| System | Windows 10 / 11 |
| Devices | D200, D200H, D200X (keypad) |
| Languages | Spanish, English |
| License | MIT |
| Tags | LED, RGB, Bluetooth, BLE, lighting, smart home, D200H |
| Additional link | https://www.isdose.com |
