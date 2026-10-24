<div align="center">

<img src="docs/store/assets/icon-1024x1024.png" width="92" alt="DOSe LED Control icon" />

<h1>DOSe LED Control</h1>

<p><strong>Turn your Bluetooth RGB strip into physical keys on your Ulanzi deck.</strong><br />
One button, one color. No phone app, no account, no cloud.</p>

<p>
  <a href="README.md">🇪🇸 Español</a> ·
  <a href="https://isdose.github.io/ulanzi-led-control/">Website</a> ·
  <a href="#install">Install</a> ·
  <a href="#screenshots">Screenshots</a> ·
  <a href="docs/INSTALL.md">Full guide</a> ·
  <a href="https://www.isdose.com">www.isdose.com</a>
</p>

<p>
  <img alt="Version 0.1.2" src="https://img.shields.io/badge/version-0.1.2-00C7BE?style=flat-square" />
  <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-FFB020?style=flat-square" />
  <img alt="Windows 10/11" src="https://img.shields.io/badge/platform-Windows%2010%2F11-16161D?style=flat-square" />
  <img alt="Ulanzi Studio 3.4+" src="https://img.shields.io/badge/Ulanzi%20Studio-3.4%2B-16161D?style=flat-square" />
  <img alt="Python 3.10+" src="https://img.shields.io/badge/Python-3.10%2B-16161D?style=flat-square" />
  <a href="https://github.com/isDOSe/ulanzi-led-control/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/isDOSe/ulanzi-led-control/actions/workflows/ci.yml/badge.svg" /></a>
</p>

<img src="docs/store/assets/cover-2400x1200.png" alt="DOSe LED Control on an Ulanzi D200H: color, power, brightness and status keys" width="100%" />

</div>

> [!NOTE]
> **Beta 0.1.2** — protocol, BLE services and writes verified against a real
> lamp (`LEDBLE-00-D80E`, `ffe0/ffe1`, `write-without-response`). Gesture and
> latency validation on the D200H is still open. See
> [`docs/TESTING.md`](docs/TESTING.md) (Spanish).

---

## The idea

Cheap RGB strips come with a phone app that takes ages to connect, forgets the
device and never remembers your favorite color. Meanwhile, your **Ulanzi D200H**
has 13 LCD keys sitting right in front of you.

This plugin turns the deck into the light panel the lamp should have shipped
with:

- **Every color key is its color**, with its label and hex code visible.
- A normal press applies it; a **long press** cycles the global palette and
  saves the new color on that key.
- A **persistent BLE bridge** keeps the link warm, so pressing a key does not
  pay the 1–4 s scan-and-connect cost every time.
- **Everything runs on your PC.** No account, no cloud, no telemetry.

## What you get

| Action | What it does | Long press |
|---|---|---|
| **Color** | Applies the configured color (optional brightness and auto power-on) | Cycles the global palette and saves the new color on that key |
| **Power** | Turns the lamp on / off | — |
| **Brightness** | Fixed level, step up/down or 25→50→75→100 cycle | — |
| **Settings & Status** | Shows MAC, protocol and live state; press to reconnect | Restarts the BLE bridge |

Color keys draw a ring around the last applied color and warn when the bridge
is down. The settings key shows live status: **green** connected, **amber**
searching, **red** error.

## Screenshots

<p align="center">
  <img src="docs/store/assets/screenshot-1-2196x1464.png" alt="Color key property inspector" width="49%" />
  <img src="docs/store/assets/screenshot-2-2196x1464.png" alt="Settings inspector: MAC, palette, keep-alive and status" width="49%" />
</p>
<p align="center">
  <img src="docs/store/assets/screenshot-3-2196x1464.png" alt="Generated color keys" width="100%" />
</p>

<p align="center">
  <a href="docs/key-preview.html"><strong>→ See every key at real size (interactive preview)</strong></a>
</p>

## Install

### Requirements

