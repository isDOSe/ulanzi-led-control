# Third-party licenses

This plugin bundles the following third-party code.

## UlanziDeck Plugin SDK

- Files: `plugin/sdk/` (`plugin-common-node`), `libs/` (`plugin-common-html`)
- Source: https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK
- License: Apache License 2.0
- Copyright: Ulanzi Technology

The SDK is vendored unmodified, except that the Property Inspector CSS is
loaded alongside this plugin's own `property-inspector/pi.css`.

Full license texts are kept in the repository at
`docs/LICENSE-plugin-common-node.txt` and `docs/LICENSE-plugin-common-html.txt`.

## led-control

- Files: `backend/led_protocol.py` (adapted)
- Source: local project `D:\projects\led-control`
- License: MIT
- Copyright (c) 2026 Ernesto Flames (DOSe)

Only the frame builders and protocol detection table were carried over; the
bridge, caching and command layer are new.

## bleak

- Installed by the user (`pip install bleak`), not distributed with this plugin.
- License: MIT
- Source: https://github.com/hbldh/bleak

## ws

- Files: `node_modules/ws/`
- License: MIT
- Source: https://github.com/websockets/ws
