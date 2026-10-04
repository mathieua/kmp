import { exec } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import { isHostnameOnboarded, setHostnameOnboarded } from './database'

const execAsync = promisify(exec)

// RFC 1123 hostname label rules: lowercase letters, digits, hyphens, 1-63
// chars, can't start or end with a hyphen.
const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

export interface BatteryStatus {
  /** 0-100 */
  level: number
  charging: boolean
}

export class DeviceService {
  /**
   * Battery reading, or null when this unit has no battery hardware.
   * TODO: read the real fuel gauge here once the battery is installed.
   * The UI hides the battery icon while this returns null.
   */
  async getBattery(): Promise<BatteryStatus | null> {
    return null
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
    const script = process.env.KMP_SET_HOSTNAME_SCRIPT ?? '/home/pi/alarm-clock/scripts/set-hostname.sh'
    await execAsync(`sudo ${script} ${q(trimmed)}`)

    setHostnameOnboarded()
    await execAsync('sudo reboot')
  }
}
