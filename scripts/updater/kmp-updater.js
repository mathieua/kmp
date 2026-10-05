#!/usr/bin/env node
// KMP over-the-air updater.
//
// Installed to /opt/kmp/bin/kmp-updater.js (NOT inside a release, so a bad
// release can never break the thing that rolls it back) and run as root by
// kmp-updater.service, either from kmp-updater.timer (overnight) or started
// on demand by the portal.
//
// Layout (all under KMP_ROOT, which must be a writable mount excluded from
// the overlayfs root):
//   releases/<version>/   unpacked releases (root-owned, read-only to the app)
//   current -> releases/<version>   flipped atomically via rename(2)
//   data/                 DB, update-status.json, update-request.json, backups/
//
// Flow: check manifest -> download -> verify SHA-256 -> unpack -> stop backend
// -> snapshot DB -> flip `current` -> start backend -> health check -> on
// failure restore DB + flip back + restart. Plain Node, no dependencies.
'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const http = require('http')
const { execFileSync, spawnSync } = require('child_process')

const DEFAULT_MANIFEST = 'https://api.github.com/repos/mathieua/kmp/releases/latest'

function loadConfig(env = process.env) {
  const root = env.KMP_ROOT || '/opt/kmp'
  return {
    root,
    releasesDir: path.join(root, 'releases'),
    currentLink: path.join(root, 'current'),
    dataDir: path.join(root, 'data'),
    tmpDir: path.join(root, 'tmp'),
    manifestUrl: env.KMP_MANIFEST_URL || DEFAULT_MANIFEST,
    keepReleases: Math.max(2, parseInt(env.KMP_KEEP_RELEASES || '3', 10)),
    backendUnit: env.KMP_BACKEND_UNIT || 'kmp-backend',
    // Other units that run code out of the release (python hw daemons).
    extraUnits: (env.KMP_EXTRA_UNITS ?? 'kmp-buttons,kmp-encoder').split(',').map(s => s.trim()).filter(Boolean),
    healthUrl: env.KMP_HEALTH_URL || 'http://127.0.0.1:3000/api/health',
    healthTimeoutMs: parseInt(env.KMP_HEALTH_TIMEOUT_MS || '90000', 10),
    systemctl: env.KMP_SYSTEMCTL || 'systemctl',
    tar: env.KMP_TAR || 'tar',
  }
}

// ---------- status file (read by the backend's GET /api/update-status) ----------

function statusPath(cfg) { return path.join(cfg.dataDir, 'update-status.json') }
function requestPath(cfg) { return path.join(cfg.dataDir, 'update-request.json') }

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2))
  fs.renameSync(tmp, file)
}

function readStatus(cfg) {
  return {
    state: 'idle', // idle | checking | updating
    lastCheck: null,
    lastCheckError: null,
    available: null, // { version, changelog, publishedAt }
    lastResult: null, // { status: success|failed|rolled_back, version, message, at }
    failedVersions: [],
    ...readJson(statusPath(cfg), {}),
  }
}

function patchStatus(cfg, patch) {
  const next = { ...readStatus(cfg), ...patch }
  writeJsonAtomic(statusPath(cfg), next)
  return next
}

function log(...args) { console.log('[kmp-updater]', ...args) }

// ---------- versions ----------

function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v).trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

function compareVersions(a, b) {
  const pa = parseVersion(a), pb = parseVersion(b)
  if (!pa || !pb) throw new Error(`Bad version: ${!pa ? a : b}`)
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
  return 0
}

function normalizeVersion(v) {
  const p = parseVersion(v)
  if (!p) throw new Error(`Unsupported version "${v}" (expected x.y.z)`)
  return p.join('.')
}

function currentVersion(cfg) {
  try {
    const real = fs.realpathSync(cfg.currentLink)
    const v = fs.readFileSync(path.join(real, 'VERSION'), 'utf8').trim()
    return parseVersion(v) ? normalizeVersion(v) : null
  } catch { return null }
}

function currentTarget(cfg) {
  try { return path.basename(fs.realpathSync(cfg.currentLink)) } catch { return null }
}

