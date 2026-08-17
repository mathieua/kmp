#!/usr/bin/env python3
"""
Rotary encoder daemon.

Polls GPIO17 (CLK), GPIO27 (DT), GPIO22 (SW) every 1 ms and emits
newline-delimited JSON events to every client connected on the Unix
domain socket at /tmp/kmp-encoder.sock.

Events:
    {"event": "volume_up"}
    {"event": "volume_down"}
    {"event": "mute_toggle"}

Active LOW with internal pull-ups. SW: 50 ms software debounce.
Rotation uses a 4-state quadrature state machine (the standard approach,
e.g. Ben Buxton's "Rotary" table), not single-edge detection — sampling
CLK+DT together on every poll and only emitting once a full, valid
CW/CCW transition sequence completes. A naive "trigger on CLK falling
edge, read DT's instantaneous value" decoder (the previous approach here)
is well known to misfire on contact bounce, producing spurious
opposite-direction events mid-turn — exactly the "goes up and down as I
turn" symptom this replaces.
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

SOCK_PATH    = "/tmp/kmp-encoder.sock"
POLL_SLEEP   = 0.001   # 1 ms — fast enough for encoder, light on CPU
SW_DEBOUNCE  = 0.050   # 50 ms for push button

PIN_CLK = 17
PIN_DT  = 27
PIN_SW  = 22

_clients: list[socket.socket] = []
_clients_lock = threading.Lock()
_running = True

# ── Quadrature state machine ──────────────────────────────────────────────
# States
R_START, R_CW_FINAL, R_CW_BEGIN, R_CW_NEXT, R_CCW_BEGIN, R_CCW_FINAL, R_CCW_NEXT = range(7)
# Direction flags, OR'd into the returned state
DIR_CW  = 0x10
DIR_CCW = 0x20

# Row = current state, column = (CLK << 1) | DT (both active-high readings).
# A direction is only reported when a full, valid CW or CCW sequence
# completes (landing back on a "11" rest position) — any other/bouncy
# sequence just moves between intermediate states without emitting anything.
TTABLE = [
    # R_START
    [R_START,     R_CW_BEGIN,  R_CCW_BEGIN, R_START],
    # R_CW_FINAL
    [R_CW_NEXT,   R_START,     R_CW_FINAL,  R_START | DIR_CW],
    # R_CW_BEGIN
    [R_CW_NEXT,   R_CW_BEGIN,  R_START,     R_START],
    # R_CW_NEXT
    [R_CW_NEXT,   R_CW_BEGIN,  R_CW_FINAL,  R_START],
    # R_CCW_BEGIN
    [R_CCW_NEXT,  R_START,     R_CCW_BEGIN, R_START],
    # R_CCW_FINAL
    [R_CCW_NEXT,  R_CCW_FINAL, R_START,     R_START | DIR_CCW],
    # R_CCW_NEXT
    [R_CCW_NEXT,  R_CCW_FINAL, R_START,     R_CCW_BEGIN],
]


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
    """Run the quadrature state machine on CLK+DT, and detect SW falling edge for mute."""
    state = R_START
    last_sw = lgpio.gpio_read(h, PIN_SW)

    while _running:
        clk = lgpio.gpio_read(h, PIN_CLK)
        dt  = lgpio.gpio_read(h, PIN_DT)
        sw  = lgpio.gpio_read(h, PIN_SW)

        pin_state = (clk << 1) | dt
        state = TTABLE[state & 0x7][pin_state]
        direction = state & 0x30
        if direction == DIR_CW:
            broadcast("volume_up")
        elif direction == DIR_CCW:
            broadcast("volume_down")

        # Push button — falling edge on SW
        if sw == 0 and last_sw == 1:
            time.sleep(SW_DEBOUNCE)
            if lgpio.gpio_read(h, PIN_SW) == 0:
                broadcast("mute_toggle")

        last_sw = sw
        time.sleep(POLL_SLEEP)


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
    lgpio.gpio_claim_input(h, PIN_CLK, lgpio.SET_PULL_UP)
    lgpio.gpio_claim_input(h, PIN_DT,  lgpio.SET_PULL_UP)
    lgpio.gpio_claim_input(h, PIN_SW,  lgpio.SET_PULL_UP)

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
