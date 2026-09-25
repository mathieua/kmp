import { EventEmitter } from 'events'
import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'

// Hardware driver directory on the Pi
const HW_DIR = '/opt/kmp/hw'

// ALSA PCM status — trigger_time changes each time a new PCM session starts DMA.
// Only relevant on units with the I2S amp (hifiberry-dac overlay); harmless
// dead code on units without it, since readTriggerTime() just returns ''.
const PCM_STATUS_PATH = '/proc/asound/sndrpihifiberry/pcm0p/sub0/status'

// Silence padded before the audio starts (see the adelay note in play()).
const COLD_AMP_DELAY_MS = 1000  // amp has to be woken up
const WARM_DELAY_MS = 350       // amp already on — only covers the stream-volume lookup
const NO_AMP_DELAY_MS = 250     // no I2S amp on this unit

export interface Track {
  id: string
  filename: string
  filepath: string
  title: string
  artist?: string
  album?: string
  artwork?: string
  duration?: number
  /** Repeat forever (generated alarm sounds are short patterns). */
  loop?: boolean
}

export interface PlaybackState {
  isPlaying: boolean
  isMuted: boolean
  currentTrack: Track | null
  position: number
  duration: number
  volume: number
  queue: Track[]
  queueIndex: number
}

export class AudioService extends EventEmitter {
  private player: ChildProcess | null = null
  private ampProc: ChildProcess | null = null
  // The current ffplay child's own PipeWire stream id (not the sink id —
  // see setAlsaVolume for why). Re-resolved once per play(), since a new
  // ffplay process gets a new, unpredictable stream id every time.
  private currentStreamId: string | null = null
  private state: PlaybackState = {
    isPlaying: false,
    isMuted: false,
    currentTrack: null,
    position: 0,
    duration: 0,
    volume: 70,
    queue: [],
    queueIndex: -1,
  }
  private positionInterval: NodeJS.Timeout | null = null
  private mediaDir: string
  // Bumped on every play(); lets a superseded call (rapid skipping) bail out
  // after each await instead of spawning a second ffplay.
  private playSeq = 0
  private ampEnabled = false
  private libraryProvider: (() => Promise<Track[]>) | null = null

  constructor(mediaDir: string) {
    super()
    this.mediaDir = mediaDir
    this.spawnAmpControl()
    // Note: softvol 'Master' control is initialized on first PCM open. We set
    // ALSA to 0% at the start of every play() call, so the control will exist
    // by the time we restore the volume. No init amixer call needed here.
  }

  getState(): PlaybackState {
    return { ...this.state }
  }

  async scanMedia(): Promise<Track[]> {
    const tracks: Track[] = []
    const audioExtensions = ['.mp3', '.m4a', '.ogg', '.wav', '.flac']
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif']

    const scanDir = (dir: string) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
        return
      }

