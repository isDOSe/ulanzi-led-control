"""
BLE LED protocols used by the Ulanzi LED Control plugin.

Adapted from D:\\projects\\led-control (MIT, Ernesto Flames / DOSe).
Only the pieces needed by the bridge live here: frame builders plus the
list of service/characteristic variants that are probed on connect.

Frame format (protocol 1, the common Chinese LED controller):

    7E 00 CMD SUB arg1 arg2 arg3 00 EF
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional

FrameBuilder = Callable[..., bytes]


def _frame(*parts: int) -> bytes:
    return bytes(parts)


# ── Protocol 1: 7E…EF (ELK-BLEDOM, LEDBLE, JDY/HM-10, most Chinese strips) ──

def p1_power(on: bool) -> bytes:
    return _frame(0x7E, 0x00, 0x04, 0x01 if on else 0x00, 0x00, 0x00, 0x00, 0x00, 0xEF)


def p1_rgb(r: int, g: int, b: int) -> bytes:
    return _frame(0x7E, 0x00, 0x05, 0x03, r & 0xFF, g & 0xFF, b & 0xFF, 0x00, 0xEF)


def p1_brightness(level: int) -> bytes:
    return _frame(0x7E, 0x00, 0x01, level & 0xFF, 0x00, 0x00, 0x00, 0x00, 0xEF)


def p1_white(level: int) -> bytes:
    return _frame(0x7E, 0x00, 0x05, 0x01, level & 0xFF, 0x00, 0x00, 0x00, 0xEF)


def p1_effect(effect: int, speed: int = 50) -> bytes:
    return _frame(0x7E, 0x00, 0x03, effect & 0xFF, 0x03, speed & 0xFF, 0x00, 0x00, 0xEF)


# ── Protocol 2: Magic Blue (56…AA) ──

def p2_power(on: bool) -> bytes:
    return bytes([0xCC, 0x23, 0x33]) if on else bytes([0xCC, 0x24, 0x33])


def p2_rgb(r: int, g: int, b: int) -> bytes:
    return bytes([0x56, r & 0xFF, g & 0xFF, b & 0xFF, 0x00, 0xF0, 0xAA])


def p2_brightness(level: int) -> bytes:
    return bytes([0x56, 0x00, 0x00, 0x00, int(level * 255 / 100) & 0xFF, 0x0F, 0xAA])


def p2_white(level: int) -> bytes:
    return bytes([0x56, 0x00, 0x00, 0x00, level & 0xFF, 0x0F, 0xAA])


@dataclass(frozen=True)
class Protocol:
    name: str
    service_uuid: str
    characteristic_uuid: str
    power: FrameBuilder
    rgb: FrameBuilder
    brightness: FrameBuilder
    white: FrameBuilder
    effect: Optional[FrameBuilder] = None
    # Human readable note for the settings/diagnostics UI
    note: str = ""


# Ordered by likelihood; the first writable characteristic that matches wins.
PROTOCOLS: tuple[Protocol, ...] = (
    Protocol(
        name="ELK-BLEDOM fff0/fff3",
        service_uuid="0000fff0-0000-1000-8000-00805f9b34fb",
        characteristic_uuid="0000fff3-0000-1000-8000-00805f9b34fb",
        power=p1_power, rgb=p1_rgb, brightness=p1_brightness, white=p1_white,
        effect=p1_effect, note="Most common 7E…EF controller",
    ),
    Protocol(
        name="ELK-BLEDOM fff0/fff1",
        service_uuid="0000fff0-0000-1000-8000-00805f9b34fb",
        characteristic_uuid="0000fff1-0000-1000-8000-00805f9b34fb",
        power=p1_power, rgb=p1_rgb, brightness=p1_brightness, white=p1_white,
        effect=p1_effect, note="7E…EF variant with fff1 write char",
    ),
    Protocol(
        name="LEDBLE / JDY ffe0/ffe1",
        service_uuid="0000ffe0-0000-1000-8000-00805f9b34fb",
        characteristic_uuid="0000ffe1-0000-1000-8000-00805f9b34fb",
        power=p1_power, rgb=p1_rgb, brightness=p1_brightness, white=p1_white,
        effect=p1_effect, note="Used by LEDBLE-00-D80E",
    ),
    Protocol(
        name="LED LAMP custom 305bdd41",
        service_uuid="305bdd41-271f-4618-a1ea-0793da9e04ef",
        characteristic_uuid="305bdd41-271f-4618-a1ea-0793da9e04ef",
        power=p1_power, rgb=p1_rgb, brightness=p1_brightness, white=p1_white,
        effect=p1_effect, note="UUID found in the com.ledlamp APK",
    ),
    Protocol(
        name="Magic Blue ffe5/ffe9",
        service_uuid="0000ffe5-0000-1000-8000-00805f9b34fb",
        characteristic_uuid="0000ffe9-0000-1000-8000-00805f9b34fb",
        power=p2_power, rgb=p2_rgb, brightness=p2_brightness, white=p2_white,
        note="Older 56…AA controllers",
    ),
)

GENERIC_PROTOCOL = Protocol(
    name="Generic 7E…EF (auto char)",
    service_uuid="",
    characteristic_uuid="",
    power=p1_power, rgb=p1_rgb, brightness=p1_brightness, white=p1_white,
    effect=p1_effect, note="Fallback: first writable characteristic",
)

# Effect codes for protocol 1 (same table as led-control).
EFFECTS: dict[str, int] = {
    "red": 0x80, "green": 0x81, "blue": 0x82, "yellow": 0x83,
    "cyan": 0x84, "magenta": 0x85, "white": 0x86,
    "jump_rgb": 0x87, "jump_rgbycmw": 0x88,
    "gradient_rgb": 0x89, "gradient_rgbycmw": 0x8A,
    "gradient_r": 0x8B, "gradient_g": 0x8C, "gradient_b": 0x8D,
    "gradient_y": 0x8E, "gradient_c": 0x8F, "gradient_m": 0x90,
    "gradient_w": 0x91, "gradient_rg": 0x92,
    "gradient_rb": 0x93, "gradient_gb": 0x94,
    "blink_rgbycmw": 0x95, "blink_r": 0x96, "blink_g": 0x97,
    "blink_b": 0x98, "blink_y": 0x99, "blink_c": 0x9A,
    "blink_m": 0x9B, "blink_w": 0x9C,
}

# Palette used by the "long press to cycle" gesture and the settings editor.
DEFAULT_PALETTE: list[str] = [
    "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#00C7BE", "#32ADE6",
    "#007AFF", "#5856D6", "#AF52DE", "#FF2D55", "#FFFFFF", "#FFD9A0",
]
