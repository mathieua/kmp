#!/usr/bin/env python3
"""
Physical button daemon.

Polls GPIO6 (play/pause), GPIO13 (skip), GPIO5 (previous), GPIO24 (snooze)
every 5 ms and emits newline-delimited JSON events to every client connected
on the Unix domain socket at /tmp/kmp-buttons.sock.

Events:
    {"event": "play_pause"}
    {"event": "skip"}
    {"event": "previous"}
    {"event": "snooze"}

Active LOW with internal pull-ups. Software debounce: 50 ms.
Uses lgpio polling (gpio_read) — the lgpio callback/alert mechanism is
unreliable on kernel 6.x and produces no events even with correct wiring.
"""

import json
import os
import signal
import socket
import sys
import threading
import time

try:
    import lgpio
except ImportError:
    sys.stderr.write("lgpio not installed — run: sudo apt install python3-lgpio\n")
    sys.exit(1)

SOCK_PATH = "/tmp/kmp-buttons.sock"
POLL_HZ   = 200      # poll every 5 ms
DEBOUNCE  = 0.050    # 50 ms software debounce

BUTTON_MAP = {
    6:  "play_pause",
    13: "skip",
    5:  "previous",
    24: "snooze",
}

_clients: list[socket.socket] = []
_clients_lock = threading.Lock()
_running = True


def broadcast(event: str) -> None:
    message = (json.dumps({"event": event}) + "\n").encode()
    with _clients_lock:
        dead = []
        for client in _clients:
            try:
                client.sendall(message)
            except OSError:
                dead.append(client)
        for client in dead:
            _clients.remove(client)


def poll_loop(h: int) -> None:
    """Tight poll loop — detects FALLING edges (HIGH→LOW) with debounce."""
    last = {pin: lgpio.gpio_read(h, pin) for pin in BUTTON_MAP}

    while _running:
        for pin, event_name in BUTTON_MAP.items():
            val = lgpio.gpio_read(h, pin)
            if val == 0 and last[pin] == 1:          # FALLING edge detected
                time.sleep(DEBOUNCE)                 # wait out bounce
                if lgpio.gpio_read(h, pin) == 0:     # still pressed — real press
                    broadcast(event_name)
            last[pin] = val
        time.sleep(1.0 / POLL_HZ)


def run_socket_server() -> None:
    if os.path.exists(SOCK_PATH):
        os.unlink(SOCK_PATH)

    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(SOCK_PATH)
    os.chmod(SOCK_PATH, 0o666)
    server.listen(8)

    while _running:
        try:
            server.settimeout(1.0)
            conn, _ = server.accept()
            with _clients_lock:
                _clients.append(conn)
        except socket.timeout:
            continue
        except OSError:
            break


def main() -> None:
    global _running

    h = lgpio.gpiochip_open(0)
    for pin in BUTTON_MAP:
        lgpio.gpio_claim_input(h, pin, lgpio.SET_PULL_UP)

    def cleanup(signum, frame):
        global _running
        _running = False
        lgpio.gpiochip_close(h)
        if os.path.exists(SOCK_PATH):
            os.unlink(SOCK_PATH)
        sys.exit(0)

    signal.signal(signal.SIGTERM, cleanup)
    signal.signal(signal.SIGINT, cleanup)

    threading.Thread(target=run_socket_server, daemon=True).start()
    poll_loop(h)


if __name__ == "__main__":
    main()
