#!/usr/bin/env python3
"""
MAX98357 amp SD_MODE control daemon.

Reads newline-delimited JSON commands from stdin and drives GPIO16 HIGH/LOW.
Spawned by the Node.js audio service; the backend writes commands to its stdin pipe.

Commands:
    {"cmd": "enable"}  → GPIO16 HIGH (amp active)
    {"cmd": "disable"} → GPIO16 LOW  (amp shutdown)

Initial state is LOW (amp off). Uses lgpio.
"""

import json
import signal
import sys

try:
    import lgpio
except ImportError:
    sys.stderr.write("lgpio not installed — run: sudo apt install python3-lgpio\n")
    sys.exit(1)

PIN_SD_MODE = 16


def main() -> None:
    h = lgpio.gpiochip_open(0)
    lgpio.gpio_claim_output(h, PIN_SD_MODE, 0)  # initial LOW — amp off

    def cleanup(signum, frame):
        lgpio.gpio_write(h, PIN_SD_MODE, 0)
        lgpio.gpiochip_close(h)
        sys.exit(0)

    signal.signal(signal.SIGTERM, cleanup)
    signal.signal(signal.SIGINT, cleanup)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
            lgpio.gpio_write(h, PIN_SD_MODE, 1 if cmd.get("cmd") == "enable" else 0)
        except (json.JSONDecodeError, KeyError):
            sys.stderr.write(f"Bad command: {line!r}\n")

    lgpio.gpio_write(h, PIN_SD_MODE, 0)
    lgpio.gpiochip_close(h)


if __name__ == "__main__":
    main()
