"""Exact-frame checks for the BLE protocol builders (no Bluetooth needed)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from led_protocol import (  # noqa: E402
    DEFAULT_PALETTE,
    EFFECTS,
    PROTOCOLS,
    p1_brightness,
    p1_effect,
    p1_power,
    p1_rgb,
    p1_white,
    p2_power,
)


class ProtocolTests(unittest.TestCase):
    def test_power_on(self) -> None:
        self.assertEqual(p1_power(True).hex(), "7e00040100000000ef")

    def test_power_off(self) -> None:
        self.assertEqual(p1_power(False).hex(), "7e00040000000000ef")

    def test_rgb(self) -> None:
        self.assertEqual(p1_rgb(255, 136, 0).hex(), "7e000503ff880000ef")

    def test_brightness(self) -> None:
        self.assertEqual(p1_brightness(42).hex(), "7e00012a00000000ef")

    def test_white(self) -> None:
        self.assertEqual(p1_white(100).hex(), "7e00050164000000ef")

    def test_effect(self) -> None:
        self.assertEqual(p1_effect(0x89, 40).hex(), "7e00038903280000ef")

    def test_magic_blue(self) -> None:
        self.assertEqual(p2_power(True).hex(), "cc2333")

    def test_all_frames_are_nine_bytes(self) -> None:
        for frame in (p1_power(True), p1_rgb(1, 2, 3), p1_brightness(50), p1_white(50), p1_effect(0x89, 10)):
            self.assertEqual(len(frame), 9)
            self.assertEqual(frame[0], 0x7E)
            self.assertEqual(frame[-1], 0xEF)

    def test_protocol_table(self) -> None:
        self.assertGreaterEqual(len(PROTOCOLS), 5)
        self.assertIn("gradient_rgb", EFFECTS)
        self.assertGreaterEqual(len(DEFAULT_PALETTE), 2)


if __name__ == "__main__":
    unittest.main(verbosity=0)
