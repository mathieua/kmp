/**
 * Protects the 2S Li-ion pack: shuts the Pi down cleanly before the cells
 * are over-discharged.
 *
 * Policy:
 *  - The alarm is never muted or altered on battery; it fires like normal.
 *  - Shut down once the level stays at or below CRITICAL_PCT while on battery.
 *  - If an alarm is due within ALARM_GRACE_MIN, hold off until HARD_FLOOR_PCT
 *    so a nearly-flat clock still gets a chance to wake the kid.
 *  - Never shut down while an alarm is ringing or snoozed.
 *  - Plugging in external power cancels everything.
 */

import { exec } from 'child_process'
import { BatteryService, BatteryStatus } from './battery'
import { AlarmService } from './alarm'

export const CRITICAL_PCT = 5
export const HARD_FLOOR_PCT = 3
export const ALARM_GRACE_MIN = 60
const CONFIRM_READINGS = 3   // consecutive polls below threshold (~15 s)

export class PowerGuard {
  private below = 0
  private shuttingDown = false

  constructor(
    private battery: BatteryService,
    private alarm: AlarmService,
    private shutdown: () => void = () => { exec('sudo /sbin/shutdown -h now') },
  ) {}

  start(): () => void {
    return this.battery.onUpdate(s => this.onReading(s))
  }

  /** Exposed for tests. */
  onReading(s: BatteryStatus | null): void {
    if (this.shuttingDown) return
    if (!s || s.state !== 'discharging') { this.below = 0; return }

    const next = this.alarm.minutesUntilNext()
    const threshold = next !== null && next <= ALARM_GRACE_MIN ? HARD_FLOOR_PCT : CRITICAL_PCT

    if (s.level > threshold || this.alarm.isBusy()) { this.below = 0; return }
    if (++this.below < CONFIRM_READINGS) return

    this.shuttingDown = true
    console.log(`[battery] level ${s.level.toFixed(1)}% <= ${threshold}%, shutting down`)
    this.shutdown()
  }
}
