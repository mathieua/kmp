import * as fs from 'fs'
import * as path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface UpdateStatus {
  /** Version of the code that is running right now. */
  currentVersion: string
  /** False on dev machines / devices without the /opt/kmp updater installed. */
  supported: boolean
  state: 'idle' | 'checking' | 'updating'
  lastCheck: string | null
  lastCheckError: string | null
  available: { version: string; changelog: string; publishedAt: string | null } | null
  lastResult: { status: 'success' | 'failed' | 'rolled_back'; version: string; message: string; at: string } | null
}

// A run that died mid-way (power loss) leaves state != idle; don't show it forever.
const STALE_RUN_MS = 30 * 60_000

/**
 * Read side of the OTA updater (scripts/updater/kmp-updater.js). The updater
 * runs as root under systemd and communicates through two small files in the
 * writable data mount; the backend never touches releases itself.
 */
export class UpdateService {
  private readonly root = process.env.KMP_ROOT || '/opt/kmp'
  private readonly dataDir = path.join(this.root, 'data')
  // dist/electron/services -> repo / release root
  private readonly appRoot = path.resolve(__dirname, '../../..')

  getVersion(): string {
    for (const read of [
      () => fs.readFileSync(path.join(this.appRoot, 'VERSION'), 'utf8'),
      () => JSON.parse(fs.readFileSync(path.join(this.appRoot, 'package.json'), 'utf8')).version as string,
    ]) {
      try { const v = read().trim(); if (v) return v } catch { /* try next */ }
    }
    return 'unknown'
  }

  isSupported(): boolean {
    return fs.existsSync(path.join(this.root, 'bin', 'kmp-updater.js'))
  }

  getStatus(): UpdateStatus {
    const file = path.join(this.dataDir, 'update-status.json')
    let raw: Partial<UpdateStatus> = {}
    let stale = false
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'))
      stale = Date.now() - fs.statSync(file).mtimeMs > STALE_RUN_MS
    } catch { /* never run yet */ }

    const currentVersion = this.getVersion()
    const available = raw.available && raw.available.version !== currentVersion ? raw.available : null
    return {
      currentVersion,
      supported: this.isSupported(),
      state: stale ? 'idle' : raw.state ?? 'idle',
      lastCheck: raw.lastCheck ?? null,
      lastCheckError: raw.lastCheckError ?? null,
      available,
      lastResult: raw.lastResult ?? null,
    }
  }

  /** Ask the root updater to check (or check + install) via its systemd unit. */
  async request(action: 'check' | 'apply'): Promise<void> {
    fs.mkdirSync(this.dataDir, { recursive: true })
    fs.writeFileSync(path.join(this.dataDir, 'update-request.json'), JSON.stringify({ action }))
    // Exact argv is whitelisted in /etc/sudoers.d/kmp-updater.
    await execFileAsync('sudo', ['-n', '/usr/bin/systemctl', 'start', '--no-block', 'kmp-updater.service'])
  }
}
