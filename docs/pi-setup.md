# Raspberry Pi Setup Guide

Setup instructions for the Kids Alarm Clock on a **Raspberry Pi 4** running **Raspberry Pi OS Lite (64-bit)**.

---

## 1. Flash the SD Card

Use [Raspberry Pi Imager](https://www.raspberrypi.com/software/).

- **OS:** Raspberry Pi OS Lite (64-bit)
- **Storage:** your SD card (64GB+ A2 recommended)

Before writing, click the **gear icon** (or `Ctrl+Shift+X`) to open advanced options and configure:

| Setting | Value |
|---------|-------|
| Hostname | `alarm-clock` |
| Enable SSH | Yes (use password auth) |
| Username | `pi` |
| Password | *(set a strong password)* |
| WiFi SSID | *(your primary network)* |
| WiFi password | *(your WiFi password)* |
| Locale / timezone | `Europe/Paris` |

Write the image, then **eject and re-insert** the SD card so the boot partition mounts.

---

## 2. Add a Second WiFi Network

Raspberry Pi Imager only supports one WiFi network. To add more, edit the boot partition (FAT32, mounts automatically on macOS) before the first boot.

Open `/Volumes/bootfs/custom.toml` (created by the Imager) and add a `[wlan]` section if not already there. Then, after first boot, SSH in and add additional networks with:

```bash
sudo nmcli device wifi connect "SecondNetworkSSID" password "SecondNetworkPassword"
```

To verify all configured networks:
```bash
nmcli connection show
```

To set a connection to auto-connect:
```bash
sudo nmcli connection modify "SecondNetworkSSID" connection.autoconnect yes
```

The Pi will automatically connect to whichever configured network is in range.

---

## 3. First Boot

Insert the SD card into the Pi and power it on. First boot takes **2–3 minutes** while the OS initializes.

Once booted, verify it's reachable from your Mac:
```bash
ping alarm-clock.local
```

SSH in:
```bash
ssh pi@alarm-clock.local
```

---

## 4. Run the Setup Script

Fresh Raspberry Pi OS images no longer give `pi` passwordless sudo, and the script runs
unattended under `nohup` (~10 minutes). Allow passwordless sudo **for the bring-up only**
(removed in step 7):

```bash
ssh -t pi@alarm-clock.local "echo 'pi ALL=(ALL) NOPASSWD: ALL' | sudo tee /etc/sudoers.d/099_bringup-temp"
```

Then copy the setup script to the Pi and run it:

```bash
scp scripts/setup-pi.sh pi@alarm-clock.local:~/
ssh pi@alarm-clock.local "nohup bash ~/setup-pi.sh > ~/setup.log 2>&1 < /dev/null &"
# Monitor progress:
ssh pi@alarm-clock.local "tail -f ~/setup.log"
```

This installs:
- X11 minimal desktop, Chromium/Electron dependencies, Node.js 20 LTS
- I2C tools, `lgpio`, the BH1750 library and `hwclock` (`util-linux-extra`)
- `yt-dlp` (for YouTube import)
- Configures GPU memory, I2C, the DS3231 RTC overlay, touchscreen rotation and auto-login

It skips the WiFi fallback service until the app is deployed — re-run it after step 5.

> **Power:** keep the UPS on its charger during bring-up. On battery alone, sustained
> 4-core load (the system upgrade, the native module compile) has frozen the Pi.

---

## 5. Deploy the App

From your Mac, in the project root:

```bash
# Build the app locally
npm run build

# Copy to Pi (excludes node_modules — these must be installed on-device for ARM)
rsync -a --exclude node_modules --exclude .git --exclude data --exclude out --exclude hw/pcb . pi@alarm-clock.local:~/alarm-clock/

# Install dependencies on Pi (downloads the ARM Electron binary and compiles better-sqlite3)
ssh pi@alarm-clock.local "cd ~/alarm-clock && nohup npm install > ~/npm-install.log 2>&1 < /dev/null &"
ssh pi@alarm-clock.local "tail -f ~/npm-install.log"  # monitor progress
```

The `postinstall` rebuild hides failures (`|| true`). Check it produced the native module:

```bash
ssh pi@alarm-clock.local "ls ~/alarm-clock/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
# If missing: ssh pi@alarm-clock.local "cd ~/alarm-clock && JOBS=1 npx electron-rebuild -f -w better-sqlite3"
```

Then re-run `setup-pi.sh` (enables `wifi-check.service`).

---

## 6. Hardware and Services

All run on the Pi from `~/alarm-clock`:

```bash
sudo bash hw/install-amp.sh      # I2S amp overlay, onboard audio off, PipeWire
sudo bash scripts/install-ota.sh # /opt/kmp layout, kmp-backend + nightly updater (see docs/ota-updates.md)
sudo bash hw/install.sh          # kmp-buttons / kmp-encoder daemons
sudo reboot
```

After the reboot, check:

```bash
systemctl is-active kmp-backend kmp-buttons kmp-encoder wifi-check
curl -s localhost:3000/api/health     # {"ok":true,"version":"..."}
wpctl status                          # hifiberry sink present and default (*)
sudo i2cdetect -y 1                   # see table below
```

### I2C Devices

| Device | Address | Purpose |
|--------|---------|---------|
| BH1750 light sensor | `0x23` | Ambient light → auto screen dimming |
| Waveshare UPS HAT (B) — INA219 | `0x42` | Battery voltage/current → battery icon, low-battery shutdown |
| DS3231 RTC | `0x68` | Real-time clock (shows as `UU` once the kernel driver claims it) |

Every part is optional at runtime: a missing sensor, button or amp just disables that feature.

### GPIO Pin Assignments

| Function | GPIO |
|----------|------|
| Play/Pause button | 12 |
| Skip button | 6 |
| Previous button | 13 |
| Rotary encoder CLK / DT / SW | 17 / 27 / 22 |
| Amp SD_MODE (enable) | 16 |
| I2S (amp) BCLK / LRCLK / DIN | 18 / 19 / 21 |
| LED | 26 |
| I2C SDA / SCL | 2 / 3 |

---

## 7. Finish

Remove the temporary sudo rule. The app's own rules (`/etc/sudoers.d/alarm-clock`,
`/etc/sudoers.d/kmp-updater`) stay:

```bash
ssh pi@alarm-clock.local "sudo rm /etc/sudoers.d/099_bringup-temp"
```

---

## 7. Troubleshooting

### WiFi not configured yet / moving to a new network

If the Pi can't find a known network, it will enter **AP provisioning mode**:

1. On your phone or laptop, connect to the `AlarmClock-Setup` WiFi network
2. Navigate to `http://192.168.4.1:3000/setup`
3. Enter your WiFi credentials and submit
4. The Pi will connect to the new network and resume normal operation

*(See WiFi Provisioning Mode section in SPEC.md for implementation details)*

### Pi not visible at alarm-clock.local
- Wait ~3 minutes after first boot
- Ensure the Pi is connected to the same network as your Mac
- Check the router's DHCP table for a device named `alarm-clock`
- SSH by IP if mDNS fails: `ssh pi@<ip-address>`

### Wrong time after power loss
The Pi has no hardware clock of its own — without network, time is wrong after power loss unless the DS3231 RTC is connected and synced:
```bash
sudo hwclock --systohc   # Write system time to RTC
sudo hwclock --hctosys   # Read RTC back to system (on boot)
```

### App doesn't auto-start
Check `systemctl status kmp-backend` and `journalctl -u kmp-backend -b`. On devices not yet
converted to the OTA layout, the app starts from `~/.xinitrc` via `startx` in `~/.bashrc`.
