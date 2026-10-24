#!/usr/bin/env python3
"""
ble_bridge.py — persistent BLE bridge for the Ulanzi LED Control plugin.

The Node.js part of the plugin speaks NDJSON over stdin/stdout:

    -> {"id": 1, "cmd": "color", "params": {"hex": "#FF3B30"}}
    <- {"id": 1, "ok": true, "state": {...}}

The bridge keeps one BleakClient alive so pressing a deck key is fast.
Protocol detection is cached per MAC in <data-dir>/protocol-cache.json.

Extras:
    --mock        no Bluetooth; every command is logged and acknowledged
    --debug       verbose logging to stderr as well as <data-dir>/bridge.log
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import queue
import sys
import threading
import time
from pathlib import Path
from typing import Any, Optional

from led_protocol import (
    DEFAULT_PALETTE,
    EFFECTS,
    GENERIC_PROTOCOL,
    PROTOCOLS,
    Protocol,
)

VERSION = "0.1.0"
CONNECT_TIMEOUT = 15.0
WRITE_TIMEOUT = 8.0

log = logging.getLogger("led-bridge")

try:  # bleak is only needed for real hardware
    from bleak import BleakClient, BleakScanner  # type: ignore
    from bleak.exc import BleakError  # type: ignore
    BLEAK_IMPORTED = True
except Exception as exc:  # pragma: no cover - only hit on broken installs
    BleakClient = None  # type: ignore
    BleakScanner = None  # type: ignore
    BleakError = Exception  # type: ignore
    BLEAK_IMPORTED = False
    BLEAK_IMPORT_ERROR = str(exc)


# ─────────────────────────────── logging ───────────────────────────────

def setup_logging(data_dir: Path, debug: bool) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    log_file = data_dir / "bridge.log"
    try:
        if log_file.exists() and log_file.stat().st_size > 1_000_000:
            backup = data_dir / "bridge.log.1"
            if backup.exists():
                backup.unlink()
            log_file.rename(backup)
    except OSError:
        pass

    fmt = logging.Formatter("%(asctime)s %(levelname)-7s %(message)s", "%Y-%m-%d %H:%M:%S")
    handlers: list[logging.Handler] = [logging.FileHandler(log_file, encoding="utf-8")]
    if debug:
        stream = logging.StreamHandler(sys.stderr)
        stream.setFormatter(fmt)
        handlers.append(stream)
    root = logging.getLogger()
    root.handlers.clear()
    for handler in handlers:
        handler.setFormatter(fmt)
        root.addHandler(handler)
    root.setLevel(logging.DEBUG if debug else logging.INFO)

    # Bridge log must never pollute stdout (it carries the protocol).
    sys.stdout.reconfigure(encoding="utf-8", newline="\n")  # type: ignore[attr-defined]
    sys.stderr.reconfigure(encoding="utf-8", newline="\n")  # type: ignore[attr-defined]


# ─────────────────────────────── helpers ───────────────────────────────

def clamp(value: Any, low: int = 0, high: int = 100, default: int = 50) -> int:
    try:
        number = int(round(float(value)))
    except (TypeError, ValueError):
        return default
    return max(low, min(high, number))


def parse_color(params: dict[str, Any]) -> tuple[int, int, int]:
    if "hex" in params and params["hex"]:
        raw = str(params["hex"]).strip().lstrip("#")
        if len(raw) == 3:
            raw = "".join(ch * 2 for ch in raw)
        if len(raw) != 6:
            raise ValueError(f"color inválido: {params['hex']!r}")
        try:
            return int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16)
        except ValueError as exc:
            raise ValueError(f"color inválido: {params['hex']!r}") from exc
    return (
        clamp(params.get("r"), 0, 255, 255),
        clamp(params.get("g"), 0, 255, 255),
        clamp(params.get("b"), 0, 255, 255),
    )


def hex_of(rgb: tuple[int, int, int]) -> str:
    return "#{:02X}{:02X}{:02X}".format(*rgb)


def looks_like_led(name: str) -> bool:
    keywords = ("led", "lamp", "ble", "elk", "magic", "rgb", "light", "bulb", "strip", "jd y")
    lowered = (name or "").lower()
    return any(keyword in lowered for keyword in keywords)


# ─────────────────────────────── bridge ───────────────────────────────

class Bridge:
    def __init__(self, data_dir: Path, mock: bool = False) -> None:
        self.data_dir = data_dir
        self.mock = mock
        self.address: Optional[str] = None
        self.client: Any = None
        self.protocol: Optional[Protocol] = None
        self.char: Any = None
        self.use_response = False
        self.connect_timeout = CONNECT_TIMEOUT
        self.keepalive_sec = 30
        self._lock = asyncio.Lock()
        self._last_connect_error: Optional[str] = None
        self._last_connect_attempt = 0.0
        self._last_write_at = 0.0
        self._keepalive_task: Optional[asyncio.Task] = None
        self._scanning = False
        self._cache_path = data_dir / "protocol-cache.json"
        self._cache = self._load_cache()
        self.state: dict[str, Any] = {
            "connected": False,
            "address": None,
            "protocol": None,
            "characteristic": None,
            "power": None,
            "rgb": None,
            "hex": None,
            "brightness": None,
            "white": None,
            "effect": None,
            "lastError": None,
            "lastWriteAt": None,
        }

    # ── persistence ────────────────────────────────────────────────

    def _load_cache(self) -> dict[str, Any]:
        try:
            return json.loads(self._cache_path.read_text(encoding="utf-8"))
        except Exception:
            return {}

    def _save_cache(self) -> None:
        try:
            self._cache_path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self._cache_path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self._cache, indent=2), encoding="utf-8")
            tmp.replace(self._cache_path)
        except OSError as exc:
            log.warning("no se pudo guardar protocol-cache.json: %s", exc)

    def _cached_protocol(self) -> Optional[Protocol]:
        entry = self._cache.get((self.address or "").upper())
        if not entry:
            return None
        for proto in PROTOCOLS:
            if proto.name == entry.get("protocol"):
                return proto
        return None

    # ── connection ─────────────────────────────────────────────────

    async def ensure_connected(self) -> None:
        if self.mock:
            self.protocol = self.protocol or GENERIC_PROTOCOL
            self.char = self.char or "mock"
            self.state.update(connected=True, address=self.address or "MOCK",
                              protocol="Mock (sin Bluetooth)", characteristic="mock")
            return
        if self.client is not None and getattr(self.client, "is_connected", False):
            return

        async with self._lock:
            if self.client is not None and getattr(self.client, "is_connected", False):
                return
            if not self.address:
                raise RuntimeError("no hay MAC configurada")
            if not BLEAK_IMPORTED:
                raise RuntimeError(f"bleak no está instalado: {BLEAK_IMPORT_ERROR}")

            # Avoid hammering a powered-off lamp: back off for 4 s after a failure.
            if self._last_connect_error and (time.monotonic() - self._last_connect_attempt) < 4:
                raise RuntimeError(self._last_connect_error)

            self._last_connect_attempt = time.monotonic()
            log.info("conectando a %s…", self.address)
            client = BleakClient(self.address, timeout=self.connect_timeout)
            try:
                await asyncio.wait_for(client.connect(), timeout=self.connect_timeout)
            except Exception as exc:
                self._last_connect_error = f"no se pudo conectar a {self.address}: {exc}"
                log.warning(self._last_connect_error)
                try:
                    await client.disconnect()
                except Exception:
                    pass
                raise RuntimeError(self._last_connect_error) from exc

            self.client = client
            try:
                self.protocol, self.char, self.use_response = await self._detect(client)
            except Exception as exc:
                await self._drop("detección de protocolo fallida")
                raise RuntimeError(f"detección de protocolo fallida: {exc}") from exc

            self._last_connect_error = None
            self.state.update(
                connected=True,
                address=self.address,
                protocol=self.protocol.name,
                characteristic=str(self.char.uuid),
                lastError=None,
            )
            log.info("conectado: %s (%s)", self.address, self.protocol.name)
            # Some controllers drop the first frame written immediately after
            # service discovery; give WinRT/BlueZ a moment to settle.
            await asyncio.sleep(0.25)

    async def _detect(self, client: Any) -> tuple[Protocol, Any, bool]:
        writable: list[Any] = []
        for service in client.services:
            for char in service.characteristics:
                props = [str(p).lower() for p in char.properties]
                if "write" in props or "write-without-response" in props:
                    writable.append(char)

        if not writable:
            raise RuntimeError("el dispositivo no expone características de escritura")

        def props_of(char: Any) -> list[str]:
            return [str(p).lower() for p in char.properties]

        cached = self._cached_protocol()
        ordered = ([cached] if cached else []) + [p for p in PROTOCOLS if p is not cached]
        for proto in ordered:
            for char in writable:
                if str(char.uuid).lower() == proto.characteristic_uuid.lower():
                    use_response = "write" in props_of(char) and "write-without-response" not in props_of(char)
                    if proto is not cached:
                        self._remember(proto)
                    return proto, char, use_response

        # Unknown clone: keep the 7E…EF frames on the first writable char.
        char = writable[0]
        use_response = "write" in props_of(char) and "write-without-response" not in props_of(char)
        self._remember(GENERIC_PROTOCOL, characteristic=str(char.uuid))
        log.warning("protocolo desconocido; usando 7E…EF sobre %s", char.uuid)
        return GENERIC_PROTOCOL, char, use_response

    def _remember(self, proto: Protocol, characteristic: Optional[str] = None) -> None:
        if not self.address:
            return
        entry = {"protocol": proto.name, "characteristic": characteristic or proto.characteristic_uuid}
        if self._cache.get(self.address.upper()) != entry:
            self._cache[self.address.upper()] = entry
            self._save_cache()

    async def _drop(self, reason: str) -> None:
        log.info("desconectando: %s", reason)
        client, self.client = self.client, None
        self.char = None
        if client is not None:
            try:
                await client.disconnect()
            except Exception:
                pass
        self.state["connected"] = False

    async def disconnect(self) -> None:
        await self._drop("petición explícita")

    async def _write(self, data: bytes, retry: bool = True) -> None:
        if self.mock:
            log.info("[mock] write %s", data.hex(" ").upper())
            self._last_write_at = time.monotonic()
            self.state["lastWriteAt"] = time.time()
            return

        await self.ensure_connected()
        assert self.client is not None and self.char is not None
        log.debug("write %s (response=%s)", data.hex(" ").upper(), self.use_response)
        try:
            await asyncio.wait_for(
                self.client.write_gatt_char(self.char, data, response=self.use_response),
                timeout=WRITE_TIMEOUT,
            )
        except Exception as exc:
            log.warning("escritura fallida (%s): %s", type(exc).__name__, exc)
            # The link may have dropped while the lamp slept; retry once from scratch.
            self._cache.pop((self.address or "").upper(), None)
            self._save_cache()
            await self._drop("fallo de escritura")
            if not retry:
                raise
            await self.ensure_connected()
            assert self.client is not None and self.char is not None
            await asyncio.wait_for(
                self.client.write_gatt_char(self.char, data, response=self.use_response),
                timeout=WRITE_TIMEOUT,
            )
        self._last_write_at = time.monotonic()
        self.state["lastWriteAt"] = time.time()

    # ── commands ───────────────────────────────────────────────────

    async def cmd_status(self, params: dict[str, Any]) -> dict[str, Any]:
        if not self.mock and self.client is not None:
            self.state["connected"] = bool(getattr(self.client, "is_connected", False))
        if self.protocol and not self.state.get("protocol"):
            self.state["protocol"] = self.protocol.name
        return {"state": self.state, "bleak": BLEAK_IMPORTED or self.mock, "version": VERSION,
                "mock": self.mock}

    async def cmd_set_config(self, params: dict[str, Any]) -> dict[str, Any]:
        address = params.get("address")
        if address is not None:
            normalized = str(address).strip().upper()
            if normalized != (self.address or "").upper():
                await self._drop("cambio de MAC")
                self.address = normalized or None
                self.state["address"] = self.address
                self.state.update(connected=False, protocol=None, characteristic=None)
        self.connect_timeout = float(params.get("connectTimeout") or CONNECT_TIMEOUT)
        self.keepalive_sec = int(params.get("keepaliveSec") or 0)
        if params.get("palette"):
            pass  # palette lives on the Node side; accepted for compatibility

        if params.get("autoconnect") and self.address and not self.mock:
            asyncio.create_task(self._background_connect())
        return {"state": self.state}

    async def _background_connect(self) -> None:
        try:
            await self.ensure_connected()
            await self._emit_state()
        except Exception as exc:
            log.info("auto-conexión no disponible: %s", exc)

    async def cmd_connect(self, params: dict[str, Any]) -> dict[str, Any]:
        if "address" in params and params["address"]:
            self.address = str(params["address"]).strip().upper()
            self.state["address"] = self.address
        await self.ensure_connected()
        await self._emit_state()
        return {"state": self.state}

    async def cmd_disconnect(self, params: dict[str, Any]) -> dict[str, Any]:
        await self.disconnect()
        await self._emit_state()
        return {"state": self.state}

    async def cmd_power(self, params: dict[str, Any]) -> dict[str, Any]:
        on = bool(params.get("on", True))
        log.info("power %s", "ON" if on else "OFF")
        await self._send_power(on)
        return {"state": self.state}

    async def cmd_toggle(self, params: dict[str, Any]) -> dict[str, Any]:
        current = self.state.get("power")
        on = not bool(current) if current is not None else True
        await self._send_power(on)
        return {"state": self.state}

    async def cmd_color(self, params: dict[str, Any]) -> dict[str, Any]:
        r, g, b = parse_color(params)
        brightness = params.get("brightness")
        power_on = params.get("powerOn", True)
        log.info(
            "color %s (brillo=%s, powerOn=%s)",
            hex_of((r, g, b)),
            "sí" if brightness is not None else "no",
            power_on,
        )
        await self.ensure_connected()

        if power_on and self.state.get("power") is not True:
            await self._send_power(True, remember=False)
            await asyncio.sleep(0.12)

        # Brightness first, then the RGB frame last: on cheap controllers the
        # dimming command can reset the colour mode, so the hue must be final.
        if brightness is not None:
            level = clamp(brightness)
            await self._write(self.protocol.brightness(level))  # type: ignore[union-attr]
            await asyncio.sleep(0.08)
            self.state["brightness"] = level

        await self._write(self.protocol.rgb(r, g, b))  # type: ignore[union-attr]
        self.state.update(power=True, rgb=[r, g, b], hex=hex_of((r, g, b)), lastError=None)
        return {"state": self.state}

    async def cmd_brightness(self, params: dict[str, Any]) -> dict[str, Any]:
        level = clamp(params.get("level"))
        log.info("brightness %d", level)
        await self._write(self.protocol.brightness(level))  # type: ignore[union-attr]
        self.state["brightness"] = level
        return {"state": self.state}

    async def cmd_white(self, params: dict[str, Any]) -> dict[str, Any]:
        level = clamp(params.get("level"))
        log.info("white %d", level)
        await self._write(self.protocol.white(level))  # type: ignore[union-attr]
        self.state.update(power=True, white=level, rgb=None, hex=None)
        return {"state": self.state}

    async def cmd_effect(self, params: dict[str, Any]) -> dict[str, Any]:
        name = str(params.get("name") or "").strip()
        code = int(params.get("code") or EFFECTS.get(name) or 0)
        if not code:
            raise ValueError(f"efecto desconocido: {name!r}")
        speed = clamp(params.get("speed", 50))
        if self.protocol is None or self.protocol.effect is None:
            raise RuntimeError(f"{self.protocol.name if self.protocol else 'protocolo'} no soporta efectos")
        await self._write(self.protocol.effect(code, speed))
        self.state.update(power=True, effect={"name": name or hex(code), "speed": speed})
        return {"state": self.state}

    async def _send_power(self, on: bool, remember: bool = True) -> None:
        await self._write(self.protocol.power(on))  # type: ignore[union-attr]
        if remember:
            self.state["power"] = on
            self.state["lastError"] = None

    async def cmd_scan(self, params: dict[str, Any]) -> dict[str, Any]:
        timeout = float(params.get("timeout") or 8)
        if self.mock:
            return {"devices": [
                {"name": "LEDBLE-00-D80E", "address": "C0:00:00:23:0E:D8", "rssi": -52, "likely": True},
                {"name": "Mock Strip", "address": "AA:BB:CC:DD:EE:FF", "rssi": -71, "likely": True},
            ]}
        if not BLEAK_IMPORTED:
            raise RuntimeError(f"bleak no está instalado: {BLEAK_IMPORT_ERROR}")
        if self._scanning:
            raise RuntimeError("ya hay un escaneo en curso")
        self._scanning = True
        try:
            await self._drop("escaneo BLE")
            devices = []
            try:
                discovered = await BleakScanner.discover(timeout=timeout, return_adv=True)  # type: ignore[call-arg]
                # bleak >= 0.19 returns {address: (device, advertisement_data)}
                iterable = discovered.values() if isinstance(discovered, dict) else discovered
                for item in iterable:
                    if isinstance(item, tuple):
                        device, advertisement = item
                        devices.append((device, getattr(advertisement, "rssi", None)))
                    else:
                        devices.append((item, getattr(item, "rssi", None)))
            except TypeError:
                found = await BleakScanner.discover(timeout=timeout)  # type: ignore[call-arg]
                devices = [(device, getattr(device, "rssi", None)) for device in found]

            result = []
            for device, rssi in devices:
                name = getattr(device, "name", None) or ""
                result.append({
                    "name": name,
                    "address": device.address,
                    "rssi": rssi if isinstance(rssi, int) else None,
                    "likely": looks_like_led(name),
                })
            result.sort(key=lambda d: (not d["likely"], -(d["rssi"] if d["rssi"] is not None else -999), d["name"].lower()))
            log.info("escaneo: %d dispositivos", len(result))
            return {"devices": result}
        finally:
            self._scanning = False

    async def cmd_identify(self, params: dict[str, Any]) -> dict[str, Any]:
        await self.ensure_connected()
        if self.mock:
            return {"services": [{"uuid": "mock", "characteristics": [
                {"uuid": "mock", "properties": ["write-without-response"]}]}]}
        services = []
        for service in self.client.services:  # type: ignore[union-attr]
            services.append({
                "uuid": str(service.uuid),
                "description": getattr(service, "description", ""),
                "characteristics": [
                    {"uuid": str(char.uuid), "properties": [str(p) for p in char.properties]}
                    for char in service.characteristics
                ],
            })
        return {"services": services, "protocol": self.protocol.name if self.protocol else None,
                "characteristic": str(self.char.uuid) if self.char else None}

    async def cmd_raw(self, params: dict[str, Any]) -> dict[str, Any]:
        data = params.get("hex") or ""
        payload = bytes.fromhex(str(data).replace(" ", ""))
        await self._write(payload)
        return {"sent": payload.hex(" ").upper(), "state": self.state}

    async def cmd_shutdown(self, params: dict[str, Any]) -> dict[str, Any]:
        return {"bye": True}

    # ── dispatch ───────────────────────────────────────────────────

    async def handle(self, request: dict[str, Any]) -> dict[str, Any]:
        cmd = str(request.get("cmd") or "")
        params = request.get("params") or {}
        handlers = {
            "ping": lambda p: self._ping(),
            "status": self.cmd_status,
            "setConfig": self.cmd_set_config,
            "connect": self.cmd_connect,
            "disconnect": self.cmd_disconnect,
            "power": self.cmd_power,
            "toggle": self.cmd_toggle,
            "color": self.cmd_color,
            "brightness": self.cmd_brightness,
            "white": self.cmd_white,
            "effect": self.cmd_effect,
            "scan": self.cmd_scan,
            "identify": self.cmd_identify,
            "raw": self.cmd_raw,
            "shutdown": self.cmd_shutdown,
        }
        handler = handlers.get(cmd)
        if handler is None:
            raise ValueError(f"comando desconocido: {cmd!r}")
        result = handler(params)
        if asyncio.iscoroutine(result):
            result = await result
        return result  # type: ignore[return-value]

    def _ping(self) -> dict[str, Any]:
        return {"pong": True, "version": VERSION, "mock": self.mock,
                "bleak": BLEAK_IMPORTED or self.mock}

    # ── keepalive ──────────────────────────────────────────────────

    async def keepalive_loop(self) -> None:
        while True:
            await asyncio.sleep(5)
            try:
                if (self.keepalive_sec <= 0 or not self.address or self.mock):
                    continue
                if self.state.get("power") is not True:
                    continue
                if not (self.client and getattr(self.client, "is_connected", False)):
                    continue
                if time.monotonic() - self._last_write_at < self.keepalive_sec:
                    continue
                log.debug("keepalive")
                await self._send_power(True, remember=False)
            except Exception as exc:
                log.debug("keepalive falló: %s", exc)

    async def emit_state(self) -> None:
        await self._emit_state()

    async def _emit_state(self) -> None:
        await emit({"event": "state", "state": self.state})


# ─────────────────────────────── io plumbing ───────────────────────────────

_write_lock = asyncio.Lock()


async def emit(payload: dict[str, Any]) -> None:
    line = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    async with _write_lock:
        sys.stdout.write(line + "\n")
        sys.stdout.flush()


def stdin_reader(target: "queue.Queue[Optional[str]]") -> None:
    for line in sys.stdin:
        target.put(line)
    target.put(None)


async def main_async(args: argparse.Namespace) -> int:
    data_dir = Path(args.data_dir).expanduser().resolve()
    setup_logging(data_dir, args.debug)
    log.info("bridge %s arrancando (python %s, mock=%s)", VERSION, sys.version.split()[0], args.mock)
    if not BLEAK_IMPORTED and not args.mock:
        log.error("bleak no está disponible: %s", BLEAK_IMPORT_ERROR)

    bridge = Bridge(data_dir, mock=args.mock)
    if args.address:
        bridge.address = args.address.strip().upper()
        bridge.state["address"] = bridge.address

    await emit({
        "event": "ready",
        "version": VERSION,
        "pid": os.getpid(),
        "mock": args.mock,
        "bleak": BLEAK_IMPORTED or args.mock,
        "python": sys.version.split()[0],
    })

    inbox: "queue.Queue[Optional[str]]" = queue.Queue()
    threading.Thread(target=stdin_reader, args=(inbox,), daemon=True).start()

    keepalive = asyncio.create_task(bridge.keepalive_loop())
    loop = asyncio.get_running_loop()

    try:
        while True:
            line = await loop.run_in_executor(None, inbox.get)
            if line is None:
                log.info("stdin cerrado; saliendo")
                break
            line = line.strip()
            if not line:
                continue
            try:
                request = json.loads(line)
            except json.JSONDecodeError as exc:
                log.warning("json inválido: %s", exc)
                await emit({"id": None, "ok": False, "error": f"json inválido: {exc}"})
                continue

            request_id = request.get("id")
            try:
                result = await bridge.handle(request)
                await emit({"id": request_id, "ok": True, **(result or {})})
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                log.warning("comando %s falló: %s", request.get("cmd"), exc)
                bridge.state["lastError"] = str(exc)
                await emit({"id": request_id, "ok": False, "error": str(exc),
                            "state": bridge.state})
            if request.get("cmd") in ("shutdown",):
                break
    finally:
        keepalive.cancel()
        await bridge.disconnect()
        log.info("bridge terminado")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Ulanzi LED Control BLE bridge")
    parser.add_argument("--data-dir", required=True, help="plugin data directory")
    parser.add_argument("--address", default=None, help="optional MAC to preload")
    parser.add_argument("--mock", action="store_true", help="no Bluetooth, log frames only")
    parser.add_argument("--debug", action="store_true", help="verbose logging")
    args = parser.parse_args()
    try:
        return asyncio.run(main_async(args))
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
