/**
 * Hardware integration service.
 *
 * Responsibilities:
 *  - Connect to the encoder daemon's Unix socket (/tmp/kmp-encoder.sock)
 *    and the buttons daemon's Unix socket (/tmp/kmp-buttons.sock).
 *  - Dispatch incoming hardware events to the audio/alarm services (never
 *    through the React renderer layer).
 *  - Spawn light_sensor.py as a child process and write screen brightness
 *    to /sys/class/backlight/<panel>/brightness (with 5% hysteresis),
 *    scaled to that backlight device's own max_brightness range.
 *  - Spawn led_control.py as a persistent child process and drive GPIO26
 *    (snooze LED) with a 500 ms flash loop while an alarm is firing.
 */

import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as net from 'net'
import * as readline from 'readline'

import { AudioService } from './audio'
import { AlarmService } from './alarm'

const ENCODER_SOCK   = '/tmp/kmp-encoder.sock'
const BUTTONS_SOCK   = '/tmp/kmp-buttons.sock'
const BACKLIGHT_ROOT = '/sys/class/backlight'
const HW_DIR         = '/opt/kmp/hw'
const HYSTERESIS_PCT = 5  // percent — prevents flicker near thresholds

/**
 * Finds the backlight sysfs path and its max_brightness. Not hardcoded to a
 * specific device name — the previous hardcoded "10-0045" (a leftover from
 * a different kernel/panel-driver's numbering, coincidentally also the
 * touch controller's I2C address on this one) silently pointed at a
 * nonexistent path, so every brightness write failed and was swallowed by
 * the catch block below. A max_brightness range (31 here) that isn't 255
 * has bitten this exact project before too — scale by whatever the device
 * actually reports rather than assuming a fixed range.
 */
function findBacklight(): { path: string; max: number } | null {
  try {
    const [device] = fs.readdirSync(BACKLIGHT_ROOT)
    if (!device) return null
    const dir = `${BACKLIGHT_ROOT}/${device}`
    const max = parseInt(fs.readFileSync(`${dir}/max_brightness`, 'utf8').trim(), 10)
    return { path: `${dir}/brightness`, max }
  } catch {
    return null
  }
}

/** Maps a lux reading to a target brightness percentage (0-100). */
function luxToBrightnessPct(lux: number): number {
  if (lux < 10)  return 15   // dark room
  if (lux < 50)  return 30   // dim
  if (lux < 200) return 60   // normal indoor
  if (lux < 500) return 80   // bright indoor
  return 100                  // sunlight / near window
}

export class HardwareService {
  private audio: AudioService
  private alarm: AlarmService

  private lightProc: ChildProcess | null = null
  private ledProc: ChildProcess | null = null
  private ledInterval: NodeJS.Timeout | null = null
  private ledState = false
  private currentBrightnessPct = -1
  private backlight = findBacklight()

  constructor(audio: AudioService, alarm: AlarmService) {
    this.audio = audio
    this.alarm = alarm
    if (!this.backlight) {
      console.log('[light_sensor] no backlight device found under ' + BACKLIGHT_ROOT + ', skipping brightness control')
    }
  }

  start(): void {
    this.spawnLightSensor()
    this.spawnLedDaemon()

    // Reconnecting socket listeners
    this.connectSocket(ENCODER_SOCK, (event) => this.onEncoderEvent(event))
    this.connectSocket(BUTTONS_SOCK, (event) => this.onButtonEvent(event))

    // Drive snooze LED from alarm lifecycle events
    this.alarm.on('fired',     () => this.startAlarmLED())
    this.alarm.on('dismissed', () => this.stopAlarmLED())
    this.alarm.on('snoozed',   () => this.stopAlarmLED())
  }

  stop(): void {
    this.stopAlarmLED()
    this.lightProc?.kill()
    this.ledProc?.kill()
  }

  // ---------------------------------------------------------------------------
  // Unix socket — auto-reconnecting reader
  // ---------------------------------------------------------------------------

