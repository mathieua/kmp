#!/usr/bin/env bash
# One-time conversion of a device to the OTA layout. Run as root from a
# built checkout of the app (dist/ and node_modules/ present), e.g.:
#   cd ~/alarm-clock && sudo bash scripts/install-ota.sh
# Safe to re-run. Reboot afterwards (kmp-backend takes over tty1/X).
set -euo pipefail

[ "$EUID" -eq 0 ] || { echo "run as root" >&2; exit 1; }
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT=/opt/kmp
APP_USER=pi
[ -d "$SRC/dist" ] && [ -d "$SRC/node_modules" ] || { echo "build first: npm install && npm run build" >&2; exit 1; }

# --- The OTA tree must be writable even under the overlayfs read-only root ---
mkdir -p "$ROOT"
if [ "$(findmnt -no FSTYPE /)" = overlay ]; then
  if [ "$(findmnt -no TARGET --target "$ROOT")" != "$ROOT" ] || [[ "$(findmnt -no FSTYPE --target "$ROOT")" == overlay ]]; then
    echo "Root is an overlay but $ROOT is not its own persistent mount." >&2
    echo "Mount a writable partition at $ROOT (excluded from the overlay) first." >&2
    exit 1
  fi
fi
touch "$ROOT/.write-test" && rm "$ROOT/.write-test" || { echo "$ROOT is not writable" >&2; exit 1; }

VERSION="$(node -p "require('$SRC/package.json').version")"
mkdir -p "$ROOT"/{bin,releases,data,media,tmp}

# --- Seed the first release from this checkout ---
if [ ! -d "$ROOT/releases/$VERSION" ]; then
  echo "→ Seeding release $VERSION"
  mkdir -p "$ROOT/releases/$VERSION"
  tar -C "$SRC" --exclude=.git --exclude=media --exclude=data --exclude=out --exclude=hw/pcb -cf - \
    dist hw scripts migrations package.json package-lock.json node_modules | tar -C "$ROOT/releases/$VERSION" --no-same-owner -xf -
  echo "$VERSION" > "$ROOT/releases/$VERSION/VERSION"
  chown -R root:root "$ROOT/releases/$VERSION"
fi
if [ ! -L "$ROOT/current" ]; then
  ln -sfn "releases/$VERSION" "$ROOT/current.new" && mv -T "$ROOT/current.new" "$ROOT/current"
fi

# --- Existing data/media (copied, originals left in place as a backup) ---
HOME_APP="/home/$APP_USER/alarm-clock"
if [ -d "$HOME_APP/data" ] && [ ! -e "$ROOT/data/portal.db" ]; then
  echo "→ Copying data from $HOME_APP/data"
  cp -a "$HOME_APP/data/." "$ROOT/data/"
fi
if [ -d "$HOME_APP/media" ] && [ -z "$(ls -A "$ROOT/media")" ]; then
  echo "→ Copying media from $HOME_APP/media (this can take a while)"
  cp -a "$HOME_APP/media/." "$ROOT/media/"
fi
chown -R "$APP_USER:$APP_USER" "$ROOT/data" "$ROOT/media"

# --- hw drivers now come from the active release ---
if [ -d "$ROOT/hw" ] && [ ! -L "$ROOT/hw" ]; then mv "$ROOT/hw" "$ROOT/hw.pre-ota"; fi
ln -sfn current/hw "$ROOT/hw"

# --- Updater + units ---
install -m 755 "$SRC/scripts/updater/kmp-updater.js" "$ROOT/bin/kmp-updater.js"
install -m 644 "$SRC"/scripts/systemd/kmp-{updater.service,updater.timer,backend.service} /etc/systemd/system/

# Parent portal may start the (root) updater; nothing else.
SUDOERS=/etc/sudoers.d/kmp-updater
cat > "$SUDOERS.tmp" <<SUDO
$APP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl start --no-block kmp-updater.service
$APP_USER ALL=(root) NOPASSWD: $ROOT/current/scripts/set-hostname.sh
SUDO
visudo -cf "$SUDOERS.tmp" && chmod 440 "$SUDOERS.tmp" && mv "$SUDOERS.tmp" "$SUDOERS"

systemctl daemon-reload
systemctl enable kmp-backend.service kmp-updater.timer
systemctl start kmp-updater.timer

echo
echo "OTA layout installed (release $VERSION). Reboot to start kmp-backend:  sudo reboot"
echo "Logs: journalctl -u kmp-backend -u kmp-updater"
