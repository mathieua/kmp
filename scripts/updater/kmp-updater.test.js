'use strict'
// Run: node --test scripts/updater/
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const { loadConfig, run, compareVersions, readStatus } = require('./kmp-updater')

function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') }

/** A temp /opt/kmp with release `from` installed, a fake systemctl and a fake backend. */
async function fixture(t, from = '1.0.0') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kmp-upd-'))
  const root = path.join(dir, 'kmp')
  fs.mkdirSync(path.join(root, 'releases', from, 'dist'), { recursive: true })
  fs.writeFileSync(path.join(root, 'releases', from, 'VERSION'), from + '\n')
  fs.symlinkSync(path.join('releases', from), path.join(root, 'current'))
  fs.mkdirSync(path.join(root, 'data'), { recursive: true })
  fs.writeFileSync(path.join(root, 'data', 'portal.db'), 'db-before')

  const calls = path.join(dir, 'systemctl.log')
  const fakeCtl = path.join(dir, 'systemctl')
  fs.writeFileSync(fakeCtl, `#!/bin/sh
echo "$@" >> "${calls}"
# A broken release trashes the DB on startup (what a bad migration would do).
if [ "$1" = start ] && [ -e "${root}/current/BROKEN" ]; then echo corrupt > "${root}/data/portal.db"; fi
exit 0
`, { mode: 0o755 })

  // Fake backend: reports whatever `current` points at; "BROKEN" marker => unhealthy.
  const server = http.createServer((_req, res) => {
    try {
      const cur = fs.realpathSync(path.join(root, 'current'))
      if (fs.existsSync(path.join(cur, 'BROKEN'))) { res.statusCode = 500; return res.end('{}') }
      res.end(JSON.stringify({ ok: true, version: fs.readFileSync(path.join(cur, 'VERSION'), 'utf8').trim() }))
    } catch { res.statusCode = 500; res.end('{}') }
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }) })

  const makeRelease = (version, { broken = false, badChecksum = false, traversal = false } = {}) => {
    const src = path.join(dir, `src-${version}`)
    fs.mkdirSync(path.join(src, 'dist'), { recursive: true })
    fs.writeFileSync(path.join(src, 'dist', 'main.js'), version)
    if (broken) fs.writeFileSync(path.join(src, 'BROKEN'), '')
    const tgz = path.join(dir, `kmp-${version}.tar.gz`)
    if (traversal) {
      fs.writeFileSync(path.join(dir, 'evil'), 'x')
      execFileSync('tar', ['-czf', tgz, '-C', src, 'dist', '--transform', 's,^dist/main.js,../evil,'])
    } else {
      execFileSync('tar', ['-czf', tgz, '-C', src, '.'])
    }
    const digest = badChecksum ? '0'.repeat(64) : sha(tgz)
    fs.writeFileSync(`${tgz}.sha256`, `${digest}  kmp-${version}.tar.gz\n`)
    return {
      tag_name: `v${version}`, body: `Changelog for ${version}`, published_at: '2026-01-01T00:00:00Z',
      assets: [
        { name: `kmp-${version}.tar.gz`, browser_download_url: `file://${tgz}` },
        { name: `kmp-${version}.tar.gz.sha256`, browser_download_url: `file://${tgz}.sha256` },
      ],
    }
  }
  const publish = (release) => {
    const m = path.join(dir, 'manifest.json')
    fs.writeFileSync(m, JSON.stringify(release))
    return m
  }
  const cfgFor = (manifest, extra = {}) => loadConfig({
    KMP_ROOT: root, KMP_MANIFEST_URL: `file://${manifest}`, KMP_SYSTEMCTL: fakeCtl,
    KMP_HEALTH_URL: `http://127.0.0.1:${server.address().port}/`, KMP_HEALTH_TIMEOUT_MS: '1500',
    KMP_EXTRA_UNITS: 'kmp-buttons', ...extra,
  })
  const target = () => path.basename(fs.realpathSync(path.join(root, 'current')))
  return { root, calls, makeRelease, publish, cfgFor, target }
}

test('compareVersions orders numerically', () => {
  assert.ok(compareVersions('1.10.0', '1.9.9') > 0)
  assert.equal(compareVersions('v2.0.0', '2.0.0'), 0)
})