// ---------- manifest ----------

async function readUrl(url) {
  if (url.startsWith('file://')) return fs.readFileSync(new URL(url))
  const res = await fetch(url, { headers: { 'User-Agent': 'kmp-updater', Accept: 'application/vnd.github+json' }, redirect: 'follow' })
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/** GitHub Releases JSON -> { version, changelog, publishedAt, tarballUrl, sha256Url } */
function parseManifest(json) {
  if (json.draft || json.prerelease) return null
  const version = normalizeVersion(json.tag_name)
  const assets = Array.isArray(json.assets) ? json.assets : []
  const tarball = assets.find(a => a.name === `kmp-${version}.tar.gz`)
  const sha = assets.find(a => a.name === `kmp-${version}.tar.gz.sha256`)
  if (!tarball || !sha) throw new Error(`Release ${json.tag_name} is missing kmp-${version}.tar.gz or its .sha256`)
  return {
    version,
    changelog: typeof json.body === 'string' ? json.body : '',
    publishedAt: json.published_at || null,
    tarballUrl: tarball.browser_download_url,
    sha256Url: sha.browser_download_url,
  }
}

async function fetchManifest(cfg) {
  return parseManifest(JSON.parse((await readUrl(cfg.manifestUrl)).toString('utf8')))
}

// ---------- download + verify ----------

async function downloadVerified(cfg, release) {
  fs.mkdirSync(cfg.tmpDir, { recursive: true })
  const file = path.join(cfg.tmpDir, `kmp-${release.version}.tar.gz`)

  // "<hex>  <name>" (sha256sum format) or a bare hex digest.
  const expected = (await readUrl(release.sha256Url)).toString('utf8').trim().split(/\s+/)[0].toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(expected)) throw new Error('Malformed .sha256 file')

  fs.writeFileSync(file, await readUrl(release.tarballUrl))
  const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  if (actual !== expected) {
    fs.rmSync(file, { force: true })
    throw new Error(`Checksum mismatch for ${release.version} (expected ${expected.slice(0, 12)}…, got ${actual.slice(0, 12)}…)`)
  }
  return file
}

function unpack(cfg, tarball, version) {
  // Refuse path traversal / absolute paths before extracting anything.
  const listing = execFileSync(cfg.tar, ['-tzf', tarball], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  for (const entry of listing.split('\n').filter(Boolean)) {
    if (entry.startsWith('/') || entry.split('/').includes('..')) throw new Error(`Unsafe path in archive: ${entry}`)
  }
  const staging = path.join(cfg.releasesDir, `${version}.partial`)
  const dest = path.join(cfg.releasesDir, version)
  fs.rmSync(staging, { recursive: true, force: true })
  fs.mkdirSync(staging, { recursive: true })
  execFileSync(cfg.tar, ['-xzf', tarball, '-C', staging, '--no-same-owner', '--no-same-permissions'])
  if (!fs.existsSync(path.join(staging, 'dist'))) throw new Error('Archive has no dist/ — not a KMP release')
  fs.writeFileSync(path.join(staging, 'VERSION'), version + '\n')
  fs.rmSync(dest, { recursive: true, force: true })
  fs.renameSync(staging, dest)
  return dest
}

// ---------- activation ----------

function systemctl(cfg, ...args) {
  const r = spawnSync(cfg.systemctl, args, { encoding: 'utf8' })
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }
}

/** Atomic: build a temp symlink, then rename(2) it over `current`. */
function flipCurrent(cfg, version) {
  const tmp = `${cfg.currentLink}.new`
  fs.rmSync(tmp, { force: true })
  fs.symlinkSync(path.join('releases', version), tmp)
  fs.renameSync(tmp, cfg.currentLink)
}

const DB_FILES = ['portal.db', 'portal.db-wal', 'portal.db-shm']

/** Called with the backend stopped, so the copy is a clean (checkpointed) DB. */
function snapshotDb(cfg, label) {
  const dir = path.join(cfg.dataDir, 'backups', `${label}-${Date.now()}`)
  const present = DB_FILES.filter(f => fs.existsSync(path.join(cfg.dataDir, f)))
  if (present.length === 0) return null
  fs.mkdirSync(dir, { recursive: true })
  for (const f of present) fs.copyFileSync(path.join(cfg.dataDir, f), path.join(dir, f))
  return dir
}

