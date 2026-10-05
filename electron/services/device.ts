import { exec } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import * as path from 'path'
import { BatteryService, BatteryStatus } from './battery'
import { isHostnameOnboarded, setHostnameOnboarded } from './database'

const execAsync = promisify(exec)

// RFC 1123 hostname label rules: lowercase letters, digits, hyphens, 1-63
// chars, can't start or end with a hyphen.
const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

export type { BatteryStatus }

export class DeviceService {
  readonly battery: BatteryService

  /** @param dataDir where the battery history CSV is kept */
  constructor(dataDir?: string) {
    this.battery = new BatteryService(dataDir ? path.join(dataDir, 'battery-log.csv') : undefined)
    this.battery.start()
  }

  /** Battery reading, or null when this unit has no UPS (the UI hides the icon). */
  async getBattery(): Promise<BatteryStatus | null> {
    return this.battery.get()
  }

  getHostname(): string {
    return os.hostname()
  }

  isOnboarded(): boolean {
    return isHostnameOnboarded()
  }

  validateHostname(name: string): string | null {
    const trimmed = name.trim().toLowerCase()
    if (!trimmed) return 'Enter a name'
    if (!HOSTNAME_PATTERN.test(trimmed)) {
      return 'Use only lowercase letters, numbers, and hyphens'
    }
    if (trimmed === os.hostname().toLowerCase()) {
      return 'Choose a different name than the current one'
    }
    return null
  }

  // Sets the system hostname, marks onboarding complete, and reboots so
  // avahi/mDNS and the AP-mode hotspot SSID (derived from hostname at boot)
  // cleanly pick up the new name everywhere — same pattern as the WiFi
  // setup flow's post-connect reboot.
  async setHostname(name: string): Promise<void> {
    const error = this.validateHostname(name)
    if (error) throw new Error(error)

    const trimmed = name.trim().toLowerCase()
    const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`

    // Bundled into one script (see scripts/set-hostname.sh) rather than
    // calling hostnamectl/sed/tee directly, so the sudoers grant stays
    // scoped to "rename this device" rather than broad file-editing power.
    await execAsync(`sudo /home/pi/alarm-clock/scripts/set-hostname.sh ${q(trimmed)}`)

    setHostnameOnboarded()
    await execAsync('sudo reboot')
  }
}
