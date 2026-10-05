# OTA updates

Updates the app layer (Electron/Express backend, React UI + portal, `hw/` drivers)
on a device without re-flashing. OS, kernel and `config.txt` changes are out of
scope. Releases are verified by SHA-256 only (no signing yet).

## Layout (`/opt/kmp`, a writable mount)

```
/opt/kmp/bin/kmp-updater.js   updater (installed once; deliberately not in a release)
/opt/kmp/releases/<version>/  unpacked releases, root-owned (last 3 kept + previous)
/opt/kmp/current -> releases/<version>   flipped atomically (rename(2))
/opt/kmp/hw      -> current/hw           so kmp-buttons/kmp-encoder paths are unchanged
/opt/kmp/data/                portal.db, update-status.json, backups/
/opt/kmp/media/
```

**Overlayfs:** `/opt/kmp` must be its own persistent mount (e.g. an ext4 partition)
excluded from the overlay. `scripts/install-ota.sh` refuses to continue if the
root is an overlay and `/opt/kmp` is not, and the updater re-checks writability
before every update.

## Services

| Unit | Role |
|---|---|
| `kmp-backend.service` | Runs X + Electron from `/opt/kmp/current` (replaces `~/.xinitrc`/`startx`). |
| `kmp-updater.service` | Root oneshot: check → download → verify → activate → health check. |
| `kmp-updater.timer` | Runs the updater at ~03:00 nightly (random delay up to 1h). |

Override the manifest or retention in `/etc/kmp/updater.env`
(`KMP_MANIFEST_URL`, `KMP_KEEP_RELEASES`, ...). Default manifest:
`https://api.github.com/repos/mathieua/kids-alarm/releases/latest`.

## Update sequence

1. Fetch the latest non-draft, non-prerelease GitHub release; compare `x.y.z` to `current/VERSION`.
2. Download `kmp-<v>.tar.gz` + `kmp-<v>.tar.gz.sha256`; mismatch ⇒ abort, `current` untouched.
3. Reject archives with absolute/`..` paths; unpack to `releases/<v>.partial`, rename to `releases/<v>`.
4. Stop `kmp-backend`, copy `portal.db*` to `data/backups/`, flip `current`, start `kmp-backend`.
5. The new backend applies `migrations/*.sql` at startup (once each, transactional).
6. Health check: `kmp-backend` is active **and** `GET /api/health` returns `ok` with the new version (90 s).
   On failure: stop, restore the DB snapshot, flip back, restart, and remember the version as bad
   (the timer will not retry it; a newer release or a manual *Install* will).
7. Restart `kmp-buttons`/`kmp-encoder`, prune old releases and backups.

## Portal / API

* `GET  /api/update-status` – `currentVersion`, `lastCheck`, `available` (+ changelog), `lastResult`, `state`.
* `POST /api/update/check`, `POST /api/update/apply` – write `data/update-request.json` and start
  `kmp-updater.service` (sudoers allows exactly that command). 409 if busy / nothing to apply, 503 if the device has no updater.
* `GET  /api/health` – used by the updater.
* UI: **Updates** page (version, update-available badge in the nav, changelog, check/install buttons).

These routes have **no authentication**, matching every other `/api/portal` route (LAN-only trust model).
An update can only install a checksum-verified published release.

## Publishing a release

On an arm64 machine: `scripts/make-release.sh 1.2.3`, then create a GitHub release tagged
`v1.2.3` with `out/kmp-1.2.3.tar.gz` and `out/kmp-1.2.3.tar.gz.sha256` attached. The release
description is shown as the changelog. Schema changes go in `migrations/NNN-name.sql` (see its README).

## Converting an existing device

```
cd ~/alarm-clock && npm install && npm run build
sudo bash scripts/install-ota.sh && sudo reboot
```

Existing `~/alarm-clock/{data,media}` are copied (not moved) to `/opt/kmp`.

## Tests

`node --test scripts/updater/kmp-updater.test.js` exercises success, checksum rejection, path traversal,
rollback (code + DB), pruning and prerelease handling against a fake root, `systemctl` and backend.
