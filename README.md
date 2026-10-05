# Kid Music Player

A Raspberry Pi-based alarm clock for kids with a touchscreen UI and a parent portal for managing music content.

## Features

**Alarm clock UI** (runs on the Pi's touchscreen)
- Clock display with date
- Music player — browse and play MP3s by artist/category, album artwork, swipe navigation
- USB Sync tab — appears automatically when an MP3 player is plugged in, syncs your library to the device
- Idle screen dimming after 30 seconds

**Parent portal** (web UI, accessible from any device on the local network)
- Music library — browse, search, edit metadata, delete tracks
- YouTube import — paste a URL, downloads as MP3 with metadata and thumbnail
- File upload — drag and drop MP3 files
- USB Sync — diff view, orphan management, progress tracking
- Software updates — over-the-air updates with rollback (see [docs/ota-updates.md](docs/ota-updates.md))

## Hardware

| Component | Details |
|-----------|---------|
| Board | Raspberry Pi 4 |
| Display | Official 7" touchscreen (800×480) |
| Speaker | USB audio (e.g. Jabra Speak) |
| Storage | 64 GB microSD (A2 class recommended) |
| RTC *(optional)* | DS3231 at I2C `0x68` — keeps time across power cycles |
| Light sensor *(optional)* | BH1750 at I2C `0x23` — auto screen brightness |

## Tech Stack

- **Electron** — cross-platform desktop shell
- **React + TypeScript** — UI (alarm clock renderer and parent portal are separate Vite builds)
- **Express + WebSocket** — backend API on port 3000
- **SQLite** (`better-sqlite3`) — media library database
- **yt-dlp** — YouTube audio extraction

## Project Structure

```
src/              Alarm clock renderer (React)
  views/          Clock, Media, Alarms, Sync
  hooks/          useAudio, useSync, useIdleTimer, useSwipe
  components/     Navigation, PlaybackControls, TrackList

src/portal/       Parent portal (separate React app)
  pages/          LibraryPage, ImportPage, UploadPage, SyncPage
  hooks/          useMediaLibrary, useYoutubeImport, useUpload, useSyncDevice

electron/
  main.ts         Main process — IPC handlers, window setup
  preload.ts      Context bridge (audio + sync APIs)
  services/
    api.ts        Express server, USB polling, sync engine
    audio.ts      Audio playback service
    database.ts   SQLite operations

scripts/
  setup-pi.sh     One-shot Pi provisioning script
docs/
  pi-setup.md     Full setup guide
```

## Development

```bash
npm install
npm run dev        # starts Vite dev server + Electron
```

The parent portal is available at `http://localhost:3000/portal` when Electron is running.

## Deployment to Raspberry Pi

See [docs/pi-setup.md](docs/pi-setup.md) for the full guide. Quick summary:

```bash
# 1. Flash Ubuntu Server (or Raspberry Pi OS Lite) and run the setup script
scp scripts/setup-pi.sh pi@alarm-clock.local:~/
ssh pi@alarm-clock.local "nohup bash ~/setup-pi.sh > ~/setup.log 2>&1 &"

# 2. Build locally
npm run build

# 3. Sync to Pi (first time — full deploy)
rsync -av --exclude node_modules --exclude .git . pi@alarm-clock.local:~/alarm-clock/
ssh pi@alarm-clock.local "cd ~/alarm-clock && nohup npm install > ~/npm-install.log 2>&1 &"

# 4. Incremental deploys (after the first install)
npm run build
rsync -av dist/ pi@alarm-clock.local:~/alarm-clock/dist/
ssh pi@alarm-clock.local "sudo reboot"
```

The app auto-starts on every boot via `~/.xinitrc`.

## Build Scripts

| Command | Output |
|---------|--------|
| `npm run build:renderer` | `dist/renderer/` — alarm clock UI |
| `npm run build:portal` | `dist/portal/` — parent portal |
| `npm run build:electron` | `dist/electron/` — main process |
| `npm run build` | all three |

## Parent Portal

Connect any device on the local network to `http://alarm-clock.local:3000/portal`.

| Route | Purpose |
|-------|---------|
| `/portal` | Music library |
| `/portal/import` | Import from YouTube |
| `/portal/upload` | Upload MP3 files |
| `/portal/sync` | Sync to USB MP3 player |

## USB Sync

Plug an MP3 player into the Pi's USB port. The alarm clock UI automatically shows a **Sync** tab — tap it to see what needs to be copied and start the sync. The parent portal's Sync page offers the same functionality with additional orphan file management.

Media is stored at `~/alarm-clock/media/` on the Pi, organized by category and artist:

```
media/
  music/
    Coldplay/
      the-scientist.mp3
  audiobooks/
  podcasts/
```
