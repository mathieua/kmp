#!/usr/bin/env bash
# Installs KMP hardware drivers to /opt/kmp/hw/ and registers the
# systemd services for the button and encoder daemons.
#
# Run once after deploying a new version of the hw/ directory to the Pi:
#   sshpass -p 'Barca105' ssh pi@kmp-setup.local "cd ~/alarm-clock && sudo bash hw/install.sh"
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HW_DEST=/opt/kmp/hw

if [ -L "$HW_DEST" ]; then
    # OTA layout (scripts/install-ota.sh): drivers come from /opt/kmp/current/hw.
    echo "→ $HW_DEST is managed by the OTA updater; skipping driver copy"
else
    echo "→ Installing Python drivers to $HW_DEST"
    mkdir -p "$HW_DEST"
    cp "$SCRIPT_DIR"/*.py "$HW_DEST/"
    chmod +x "$HW_DEST"/*.py
fi

echo "→ Installing systemd service files"
cp "$SCRIPT_DIR/kmp-buttons.service" /etc/systemd/system/
cp "$SCRIPT_DIR/kmp-encoder.service" /etc/systemd/system/

echo "→ Reloading systemd and enabling services"
systemctl daemon-reload
systemctl enable kmp-buttons kmp-encoder
systemctl restart kmp-buttons kmp-encoder

echo ""
echo "Done. Check status with:"
echo "  sudo systemctl status kmp-buttons kmp-encoder"
echo ""
echo "Tail logs with:"
echo "  journalctl -fu kmp-buttons"
echo "  journalctl -fu kmp-encoder"
