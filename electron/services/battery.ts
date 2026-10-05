/**
 * Waveshare UPS HAT (B) battery monitor.
 *
 * The HAT's INA219 sits on I2C bus 1 at 0x42. We poll it with `i2cget`
 * (async, so the main process is never blocked), smooth the readings, and
 * cache the result for DeviceService.getBattery(). Reports null when no UPS
 * answers on the bus, so other units never show a battery icon.
 *
 * Needs I2C access for the Electron user (member of the `i2c` group).
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'

const execFileAsync = promisify(execFile)

const I2C_BUS = '1'
const INA219_ADDR = '0x42'
const REG_SHUNT = '0x01'
const REG_BUS = '0x02'

const POLL_MS = 5_000
const WINDOW = 6                 // samples averaged (~30 s)
const MAX_FAILURES = 3           // consecutive failed polls before "no UPS"
const LOG_EVERY_MS = 60_000
const LOG_MAX_BYTES = 2 * 1024 * 1024   // rotate to <file>.1 beyond this
const LOG_HEADER = 'timestamp,voltage_raw,current_raw,voltage_avg,current_avg,level,state\n'
const SHUNT_OHMS = 0.1           // Model B
const CURRENT_DEADBAND_A = 0.05  // |I| below this counts as idle
const FULL_LEVEL = 99
const FULL_CURRENT_A = 0.1
// 2S pack of 2x18650, 3400 mAh each at 7.4 V nominal (~25.2 Wh). Only used
// for the time-remaining estimate.
const PACK_WH = 3.4 * 7.4

export type BatteryState = 'charging' | 'discharging' | 'full' | 'idle'

export interface BatteryStatus {
  /** 0-100 */
  level: number
  charging: boolean
  state: BatteryState
  /** Pack voltage, V */
  voltage: number
  /** Signed: positive = charging, negative = discharging, A */
  current: number
  /** Absolute power flowing in or out of the pack, W */
  power: number
  externalPower: boolean
  /** Minutes until empty (discharging) or full (charging); null when unknown */
  minutesRemaining: number | null
}

/** SMBus word reads are little-endian; INA219 registers are big-endian. */
const swap = (w: number) => ((w & 0xff) << 8) | (w >> 8)

async function readReg(reg: string): Promise<number> {
  const { stdout } = await execFileAsync('i2cget', ['-y', I2C_BUS, INA219_ADDR, reg, 'w'], { timeout: 2000 })
  const raw = parseInt(stdout.trim(), 16)
  if (Number.isNaN(raw)) throw new Error(`bad i2cget output: ${stdout}`)
  return swap(raw)
}

export const voltageFromRaw = (raw: number) => ((raw >> 3) * 4) / 1000
export const currentFromRaw = (raw: number) => {
  const signed = raw > 0x7fff ? raw - 0x10000 : raw
  return (signed * 0.01) / 1000 / SHUNT_OHMS   // 10 µV/LSB → V, then I = V / R
}
export const levelFromVoltage = (v: number) => Math.max(0, Math.min(100, ((v - 6) / 2.4) * 100))

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

export class BatteryService {
  private timer: NodeJS.Timeout | null = null
  private volts: number[] = []
  private amps: number[] = []
  private failures = 0
  private status: BatteryStatus | null = null
  private state: BatteryState = 'idle'
  private level: number | null = null
  private listeners = new Set<(s: BatteryStatus | null) => void>()
  private lastLog = 0

  /** @param logPath optional CSV file for charge/discharge history (one row a minute). */
  constructor(private logPath?: string) {}

  start(): void {
    if (this.timer) return
    void this.poll()
    this.timer = setInterval(() => void this.poll(), POLL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  get(): BatteryStatus | null {
    return this.status
  }

  /** Called with every new reading (or null if the UPS disappears). */
  onUpdate(cb: (s: BatteryStatus | null) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private async poll(): Promise<void> {
    try {
      const [busRaw, shuntRaw] = [await readReg(REG_BUS), await readReg(REG_SHUNT)]
      this.failures = 0
      this.ingest(voltageFromRaw(busRaw), currentFromRaw(shuntRaw))
    } catch (err) {
      // i2cget missing (dev machine) or no device: no battery on this unit.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') this.stop()
      if (++this.failures >= MAX_FAILURES && this.status) {
        this.status = null
        this.volts = []
        this.amps = []
        this.level = null
        this.emit()
      }
    }
  }

  private ingest(v: number, i: number): void {
    this.volts.push(v)
    this.amps.push(i)
    if (this.volts.length > WINDOW) { this.volts.shift(); this.amps.shift() }

    const voltage = avg(this.volts)
    const current = avg(this.amps)

    // State with a deadband so noise around 0 A doesn't flicker.
    if (current > CURRENT_DEADBAND_A) this.state = 'charging'
    else if (current < -CURRENT_DEADBAND_A) this.state = 'discharging'
    else if (this.state !== 'full') this.state = 'idle'

    // Voltage-based % jumps when charging starts/stops (IR drop), so while
    // discharging it may only fall, and while charging it may only rise.
    const measured = levelFromVoltage(voltage)
    if (this.level === null) this.level = measured
    else if (this.state === 'discharging') this.level = Math.min(this.level, measured)
    else if (this.state === 'charging') this.level = Math.max(this.level, measured)
    else this.level = measured

    if (this.state === 'charging' && this.level >= FULL_LEVEL && current < FULL_CURRENT_A) this.state = 'full'
    if (this.state === 'full' && current > FULL_CURRENT_A * 2) this.state = 'charging'

    const power = voltage * Math.abs(current)
    let minutesRemaining: number | null = null
    if (power > 0.5) {
      if (this.state === 'discharging') minutesRemaining = ((this.level / 100) * PACK_WH / power) * 60
      else if (this.state === 'charging') minutesRemaining = (((100 - this.level) / 100) * PACK_WH / power) * 60
    }

    this.status = {
      level: this.level,
      charging: this.state === 'charging',
      state: this.state,
      voltage,
      current,
      power,
      externalPower: this.state !== 'discharging',
      minutesRemaining: minutesRemaining === null ? null : Math.round(minutesRemaining),
    }
    this.emit()
    this.log(v, i, voltage, current)
  }

  // Calibration data: lets us fit the real capacity and discharge curve later.
  private log(vRaw: number, iRaw: number, vAvg: number, iAvg: number): void {
    if (!this.logPath || !this.status) return
    const now = Date.now()
    if (now - this.lastLog < LOG_EVERY_MS) return
    this.lastLog = now
    try {
      if (fs.existsSync(this.logPath) && fs.statSync(this.logPath).size > LOG_MAX_BYTES) {
        fs.renameSync(this.logPath, `${this.logPath}.1`)
      }
      if (!fs.existsSync(this.logPath)) fs.writeFileSync(this.logPath, LOG_HEADER)
      fs.appendFileSync(this.logPath, [
        new Date(now).toISOString(), vRaw.toFixed(3), iRaw.toFixed(3),
        vAvg.toFixed(3), iAvg.toFixed(3), this.status.level.toFixed(1), this.status.state,
      ].join(',') + '\n')
    } catch {
      // logging must never break monitoring
    }
  }

  private emit(): void {
    for (const cb of this.listeners) cb(this.status)
  }
}