- **Windows 10/11** (this release targets Windows only).
- **Ulanzi Studio 3.4+** (tested with 3.4.4) with the D200H connected.
- **Python 3.10+** with [`bleak`](https://github.com/hbldh/bleak):
  ```powershell
  pip install bleak
  ```
- **Node.js** only for development; Ulanzi Studio already bundles its Node 20
  runtime.

### From the ZIP

1. Download `com.dose.ledcontrol.ulanziPlugin-0.1.2.zip` from
   [Releases](https://github.com/isDOSe/ulanzi-led-control/releases/latest).
2. Extract the `com.dose.ledcontrol.ulanziPlugin` folder into
   `%APPDATA%\Ulanzi\UlanziDeck\Plugins\`.
3. Install `bleak` and restart Ulanzi Studio.

### From source

```powershell
git clone https://github.com/isDOSe/ulanzi-led-control.git
cd ulanzi-led-control

npm run setup     # installs ws inside the plugin
npm test          # validator + protocol, render, bridge and identity tests
npm run deploy    # copies the plugin to %APPDATA%\Ulanzi\UlanziDeck\Plugins
```

Restart **Ulanzi Studio** completely (the main service is a long-running Node
process; closing the panel does not reload the code).

### First run

1. Drag **Settings & Status** onto a key.
2. Open its panel, press **Scan** and pick your lamp (or keep the example MAC).
3. **Save settings** → **Reconnect**. The key should turn green.
4. Add **Color** keys, pick a color and label, and try **Test on light**.

Step-by-step guide, updates and uninstall: [`docs/INSTALL.md`](docs/INSTALL.md).

## How it works

```
┌──────────┐   USB   ┌────────────────────┐   WebSocket   ┌─────────────────┐
│  D200H   │────────►│  Ulanzi Studio     │◄─────────────►│ plugin/app.js   │
└──────────┘         └────────────────────┘               │  (Node 20)      │
                                                          └────────┬────────┘
                                                                   │ stdio NDJSON
                                                          ┌────────▼────────┐
                                                          │ ble_bridge.py   │
                                                          │ (Python/bleak)  │
                                                          └────────┬────────┘
                                                                   │ BLE GATT
                                                              ┌────▼────┐
                                                              │  Strip  │
                                                              └─────────┘
```

The bridge starts with the plugin and keeps the BLE connection open. Each press
is an NDJSON message; the bridge writes the `7E … EF` frame and returns the new
state. If BLE gets stuck, the bridge restarts without touching the plugin.
Details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and
[`docs/BLE-PROTOCOL.md`](docs/BLE-PROTOCOL.md).

## Compatibility

Built for cheap BLE controllers from the `led-control` family:

| Family | Service / characteristic | Protocol |
|---|---|---|
| ELK-BLEDOM | `fff0` / `fff3` (or `fff1`) | `7E … EF` |
| LEDBLE / JDY | `ffe0` / `ffe1` | `7E … EF` |
| LED LAMP (custom) | `305bdd41-…` | `7E … EF` |
| Magic Blue | `ffe5` / `ffe9` | `56 … AA` |
| Generic clones | first writable characteristic | `7E … EF` |

The protocol is detected automatically and cached per MAC, so the next
connection is instant. If your lamp does not show up, check
[`docs/BLE-PROTOCOL.md`](docs/BLE-PROTOCOL.md) and open an issue with the model.

## Settings

- **Bluetooth MAC**: stored once. **Scan** lists devices with RSSI and tags
  likely LED strips.
- **Palette**: colors cycled by long press (2–24).
- **Keep-alive**: keeps the link warm (30 s by default). Set it to 0 if your
  controller blinks while idle.
- **Python executable**: only if auto-detection fails.
- **Mock mode**: simulates the lamp to try the UI without Bluetooth.
- **Verbose bridge logs** + **Open data folder** for debugging.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "Python not found" | Install Python 3.10+ and check *Add to PATH*, or set the path in Settings → Advanced. |
| "bleak is not installed" | `pip install bleak` with **the same Python** the plugin uses (the status panel shows which one). |
| Settings key is red | Press it to reconnect; check `bridge.log`. |
| Lamp missing from Scan | Power it on, move closer, close the phone app holding the connection. |
| First press is slow | Normal if the lamp was asleep; keep-alive avoids it. |
| It blinks while idle | Set keep-alive to 0 in Advanced. |
| Code changes do nothing | Restart Ulanzi Studio: the Node service does not hot-reload. |
| Color is not exact | Cheap RGB LED; fine-tune brightness with **Brightness override**. |

Testing checklist and advanced debugging: [`docs/TESTING.md`](docs/TESTING.md).

## Development

```powershell
npm run setup        # plugin dependencies (ws)
npm test             # validator + 10 checks + identity test
npm run test:py      # exact BLE frames (unittest)
npm run preview      # rebuild docs/key-preview.html
npm run assets       # icon, cover, banners and store screenshots
npm run package      # dist/com.dose.ledcontrol.ulanziPlugin-<version>.zip
npm run bridge       # real bridge in the console
npm run bridge:mock  # simulated bridge
npm run deploy       # copy to APPDATA keeping data/
```

### Layout

```
ulanzi-led-control/
├─ com.dose.ledcontrol.ulanziPlugin/   ← the deployable plugin
│  ├─ manifest.json
│  ├─ en.json / es_ES.json
│  ├─ assets/icons/                    ← SVG icons
│  ├─ plugin/
│  │  ├─ app.js                        ← main service (actions + PI bus)
│  │  ├─ bridge.js                     ← NDJSON client for the Python bridge
│  │  ├─ render.js                     ← key art (SVG)
│  │  ├─ settings.js                   ← global settings + helpers
│  │  ├─ actions/                      ← color, power, brightness, settings
│  │  └─ sdk/                          ← UlanziDeck SDK (Apache-2.0)
│  ├─ property-inspector/              ← configuration UI
│  ├─ backend/
│  │  ├─ ble_bridge.py                 ← persistent BLE bridge
│  │  ├─ led_protocol.py               ← 7E…EF frames + UUID table
│  │  └─ test_led_protocol.py
│  ├─ libs/                            ← HTML SDK (PI) + assets
│  └─ data/                            ← settings.json, cache, logs (runtime)
├─ tools/                              ← deploy, tests, preview, assets, package
└─ docs/                               ← architecture, protocol, guides, store
```

Runtime data lives in
`%APPDATA%\Ulanzi\UlanziDeck\Plugins\com.dose.ledcontrol.ulanziPlugin\data\`:
`bridge.log` (BLE), `plugin.log` (events), `settings.json`,
`action-params.json` and `protocol-cache.json`.

## Documentation

- [`docs/PLAN.md`](docs/PLAN.md) — decisions, scope and acceptance criteria.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — what comes next.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — components and internals.
- [`docs/BLE-PROTOCOL.md`](docs/BLE-PROTOCOL.md) — frames, UUIDs and detection.
- [`docs/TESTING.md`](docs/TESTING.md) — automated and manual tests.
- [`docs/INSTALL.md`](docs/INSTALL.md) — detailed installation.
- [`docs/PUBLISHING.md`](docs/PUBLISHING.md) — Ulanzi Workshop publishing.
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — release history.
- [`docs/store/`](docs/store/README.md) — ES/EN store listing and assets.

The docs are written in Spanish; the UI is available in Spanish and English.

## Roadmap

- **0.1.3** — validate gestures and latency on the D200H, tune keep-alive.
- **0.2.0** — effects, white/temperature, status key and double press.
- **0.3.0** — multiple lamps, D200X encoders, scenes.
- **1.0.0** — installer without Python, CI and verified macOS support.

Priorities in [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Privacy

The plugin opens no network connections, asks for no account and sends no
telemetry. It only talks to your lamp over Bluetooth LE and writes its settings
and logs inside its own `data/` folder.

## Contributing

Got another BLE strip, a D200X or an idea? Issues and PRs are welcome: read
[`CONTRIBUTING.md`](CONTRIBUTING.md) to set up the environment and run the
tests. If the plugin is useful to you, **leave a star** ⭐ — it helps other
people find it.

## License

[MIT](LICENSE) © 2026 Ernesto Flames (DOSe) · [www.isdose.com](https://www.isdose.com)

The Ulanzi SDK is distributed under Apache-2.0; see
[`THIRD-PARTY-LICENSES.md`](com.dose.ledcontrol.ulanziPlugin/THIRD-PARTY-LICENSES.md).

<div align="center">
  <sub>Built with care and far too much color testing · <a href="https://www.isdose.com">isdose.com</a></sub>
</div>
