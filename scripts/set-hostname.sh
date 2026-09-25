#!/usr/bin/env bash
# Sets the system hostname and keeps /etc/hosts' 127.0.1.1 line in sync.
# Run as root (via the app's sudoers NOPASSWD grant — see setup-pi.sh):
#   sudo /home/pi/alarm-clock/scripts/set-hostname.sh <new-name>
#
# Bundled into one script (rather than granting passwordless sed/tee
# directly) so the sudoers grant stays scoped to "rename this device",
# not "edit any file as root."
set -euo pipefail

NEW_NAME="${1:?Usage: set-hostname.sh <new-name>}"

hostnamectl set-hostname "$NEW_NAME"

if grep -q '^127\.0\.1\.1' /etc/hosts; then
    sed -i "s/^127\.0\.1\.1.*/127.0.1.1\t${NEW_NAME}/" /etc/hosts
else
    echo -e "127.0.1.1\t${NEW_NAME}" >> /etc/hosts
fi
