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

export interface Track {
  id: string
  filename: string
  filepath: string
  title: string
  artwork?: string
  duration?: number
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

  async play(track?: Track): Promise<void> {
    if (track) {
      // Stop current playback
      await this.stop()

      this.state.currentTrack = track
      this.state.position = 0
    }

    if (!this.state.currentTrack) {
      return
    }

    // Snapshot trigger_time BEFORE spawning so we can detect when the new
    // PCM session's DMA actually starts (trigger_time is a kernel timestamp
    // that changes each time snd_pcm_trigger fires).
    const triggerBaseline = this.readTriggerTime()

    // Use ffplay (comes with ffmpeg) for playback
    // -nodisp: no video window
    // -autoexit: exit when done
    // -loglevel quiet: suppress output
    // adelay pads 1000 ms of digital silence so any I2S/amp startup transient,
    // and the moment before we've resolved+set this stream's volume below,
    // are both inaudible (silence at any volume is still silence) — a no-op
    // cost on units without an amp to wake.
    this.player = spawn('ffplay', [
      '-nodisp',
      '-autoexit',
      '-loglevel', 'quiet',
      '-af', 'adelay=1000|1000',
      this.state.currentTrack.filepath,
    ])

    // Wait until the PCM DMA has actually started (trigger_time changed) so
    // we know I2S BCLK is stable before enabling the amp. Times out quickly
    // and harmlessly on units without the hifiberry PCM status file.
    const t0 = Date.now()
    const detected = await this.waitForPCMRunning(triggerBaseline, 2000)
    console.log(`[audio] PCM DMA started: detected=${detected} in ${Date.now() - t0} ms`)

    this.setAmpSD(true)

    // By this point the PCM is open, so ffplay's PipeWire stream is
    // guaranteed to be registered — resolve its id and set its volume. This
    // is the only mechanism that actually reaches the speaker (see
    // setAlsaVolume below) — the sink's own volume, adjustable via
    // @DEFAULT_AUDIO_SINK@, was confirmed on-device to have zero audible
    // effect for this stream's routing.
    this.currentStreamId = await this.getFfplayStreamId()
    this.setAlsaVolume(this.state.volume)

    this.state.isPlaying = true
    this.emit('stateChange', this.getState())

    // Track position (approximate since ffplay doesn't report it easily)
    this.startPositionTracking()

    this.player.on('close', (code) => {
      this.stopPositionTracking()
      if (code === 0) {
        // Track finished naturally
        this.state.isPlaying = false
        this.state.position = 0
        this.setAmpSD(false)
        this.emit('stateChange', this.getState())
        this.emit('trackEnded')

        // Auto-play next if in queue
        this.playNext()
      }
    })

    this.player.on('error', (err) => {
      console.error('Audio player error:', err)
      this.state.isPlaying = false
      this.setAmpSD(false)
      this.emit('stateChange', this.getState())
    })
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
    }
  }

  async stop(): Promise<void> {
    if (this.player) {
      this.setAlsaVolume(0)
      this.setAmpSD(false)                  // amp off before I2S clock stops
      await new Promise<void>(resolve => setTimeout(resolve, 50))
      // Await actual process exit so the PCM fd is fully released before the
      // next play() opens it. Without this, new ffplay races the dying process
      // for exclusive PCM access and SDL returns EBUSY intermittently.
      const exited = new Promise<void>(resolve => this.player!.once('close', resolve))
      this.player.kill('SIGKILL')
      this.player = null
      await exited
    }
    this.currentStreamId = null
    this.state.isPlaying = false
    this.state.position = 0
    this.stopPositionTracking()
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

  setQueue(tracks: Track[], startIndex: number = 0): void {
    this.state.queue = tracks
    this.state.queueIndex = startIndex
    if (tracks.length > 0 && startIndex < tracks.length) {
      this.play(tracks[startIndex])
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