      const entries = fs.readdirSync(dir, { withFileTypes: true })
      const files = entries.filter(e => !e.isDirectory()).map(e => e.name)

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          scanDir(fullPath)
        } else if (audioExtensions.includes(path.extname(entry.name).toLowerCase())) {
          const filename = entry.name
          const title = path.basename(filename, path.extname(filename))

          // Look for matching artwork
          const artwork = this.findArtwork(dir, title, files, imageExtensions)

          tracks.push({
            id: Buffer.from(fullPath).toString('base64'),
            filename,
            filepath: fullPath,
            title,
            artwork,
          })
        }
      }
    }

    scanDir(this.mediaDir)
    return tracks
  }

  private findArtwork(dir: string, title: string, files: string[], imageExtensions: string[]): string | undefined {
    const titleLower = title.toLowerCase()

    // First, try exact match (same name, different extension)
    for (const ext of imageExtensions) {
      const exactMatch = files.find(f => f.toLowerCase() === titleLower + ext)
      if (exactMatch) {
        return path.join(dir, exactMatch)
      }
    }

    // Then try partial match (artwork filename contains track title or vice versa)
    for (const file of files) {
      const fileLower = file.toLowerCase()
      const fileBase = path.basename(fileLower, path.extname(fileLower))
      if (imageExtensions.includes(path.extname(fileLower))) {
        if (fileBase.includes(titleLower.substring(0, 10)) || titleLower.includes(fileBase.substring(0, 10))) {
          return path.join(dir, file)
        }
      }
    }

    return undefined
  }

  /** Where "play with nothing selected" and random picks get their songs. */
  setLibraryProvider(provider: () => Promise<Track[]>): void {
    this.libraryProvider = provider
  }

  async play(track?: Track, opts: { startAt?: number } = {}): Promise<void> {
    const seq = ++this.playSeq
    if (!track && !this.state.currentTrack) return

    if (track || opts.startAt !== undefined) {
      if (track) {
        this.state.currentTrack = track
        this.state.duration = track.duration ?? 0
      }
      this.state.position = opts.startAt ?? 0
      // Optimistic update: the UI shows the new song immediately instead of
      // after the old process is torn down and the new one is running.
      this.state.isPlaying = true
      this.emit('stateChange', this.getState())

      // If the amp is already on and its clock is running, keep it on across
      // the switch (the sink stays open) instead of cycling it.
      await this.killPlayer(this.ampEnabled && this.readPcmState() === 'RUNNING')
      if (seq !== this.playSeq) return
    }

    const current = this.state.currentTrack!
    const hasPcmStatus = fs.existsSync(PCM_STATUS_PATH)

    // Snapshot trigger_time BEFORE spawning so we can detect when the new
    // PCM session's DMA actually starts (trigger_time is a kernel timestamp
    // that changes each time snd_pcm_trigger fires).
    const triggerBaseline = this.readTriggerTime()
    // trigger_time only changes on a cold start. If the PCM is already
    // RUNNING (sink kept open by PipeWire between songs) BCLK is stable and
    // waiting would just burn the whole timeout.
    const needsPcmWait = hasPcmStatus && this.readPcmState() !== 'RUNNING'
    const ampWasOn = this.ampEnabled

    // Use ffplay (comes with ffmpeg) for playback
    // -nodisp: no video window
    // -autoexit: exit when done
    // -loglevel quiet: suppress output
    // adelay pads digital silence so the amp's startup transient, and the
    // moment before we've resolved+set this stream's volume below, are both
    // inaudible. It only needs to be long when the amp has to be woken up;
    // a warm switch or a unit with no amp needs just enough to cover the
    // stream-volume lookup.
    const delayMs = ampWasOn ? WARM_DELAY_MS : hasPcmStatus ? COLD_AMP_DELAY_MS : NO_AMP_DELAY_MS
    const args = ['-nodisp', '-autoexit', '-loglevel', 'quiet', '-af', `adelay=${delayMs}|${delayMs}`]
    if (opts.startAt) args.push('-ss', String(opts.startAt))
    if (current.loop) args.push('-loop', '0')
    args.push(current.filepath)

    const proc = spawn('ffplay', args)
    this.player = proc

    proc.on('close', (code) => {
      if (this.player !== proc) return    // killed on purpose / superseded
      this.player = null
      this.stopPositionTracking()
      this.state.isPlaying = false
      this.state.position = 0
      this.setAmpSD(false)
      this.emit('stateChange', this.getState())
      if (code === 0) {
        // Track finished naturally
        this.emit('trackEnded')
        // Auto-play next if in queue
        this.playNext()
      }
    })

    proc.on('error', (err) => {
      console.error('Audio player error:', err)
      if (this.player !== proc) return
      this.player = null
      this.state.isPlaying = false
      this.setAmpSD(false)
      this.emit('stateChange', this.getState())
    })

    // Wait until the PCM DMA has actually started (trigger_time changed) so
    // we know I2S BCLK is stable before enabling the amp.
    if (needsPcmWait) {
      const t0 = Date.now()
      const detected = await this.waitForPCMRunning(triggerBaseline, 2000)
      console.log(`[audio] PCM DMA started: detected=${detected} in ${Date.now() - t0} ms`)
      if (seq !== this.playSeq) return
    }

    this.setAmpSD(true)

    // By this point the PCM is open, so ffplay's PipeWire stream is
    // guaranteed to be registered — resolve its id and set its volume. This
    // is the only mechanism that actually reaches the speaker (see
    // setAlsaVolume below) — the sink's own volume, adjustable via
    // @DEFAULT_AUDIO_SINK@, was confirmed on-device to have zero audible
    // effect for this stream's routing.
    this.currentStreamId = await this.getFfplayStreamId()
    if (seq !== this.playSeq) return
    this.setAlsaVolume(this.state.volume)

    this.state.isPlaying = true
    this.emit('stateChange', this.getState())

    // Track position (approximate since ffplay doesn't report it easily)
    this.startPositionTracking()
  }

  /** Jump to `seconds` — ffplay can't seek externally, so this restarts it at that offset. */
  async seek(seconds: number): Promise<void> {
    if (!this.state.currentTrack) return
    const max = this.state.duration > 1 ? this.state.duration - 1 : Infinity
    await this.play(undefined, { startAt: Math.max(0, Math.min(max, Math.floor(seconds))) })
  }

  /** Nothing selected: shuffle the whole library into the queue and start it. */
  async playRandom(): Promise<void> {
    const tracks = await (this.libraryProvider?.() ?? this.scanMedia())
    if (tracks.length === 0) return
    const shuffled = [...tracks]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    await this.setQueue(shuffled, 0)
  }

  async pause(): Promise<void> {
    if (this.player && this.state.isPlaying) {
      this.setAlsaVolume(0)
      this.setAmpSD(false)                  // amp off while I2S still running
      await new Promise<void>(resolve => setTimeout(resolve, 50))
      this.player.kill('SIGSTOP')
      this.state.isPlaying = false
      this.stopPositionTracking()
      this.emit('stateChange', this.getState())
    }
  }

  async resume(): Promise<void> {
    if (this.player && !this.state.isPlaying) {
      this.setAlsaVolume(0)
      this.player.kill('SIGCONT')           // I2S resumes
      await new Promise<void>(resolve => setTimeout(resolve, 50))
      this.setAmpSD(true)                   // amp on once BCLK is stable again
      setTimeout(() => this.setAlsaVolume(this.state.volume), 50)
      this.state.isPlaying = true
      this.startPositionTracking()
      this.emit('stateChange', this.getState())
    }
  }

  async togglePlayPause(): Promise<void> {
    if (this.state.isPlaying) {
      await this.pause()
    } else if (this.player) {
      await this.resume()
    } else if (this.state.currentTrack) {
      await this.play()
    } else {
      await this.playRandom()
    }
  }

  /**
   * Silences and kills the current ffplay. `keepAmp` leaves the amplifier
   * enabled (used when switching songs while the I2S clock keeps running).
   */
  private async killPlayer(keepAmp = false): Promise<void> {
    this.stopPositionTracking()
    const proc = this.player
    if (!proc) return
    this.setAlsaVolume(0)
    if (!keepAmp) this.setAmpSD(false)      // amp off before I2S clock stops
    await new Promise<void>(resolve => setTimeout(resolve, 50))
    // Await actual process exit so the PCM fd is fully released before the
    // next play() opens it. Without this, new ffplay races the dying process
    // for exclusive PCM access and SDL returns EBUSY intermittently.
    const alive = proc.exitCode === null && proc.signalCode === null
    const exited = new Promise<void>(resolve => proc.once('close', resolve))
    this.player = null
    proc.kill('SIGKILL')
    if (alive) await exited
    this.currentStreamId = null
  }

  async stop(): Promise<void> {
    this.playSeq++    // cancel any play() still starting up
    await this.killPlayer()
    this.state.isPlaying = false
    this.state.position = 0
    this.emit('stateChange', this.getState())
  }

  async setVolume(volume: number): Promise<void> {
    this.state.volume = Math.max(0, Math.min(100, volume))
    this.setAlsaVolume(this.state.volume)
    this.emit('stateChange', this.getState())
  }

  async toggleMute(): Promise<void> {
    this.state.isMuted = !this.state.isMuted
    this.setAlsaVolume(this.state.isMuted ? 0 : this.state.volume)
    this.emit('stateChange', this.getState())
  }

  async setQueue(tracks: Track[], startIndex: number = 0): Promise<void> {
    this.state.queue = tracks
    this.state.queueIndex = startIndex
    if (tracks.length > 0 && startIndex < tracks.length) {
      await this.play(tracks[startIndex])
    }
  }

  async playNext(): Promise<void> {
    if (this.state.queue.length === 0) return

    const nextIndex = this.state.queueIndex + 1
    if (nextIndex < this.state.queue.length) {
      this.state.queueIndex = nextIndex
      await this.play(this.state.queue[nextIndex])
    }
  }

  async playPrevious(): Promise<void> {
    if (this.state.queue.length === 0) return

    // If more than 3 seconds in, restart current track
    if (this.state.position > 3) {
      await this.play(this.state.currentTrack!)
      return
    }

    const prevIndex = this.state.queueIndex - 1
    if (prevIndex >= 0) {
      this.state.queueIndex = prevIndex
      await this.play(this.state.queue[prevIndex])
    }
  }

  // ---------------------------------------------------------------------------
  // PCM readiness detection
  // ---------------------------------------------------------------------------

  /** Reads trigger_time from the hifiberry PCM status file. */
  private readTriggerTime(): string {
    try {
      const content = fs.readFileSync(PCM_STATUS_PATH, 'utf8')
      return content.match(/trigger_time:\s+(\S+)/)?.[1] ?? ''
    } catch {
      return ''
    }
  }

  /** PCM state from the hifiberry status file ('RUNNING', 'PREPARED', 'closed', ...), '' if absent. */
  private readPcmState(): string {
    try {
      const content = fs.readFileSync(PCM_STATUS_PATH, 'utf8')
      return content.match(/^state:\s+(\S+)/m)?.[1] ?? content.trim()
    } catch {
      return ''
    }
  }

  /**
   * Polls until trigger_time in the PCM status file differs from baseline,
   * meaning a new DMA session has started and I2S BCLK is stable.
   * Returns true if detected, false on timeout (dev env or slow start).
   */
  private async waitForPCMRunning(baseline: string, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const current = this.readTriggerTime()
      if (current && current !== baseline) return true
      await new Promise<void>(resolve => setTimeout(resolve, 20))
    }
    console.warn(`[audio] waitForPCMRunning timed out after ${timeoutMs} ms (baseline=${baseline})`)
    return false
  }

  /** Tear down the amp control daemon on service shutdown. */
  destroy(): void {
    this.setAmpSD(false)
    this.ampProc?.kill()
    this.ampProc = null
  }

  // ---------------------------------------------------------------------------
  // Amp SD_MODE — GPIO16 via amp_control.py daemon
  // ---------------------------------------------------------------------------

  private spawnAmpControl(): void {
    const scriptPath = `${HW_DIR}/amp_control.py`
    if (!fs.existsSync(scriptPath)) {
      console.log('[amp_control] script not found, skipping')
      return
    }

    const proc = spawn('python3', [scriptPath], {
      stdio: ['pipe', 'ignore', 'pipe'],
    })
    this.ampProc = proc

    proc.stderr?.on('data', (d) =>
      console.error('[amp_control]', d.toString().trim())
    )

    proc.on('exit', (code) => {
      console.log(`[amp_control] exited (${code}), restarting in 1 s`)
      this.ampProc = null
      setTimeout(() => this.spawnAmpControl(), 1000)
    })

    // Ensure amp starts in shutdown state
    this.setAmpSD(false)
  }

  private setAmpSD(enable: boolean): void {
    this.ampEnabled = enable
    try {
      this.ampProc?.stdin?.write(JSON.stringify({ cmd: enable ? 'enable' : 'disable' }) + '\n')
    } catch {
      // daemon not yet ready — ignore
    }
  }

  // Units with the I2S amp route audio through PipeWire (see hw/install-amp.sh)
  // because ALSA's own softvol volume control turned out to be a dead end for
  // this use case: it's a dynamically-created "user control" owned by
  // whichever process opened the PCM, and the kernel refuses writes to it
  // from any other process — confirmed on-device, including as root, and
  // regardless of what the control is named. Units without PipeWire (e.g.
  // Leo's clock, a real hardware control on a USB speaker — no softvol
  // involved, so no ownership issue in the first place) fall back to plain
  // amixer instead.
  private hasWpctl = fs.existsSync('/usr/bin/wpctl')

  /**
   * Finds ffplay's own PipeWire stream id via pw-dump. Confirmed on-device
   * that adjusting @DEFAULT_AUDIO_SINK@ (the output device's volume) has
   * ZERO audible effect here — ffplay's SDL audio backend connects through
   * the pipewire-pulse compatibility bridge (auto-preferred over plain ALSA
   * once pipewire-pulse is installed, which pipewire-alsa pulls in), and the
   * volume that actually reaches the speaker is the per-stream volume, not
   * the sink's. Each ffplay spawn gets a new, unpredictable stream id, so
   * this must be re-resolved per track rather than cached across plays.
   */
  private getFfplayStreamId(): Promise<string | null> {
    return new Promise(resolve => {
      const proc = spawn('pw-dump')
      let out = ''
      proc.stdout?.on('data', d => { out += d })
      proc.on('close', () => {
        try {
          const nodes = JSON.parse(out) as Array<{ type: string; id: number; info?: { props?: Record<string, unknown> } }>
          const stream = nodes.find(n =>
            n.type === 'PipeWire:Interface:Node' &&
            n.info?.props?.['application.process.binary'] === 'ffplay' &&
            n.info?.props?.['media.class'] === 'Stream/Output/Audio'
          )
          resolve(stream ? String(stream.id) : null)
        } catch {
          resolve(null)
        }
      })
      proc.on('error', () => resolve(null))
    })
  }

  /** Set output volume directly without updating state.volume (used for mute/unmute around transitions). */
  private setAlsaVolume(pct: number): void {
    if (this.hasWpctl) {
      if (this.currentStreamId) {
        spawn('wpctl', ['set-volume', this.currentStreamId, `${Math.round(pct)}%`], { stdio: 'ignore' })
      }
      // No current stream (nothing playing) — nothing to set; the next
      // play() applies this.state.volume once the new stream is resolved.
    } else {
      spawn('amixer', ['sset', 'PCM', `${Math.round(pct)}%`], { stdio: 'ignore' })
    }
  }

  // ---------------------------------------------------------------------------
  // Position tracking
  // ---------------------------------------------------------------------------

  private startPositionTracking(): void {
    this.stopPositionTracking()
    this.positionInterval = setInterval(() => {
      if (this.state.isPlaying) {
        this.state.position += 1
        this.emit('stateChange', this.getState())
      }
    }, 1000)
  }

  private stopPositionTracking(): void {
    if (this.positionInterval) {
      clearInterval(this.positionInterval)
      this.positionInterval = null
    }
  }
}
