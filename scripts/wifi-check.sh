#!/bin/bash
# Kids Clock — WiFi connectivity check
# Run by systemd at boot (as root, via wifi-check.service), before the
# graphical session starts (see Before= ordering in the unit file — this
# must finish, AP mode included, before the app takes its first look at
# /tmp/wifi-ap-mode).
#
# Waits up to 30s for any WiFi connection.
# If none, creates an open "<hostname>-setup" hotspot and writes
# /tmp/wifi-ap-mode so the Electron app can enter setup UI.
#
# The SSID is derived from the device's own hostname so the same script
# works unmodified on every unit, regardless of what it's named (a fresh
# unit's default hostname, or whatever a parent renamed it to later).

set -e

HOTSPOT_SSID="$(hostname)-setup"
HOTSPOT_CON="$(hostname)-setup"
FLAG_FILE="/tmp/wifi-ap-mode"
MAX_WAIT=30
INTERVAL=5

log() {
    local msg="[wifi-check] $*"
    echo "$msg"
    echo "$msg" | systemd-cat -t wifi-check -p info 2>/dev/null || true
}

is_connected() {
    # Must check wlan0 specifically, not the general NM state — the device
    # also has eth0, and general state reports "connected" the moment
    # EITHER interface is up. Checking general state meant plugging in
    # Ethernet (e.g. for debugging) silently defeated the WiFi fallback
    # even with WiFi completely unconfigured.
    #
    # Also must exclude our own hotspot connection specifically — see the
    # cleanup below for why it can still exist at this point.
    local state con
    IFS=: read -r _ state con < <(nmcli -t -f DEVICE,STATE,CONNECTION device status 2>/dev/null | awk -F: '$1 == "wlan0"')
    [ "$state" = "connected" ] && [ "$con" != "$HOTSPOT_CON" ]
}

# Clean up any stale AP flag from a previous (crashed) boot
rm -f "$FLAG_FILE"

# Remove any leftover hotspot connection from a previous fallback before we
# even start waiting. NM auto-activates saved connections at boot — without
# this, wlan0 reconnects to its OWN hotspot before this script gets a look
# in, is_connected() (reasonably) sees wlan0 as connected, and the script
# takes the normal-boot path: no flag file, no setup screen, while the
# device silently keeps serving an open hotspot with zero real internet,
# on every boot from then on with no way back into the setup flow.
nmcli connection delete "$HOTSPOT_CON" 2>/dev/null || true

# ── Wait for connection ────────────────────────────────────────────────────────
log "Waiting up to ${MAX_WAIT}s for WiFi..."
elapsed=0
while [ "$elapsed" -lt "$MAX_WAIT" ]; do
    if is_connected; then
        log "WiFi connected — normal boot."
        exit 0
    fi
    sleep "$INTERVAL"
    elapsed=$((elapsed + INTERVAL))
    log "No connection yet (${elapsed}s / ${MAX_WAIT}s)..."
done

# ── No WiFi — create hotspot ───────────────────────────────────────────────────
log "No WiFi after ${MAX_WAIT}s. Creating hotspot: $HOTSPOT_SSID"

# (any leftover connection with this name was already removed at startup)

# Create open (no-password) AP; NM assigns 10.42.0.1/24 with built-in DHCP.
# - "band" must be fully qualified as 802-11-wireless.band on current NM
#   (nmcli 1.52+) — the bare "band" shorthand errors with "invalid
#   <setting>.<property> 'band'" and aborts the whole script under set -e,
#   silently skipping the hotspot entirely.
# - No security property is set at all. Setting key-mgmt to "none" does NOT
#   mean "open" — in NM's key-mgmt enum, "none" means static WEP, so it now
#   demands a WEP key and activation fails ("Secrets were required, but not
#   provided"). Omitting the 802-11-wireless-security setting is what
#   actually produces an open network.
nmcli connection add \
    type wifi \
    ifname wlan0 \
    con-name "$HOTSPOT_CON" \
    ssid "$HOTSPOT_SSID" \
    mode ap \
    802-11-wireless.band bg \
    ipv4.method shared

nmcli connection up "$HOTSPOT_CON"

# Signal setup mode to the Electron app
touch "$FLAG_FILE"

log "Hotspot '$HOTSPOT_SSID' active."
log "Clients connect to the hotspot, then open http://$(hostname).local:3000/setup (or http://10.42.0.1:3000/setup)"
exit 0
