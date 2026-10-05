import { useWifiConnection, useBattery } from '../hooks/useStatus'
import { IconWifi, IconWifiOff, IconBattery } from './Icons'

/** Red when low/critical, otherwise the default icon color. */
export const batteryColor = (b: { level: number; state: string }): string | undefined =>
  b.state === 'charging' || b.state === 'full' ? undefined : b.level < 10 ? '#ff4d4d' : b.level < 20 ? '#ff9a3c' : undefined

// Wifi + battery indicators for the corner of a screen. The battery icon only
// appears once the device reports a battery (see DeviceService.getBattery).
export function StatusIcons() {
  const wifi = useWifiConnection()
  const battery = useBattery()
  const bars = wifi.signal >= 75 ? 4 : wifi.signal >= 50 ? 3 : wifi.signal >= 25 ? 2 : 1

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--gap-sm)', color: '#fff',
      padding: 'var(--gap-xs) var(--gap-sm)', borderRadius: 999, background: 'rgba(255,255,255,0.18)',
    }}>
      {wifi.connected
        ? <IconWifi size="var(--icon)" bars={bars} />
        : <IconWifiOff size="var(--icon)" />}
      {battery && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 800, fontSize: 'var(--fs-sm)' }}>
          <IconBattery size="var(--icon)" level={battery.level} charging={battery.charging} color={batteryColor(battery)} />
          <span style={{ color: batteryColor(battery) }}>{Math.round(battery.level)}%</span>
        </div>
      )}
    </div>
  )
}
