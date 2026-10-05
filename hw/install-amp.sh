#!/usr/bin/env bash
# One-time OS config for units with the MAX98357 I2S amp (hifiberry-dac
# overlay + GPIO16 SD_MODE control, driven by amp_control.py). NOT for
# units with a USB speaker — running this there would override ALSA's
# default device to a nonexistent I2S card.
#
# Audio routes through PipeWire rather than plain ALSA softvol. Softvol's
# "Master"/"PCM" control turned out to be a dead end for this use case: it's
# a dynamically-created ALSA "user control" owned by whichever process
# opened the PCM, and the kernel refuses writes to it from any other
# process — confirmed on-device, including as root, regardless of the
# control's name. That makes it unusable for volume changes coming from
# the app (a separate process from the ffplay instance actually playing).
# wpctl talks to the PipeWire daemon directly instead of a per-process ALSA
# control, so it isn't subject to that restriction.
#
# Run once, then reboot for the overlay to take effect:
#   sshpass -p 'Barca105' ssh pi@<host>.local "cd ~/alarm-clock && sudo bash hw/install-amp.sh"
set -euo pipefail

if [ -f /boot/firmware/config.txt ]; then
    CONFIG_TXT=/boot/firmware/config.txt
elif [ -f /boot/config.txt ]; then
    CONFIG_TXT=/boot/config.txt
else
    echo "Could not find config.txt" >&2
    exit 1
fi

echo "→ Configuring I2S amp overlay in $CONFIG_TXT"
if grep -qF 'dtoverlay=hifiberry-dac' "$CONFIG_TXT"; then
    echo "  (already present — skipping)"
else
    echo 'dtoverlay=hifiberry-dac' >> "$CONFIG_TXT"
    echo "  Added dtoverlay=hifiberry-dac"
fi

# With the onboard audio enabled, WirePlumber picks the headphone jack as the
# default sink on a fresh image, so nothing plays through the amp. Turning
# the onboard audio off leaves the amp as the only sink — no per-device
# `wpctl set-default` needed.
echo "→ Disabling onboard audio so the amp is the only (and default) sink"
if grep -q '^dtparam=audio=on' "$CONFIG_TXT"; then
    sed -i 's/^dtparam=audio=on/dtparam=audio=off/' "$CONFIG_TXT"
    echo "  dtparam=audio=on → off"
elif ! grep -q '^dtparam=audio=off' "$CONFIG_TXT"; then
    echo 'dtparam=audio=off' >> "$CONFIG_TXT"
    echo "  Added dtparam=audio=off"
fi

echo "→ Installing PipeWire"
apt-get install -y pipewire pipewire-alsa wireplumber

echo "→ Enabling linger for pi so PipeWire's user services survive across sessions"
loginctl enable-linger pi

echo "→ Writing /etc/asound.conf (route the ALSA default through PipeWire)"
cat > /etc/asound.conf << 'EOF'
pcm.!default {
    type pipewire
}

ctl.!default {
    type pipewire
}
EOF

echo ""
echo "Done."
echo ""
echo "IMPORTANT: reboot for the config.txt changes to take effect. Then check"
echo "the hifiberry sink is the default (marked *):"
echo "  wpctl status"
echo "  wpctl set-volume @DEFAULT_AUDIO_SINK@ 70%   # sanity check"