  private connectSocket(sockPath: string, handler: (event: string) => void): void {
    const attempt = () => {
      const client = net.createConnection(sockPath)

      const rl = readline.createInterface({ input: client })
      rl.on('line', (line) => {
        try {
          const msg = JSON.parse(line) as { event?: string }
          if (typeof msg.event === 'string') {
            handler(msg.event)
          }
        } catch {
          // ignore malformed lines
        }
      })

      rl.on('error', () => {})   // suppress readline re-emit of socket errors

      // 'error' always precedes 'close' on a failed connect — destroy() here
      // ensures the FD is released, and 'close' will fire next to schedule retry.
      client.on('error', () => {
        client.destroy()
      })

      // Single reconnect point: fires after both error-then-close and normal close.
      client.on('close', () => {
        rl.close()
        setTimeout(attempt, 2000)
      })
    }

    attempt()
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  private onEncoderEvent(event: string): void {
    switch (event) {
      case 'volume_up': {
        const vol = Math.min(100, this.audio.getState().volume + 2)
        this.audio.setVolume(vol)
        break
      }
      case 'volume_down': {
        const vol = Math.max(0, this.audio.getState().volume - 2)
        this.audio.setVolume(vol)
        break
      }
      case 'mute_toggle': {
        this.audio.toggleMute()
        break
      }
    }
  }

  private onButtonEvent(event: string): void {
    switch (event) {
      case 'play_pause': this.audio.togglePlayPause(); break
      case 'skip':       this.audio.playNext();        break
      case 'previous':   this.audio.playPrevious();    break
      case 'snooze':     this.alarm.snooze();          break
    }
  }

  // ---------------------------------------------------------------------------
  // Light sensor — child process + brightness control
  // ---------------------------------------------------------------------------

  private spawnLightSensor(): void {
    const scriptPath = `${HW_DIR}/light_sensor.py`
    if (!fs.existsSync(scriptPath)) {
      console.log('[light_sensor] script not found, skipping')
      return
    }

    const proc = spawn('python3', [scriptPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.lightProc = proc

    const rl = readline.createInterface({ input: proc.stdout! })
    rl.on('line', (line) => {
      try {
        const { lux } = JSON.parse(line) as { lux: number }
        this.applyBrightness(lux)
      } catch {
        // ignore
      }
    })

    proc.stderr?.on('data', (d) =>
      console.error('[light_sensor]', d.toString().trim())
    )

    proc.on('exit', (code) => {
      console.log(`[light_sensor] exited (${code}), restarting in 5 s`)
      this.lightProc = null
      setTimeout(() => this.spawnLightSensor(), 5000)
    })
  }

  private applyBrightness(lux: number): void {
    if (!this.backlight) return

    const targetPct = luxToBrightnessPct(lux)
    if (Math.abs(targetPct - this.currentBrightnessPct) <= HYSTERESIS_PCT) return

    try {
      const raw = Math.round((targetPct / 100) * this.backlight.max)
      fs.writeFileSync(this.backlight.path, String(raw))
      this.currentBrightnessPct = targetPct
    } catch {
      // sysfs path absent in dev — ignore silently
    }
  }

  // ---------------------------------------------------------------------------
  // Snooze LED — GPIO26 flash loop via led_control.py
  // ---------------------------------------------------------------------------

  private spawnLedDaemon(): void {
    const scriptPath = `${HW_DIR}/led_control.py`
    if (!fs.existsSync(scriptPath)) {
      console.log('[led_control] script not found, skipping')
      return
    }

    const proc = spawn('python3', [scriptPath], {
      stdio: ['pipe', 'ignore', 'pipe'],
    })
    this.ledProc = proc

    proc.stderr?.on('data', (d) =>
      console.error('[led_control]', d.toString().trim())
    )

    proc.on('exit', (code) => {
      console.log(`[led_control] exited (${code}), restarting in 1 s`)
      this.ledProc = null
      setTimeout(() => this.spawnLedDaemon(), 1000)
    })
  }

  private writeLED(on: boolean): void {
    try {
      this.ledProc?.stdin?.write(JSON.stringify({ on }) + '\n')
    } catch {
      // process not yet ready — ignore
    }
  }

  startAlarmLED(): void {
    // Belt-and-suspenders: clear any leftover interval
    this.stopAlarmLED()
    this.ledState = false
    this.ledInterval = setInterval(() => {
      this.ledState = !this.ledState
      this.writeLED(this.ledState)
    }, 500)
  }

  stopAlarmLED(): void {
    if (this.ledInterval) {
      clearInterval(this.ledInterval)
      this.ledInterval = null
    }
    this.writeLED(false)
  }
}