function restoreDb(cfg, dir) {
  if (!dir) return
  for (const f of DB_FILES) fs.rmSync(path.join(cfg.dataDir, f), { force: true })
  for (const f of fs.readdirSync(dir)) fs.copyFileSync(path.join(dir, f), path.join(cfg.dataDir, f))
}

function pruneBackups(cfg, keep = 3) {
  const dir = path.join(cfg.dataDir, 'backups')
  if (!fs.existsSync(dir)) return
  const all = fs.readdirSync(dir).sort() // label-<epoch ms>: same-length epochs sort chronologically
  for (const name of all.slice(0, Math.max(0, all.length - keep))) fs.rmSync(path.join(dir, name), { recursive: true, force: true })
}

function healthy(url, expectedVersion) {
  return new Promise(resolve => {
    const req = http.get(url, { timeout: 3000 }, res => {
      let body = ''
      res.on('data', c => { body += c })
      res.on('end', () => {
        try {
          const j = JSON.parse(body)
          resolve(res.statusCode === 200 && j.ok === true && j.version === expectedVersion)
        } catch { resolve(false) }
      })
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

async function waitHealthy(cfg, version) {
  const deadline = Date.now() + cfg.healthTimeoutMs
  while (Date.now() < deadline) {
    const active = systemctl(cfg, 'is-active', cfg.backendUnit)
    if (active.ok && (await healthy(cfg.healthUrl, version))) return true
    await new Promise(r => setTimeout(r, Math.min(2000, cfg.healthTimeoutMs / 10)))
  }
  return false
}

function restartExtras(cfg) {
  for (const u of cfg.extraUnits) systemctl(cfg, 'try-restart', u)
}

function pruneReleases(cfg, protect) {
  const versions = fs.readdirSync(cfg.releasesDir).filter(d => parseVersion(d))
    .sort((a, b) => compareVersions(b, a))
  const keep = new Set([...versions.slice(0, cfg.keepReleases), ...protect.filter(Boolean)])
  for (const v of versions) if (!keep.has(v)) fs.rmSync(path.join(cfg.releasesDir, v), { recursive: true, force: true })
  // Stale half-unpacked releases from interrupted runs.
  for (const d of fs.readdirSync(cfg.releasesDir)) if (d.endsWith('.partial')) fs.rmSync(path.join(cfg.releasesDir, d), { recursive: true, force: true })
}

function assertWritable(cfg) {
  const probe = path.join(cfg.root, `.write-test-${process.pid}`)
  try { fs.writeFileSync(probe, 'x'); fs.rmSync(probe) } catch (e) {
    throw new Error(`${cfg.root} is not writable (${e.code}). It must live on a writable mount excluded from the overlay root.`)
  }
  fs.mkdirSync(cfg.releasesDir, { recursive: true })
  fs.mkdirSync(cfg.dataDir, { recursive: true })
}

async function applyRelease(cfg, release) {
  const previous = currentTarget(cfg)
  const result = (status, message) => ({ status, version: release.version, message, at: new Date().toISOString() })

  assertWritable(cfg)
  patchStatus(cfg, { state: 'updating' })

  // 1. download + verify + unpack. Nothing touches `current` until this passes.
  let dest
  try {
    const tarball = await downloadVerified(cfg, release)
    dest = unpack(cfg, tarball, release.version)
    fs.rmSync(tarball, { force: true })
  } catch (e) {
    return result('failed', e.message)
  }

  // 2. stop the app, snapshot the DB, flip.
  systemctl(cfg, 'stop', cfg.backendUnit)
  const snapshot = snapshotDb(cfg, `pre-${release.version}`)
  flipCurrent(cfg, release.version)
  systemctl(cfg, 'start', cfg.backendUnit)

  // 3. health check (migrations run inside the new backend's startup).
  if (await waitHealthy(cfg, release.version)) {
    restartExtras(cfg)
    pruneReleases(cfg, [release.version, previous])
    pruneBackups(cfg)
    return result('success', `Updated ${previous ?? 'unknown'} → ${release.version}`)
  }

  // 4. rollback
  log(`health check failed for ${release.version}; rolling back to ${previous}`)
  systemctl(cfg, 'stop', cfg.backendUnit)
  if (previous) {
    restoreDb(cfg, snapshot)
    flipCurrent(cfg, previous)
  }
  systemctl(cfg, 'start', cfg.backendUnit)
  restartExtras(cfg)
  if (!previous) return { ...result('failed', `${release.version} failed its health check and there is no previous release to roll back to`), unhealthy: true }
  fs.rmSync(dest, { recursive: true, force: true })
  return result('rolled_back', `${release.version} failed its health check; restored ${previous}`)
}

// ---------- entrypoint ----------

/**
 * mode: 'check' (look only), 'apply' (look, then install if newer), 'auto'
 * (same as apply; used by the timer). The portal writes update-request.json
 * and starts the service; with no request the timer's 'auto' is assumed.
 */
async function run(cfg, mode) {
  const lock = path.join(cfg.root, '.updater.lock')
  fs.mkdirSync(cfg.dataDir, { recursive: true })
  try { fs.mkdirSync(lock) } catch {
    // A crashed run (power loss mid-update) leaves the lock behind.
    if (Date.now() - fs.statSync(lock).mtimeMs < 30 * 60_000) { log('another updater run is active'); return }
    fs.rmSync(lock, { recursive: true, force: true })
    fs.mkdirSync(lock)
  }
  try {
    patchStatus(cfg, { state: 'checking' })
    const installed = currentVersion(cfg)
    let release = null
    try {
      release = await fetchManifest(cfg)
    } catch (e) {
      patchStatus(cfg, { state: 'idle', lastCheck: new Date().toISOString(), lastCheckError: e.message })
      return
    }
    const status = readStatus(cfg)
    const isNewer = release && (!installed || compareVersions(release.version, installed) > 0)
    patchStatus(cfg, {
      lastCheck: new Date().toISOString(),
      lastCheckError: null,
      available: isNewer ? { version: release.version, changelog: release.changelog, publishedAt: release.publishedAt } : null,
    })

    if (mode === 'check' || !isNewer) { patchStatus(cfg, { state: 'idle' }); return }

    // Don't retry a version that already failed its health check (avoids a
    // nightly reboot loop); a newer release or a manual apply clears it.
    if (mode === 'auto' && status.failedVersions.includes(release.version)) {
      log(`skipping ${release.version}: failed previously`)
      patchStatus(cfg, { state: 'idle' })
      return
    }

    const { unhealthy, ...lastResult } = await applyRelease(cfg, release)
    // Only a release that actually booted badly is blacklisted; a download or
    // checksum failure may be transient and is retried on the next run.
    const failed = new Set(readStatus(cfg).failedVersions)
    if (lastResult.status === 'success') failed.delete(release.version)
    else if (lastResult.status === 'rolled_back' || unhealthy) failed.add(release.version)
    patchStatus(cfg, {
      state: 'idle',
      lastResult,
      failedVersions: [...failed],
      available: lastResult.status === 'success' ? null : readStatus(cfg).available,
    })
    log(lastResult.status, lastResult.message)
  } finally {
    fs.rmSync(lock, { recursive: true, force: true })
  }
}

async function main() {
  const cfg = loadConfig()
  const req = readJson(requestPath(cfg), null)
  fs.rmSync(requestPath(cfg), { force: true })
  const mode = process.argv[2] || (req && req.action) || 'auto'
  if (!['check', 'apply', 'auto'].includes(mode)) throw new Error(`Unknown mode ${mode}`)
  await run(cfg, mode === 'apply' ? 'apply' : mode)
}

module.exports = { loadConfig, run, parseManifest, compareVersions, flipCurrent, readStatus, currentVersion }

if (require.main === module) {
  main().catch(e => { console.error('[kmp-updater] fatal:', e); process.exit(1) })
}