test('check only records the available update', async (t) => {
  const f = await fixture(t)
  const cfg = f.cfgFor(f.publish(f.makeRelease('1.1.0')))
  await run(cfg, 'check')
  const s = readStatus(cfg)
  assert.equal(s.available.version, '1.1.0')
  assert.equal(s.available.changelog, 'Changelog for 1.1.0')
  assert.equal(f.target(), '1.0.0')
})

test('newer release is installed, backend restarted, status recorded', async (t) => {
  const f = await fixture(t)
  const cfg = f.cfgFor(f.publish(f.makeRelease('1.1.0')))
  await run(cfg, 'auto')
  assert.equal(f.target(), '1.1.0')
  assert.equal(readStatus(cfg).lastResult.status, 'success')
  assert.equal(readStatus(cfg).available, null)
  const calls = fs.readFileSync(f.calls, 'utf8')
  assert.match(calls, /stop kmp-backend/)
  assert.match(calls, /start kmp-backend/)
  assert.match(calls, /try-restart kmp-buttons/)
  assert.equal(fs.readdirSync(path.join(f.root, 'data', 'backups')).length, 1)
})

test('corrupted checksum is rejected and current is untouched', async (t) => {
  const f = await fixture(t)
  const cfg = f.cfgFor(f.publish(f.makeRelease('1.1.0', { badChecksum: true })))
  await run(cfg, 'auto')
  assert.equal(f.target(), '1.0.0')
  const s = readStatus(cfg)
  assert.equal(s.lastResult.status, 'failed')
  assert.match(s.lastResult.message, /Checksum mismatch/)
  assert.ok(!fs.existsSync(path.join(f.root, 'releases', '1.1.0')))
  assert.ok(!fs.existsSync(f.calls), 'backend must not be touched when verification fails')
  assert.deepEqual(s.failedVersions, []) // transient failures are retried
})

test('archive with path traversal is rejected', async (t) => {
  const f = await fixture(t)
  const cfg = f.cfgFor(f.publish(f.makeRelease('1.1.0', { traversal: true })))
  await run(cfg, 'auto')
  assert.equal(f.target(), '1.0.0')
  assert.match(readStatus(cfg).lastResult.message, /Unsafe path/)
})

test('failed health check rolls back code and DB', async (t) => {
  const f = await fixture(t)
  const cfg = f.cfgFor(f.publish(f.makeRelease('1.1.0', { broken: true })))
  await run(cfg, 'auto')
  assert.equal(f.target(), '1.0.0')
  const s = readStatus(cfg)
  assert.equal(s.lastResult.status, 'rolled_back')
  assert.deepEqual(s.failedVersions, ['1.1.0'])
  assert.equal(fs.readFileSync(path.join(f.root, 'data', 'portal.db'), 'utf8'), 'db-before')
  assert.ok(!fs.existsSync(path.join(f.root, 'releases', '1.1.0')))

  // Timer runs don't retry a release that already failed...
  const before = fs.readFileSync(f.calls, 'utf8')
  await run(cfg, 'auto')
  assert.equal(fs.readFileSync(f.calls, 'utf8'), before)
})

test('old releases are pruned but current and previous are kept', async (t) => {
  const f = await fixture(t, '1.0.0')
  for (const v of ['1.0.1', '1.0.2', '1.0.3']) {
    fs.mkdirSync(path.join(f.root, 'releases', v, 'dist'), { recursive: true })
  }
  const cfg = f.cfgFor(f.publish(f.makeRelease('1.1.0')), { KMP_KEEP_RELEASES: '2' })
  await run(cfg, 'auto')
  const left = fs.readdirSync(path.join(f.root, 'releases')).sort()
  assert.deepEqual(left, ['1.0.0', '1.0.3', '1.1.0']) // newest 2 + previous (1.0.0)
})

test('up-to-date and prerelease/draft manifests do nothing', async (t) => {
  const f = await fixture(t)
  const rel = f.makeRelease('1.0.0')
  const cfg = f.cfgFor(f.publish(rel))
  await run(cfg, 'auto')
  assert.equal(readStatus(cfg).available, null)
  const pre = { ...f.makeRelease('2.0.0'), prerelease: true }
  await run(f.cfgFor(f.publish(pre)), 'auto')
  assert.equal(f.target(), '1.0.0')
})
