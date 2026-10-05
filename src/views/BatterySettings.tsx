import { Palette, Lang, Route, t } from '../App'
import { ScreenHeader } from '../components/ScreenHeader'
import { HeaderActions } from '../components/HeaderActions'
import { IconBattery } from '../components/Icons'
import { batteryColor } from '../components/StatusIcons'
import { useBattery } from '../hooks/useStatus'

interface BatterySettingsProps {
  palette: Palette
  lang: Lang
  onBack: () => void
  onNavigate: (r: Route) => void
}

const formatDuration = (min: number) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.18)',
      borderRadius: 'var(--r)', padding: 'var(--gap)', flex: '1 1 40%',
    }}>
      <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 'var(--fs-sm)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ color: '#fff', fontSize: 'var(--fs-h3)', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

export function BatterySettings({ palette, lang, onBack, onNavigate }: BatterySettingsProps) {
  const b = useBattery()

  let eta: { label: string; value: string } | null = null
  if (b && (b.state === 'discharging' || b.state === 'charging')) {
    eta = {
      label: t(lang, b.state === 'discharging' ? 'timeRemaining' : 'timeToFull'),
      value: b.minutesRemaining === null ? t(lang, 'calculating') : formatDuration(b.minutesRemaining),
    }
  }

  return (
    <div style={{
      width: '100%', height: '100%', background: palette.clock,
      display: 'flex', flexDirection: 'column', padding: 'var(--pad)', gap: 'var(--gap)', overflow: 'hidden',
    }}>
      <ScreenHeader
        title={t(lang, 'battery')}
        onBack={onBack}
        right={<HeaderActions onNavigate={onNavigate} showSettings={false} />}
      />
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--gap-sm)' }}>
        {!b ? (
          <div style={{ color: '#fff', fontSize: 'var(--fs-h3)', fontWeight: 700 }}>{t(lang, 'noBattery')}</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap)', color: '#fff' }}>
              <IconBattery size="calc(var(--icon) * 2)" level={b.level} charging={b.charging} color={batteryColor(b)} />
              <div style={{ fontSize: 'var(--fs-h1, 2.5rem)', fontWeight: 800, color: batteryColor(b) }}>{Math.round(b.level)}%</div>
              <div style={{ fontSize: 'var(--fs-h3)', fontWeight: 700 }}>{t(lang, b.state)}</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--gap-sm)' }}>
              <Stat label={t(lang, 'voltage')} value={`${b.voltage.toFixed(2)} V`} />
              <Stat label={t(lang, 'current')} value={`${b.current >= 0 ? '+' : ''}${b.current.toFixed(2)} A`} />
              <Stat label={t(lang, 'power')} value={`${b.power.toFixed(1)} W`} />
              <Stat label={t(lang, 'externalPower')} value={t(lang, b.externalPower ? 'yes' : 'no')} />
              {eta && <Stat label={eta.label} value={eta.value} />}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
