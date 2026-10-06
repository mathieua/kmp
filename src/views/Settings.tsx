import { useState, useEffect } from 'react'
import { Palette, Lang, Route, t, PALETTES, AppSettings } from '../App'
import { ScreenHeader } from '../components/ScreenHeader'
import { HeaderActions } from '../components/HeaderActions'
import { Slider } from '../components/Slider'
import { useWifiConnection, useBattery } from '../hooks/useStatus'
import { IconPower, IconRestart } from '../components/Icons'
import type { PowerAction } from '../components/PowerOverlay'

interface SettingsProps {
  palette: Palette
  lang: Lang
  settings: AppSettings
  onSettings: (s: AppSettings) => void
  onNavigate: (r: Route) => void
  onBack: () => void
  onRenameDevice: () => void
  onPower: (action: PowerAction) => void
}

// Defined at module level (not inside Settings): a component declared inside
// another is a new type every render, so React would remount its children —
// which would cancel an in-progress slider drag.
function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.15)',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.18)',
      borderRadius: 'var(--r)', padding: 'var(--gap)', flexShrink: 0,
    }}>
      <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 'var(--fs-sm)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 'var(--gap-sm)' }}>
        {title}
      </div>
      <div style={{ display: 'flex', gap: 'var(--gap-xs)', flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>
      {hint && (
        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 'var(--fs-sm)', marginTop: 'var(--gap-sm)' }}>{hint}</div>
      )}
    </div>
  )
}

function Chip({ active, accent, onClick, children }: { active: boolean; accent: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: 'var(--gap-sm) var(--gap)', borderRadius: 999, border: 'none',
      fontWeight: 800, fontSize: 'var(--fs-body)', cursor: 'pointer', fontFamily: 'inherit',
      background: active ? '#fff' : 'rgba(255,255,255,0.18)',
      color: active ? accent : '#fff',
      transition: 'background 0.15s, color 0.15s',
    }}>{children}</button>
  )
}

function PowerButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--gap-sm)',
      padding: 'var(--gap)', borderRadius: 'var(--r)', cursor: 'pointer', fontFamily: 'inherit',
      background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.18)',
      color: '#fff', fontWeight: 800, fontSize: 'var(--fs-body)',
    }}>
      {icon}{label}
    </button>
  )
}

export function Settings({ palette, lang, settings, onSettings, onNavigate, onBack, onRenameDevice, onPower }: SettingsProps) {
  const wifi = useWifiConnection()
  const battery = useBattery()
  const [defaultVolume, setDefaultVolume] = useState<number | null>(null)

  useEffect(() => {
    window.electronAPI.settings.getDefaultVolume().then(setDefaultVolume).catch(() => setDefaultVolume(50))
  }, [])

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    onSettings({ ...settings, [key]: value })

  const dimOptions = [
    { v: 0,   label: t(lang, 'never') },
    { v: 15,  label: `15 ${t(lang, 'seconds')}` },
    { v: 30,  label: `30 ${t(lang, 'seconds')}` },
    { v: 60,  label: '1 min' },
    { v: 180, label: '3 min' },
  ]

  return (
    <div style={{
      width: '100%', height: '100%', background: palette.clock,
      display: 'flex', flexDirection: 'column', padding: 'var(--pad)', gap: 'var(--gap)', overflow: 'hidden',
    }}>
      <ScreenHeader
        title={t(lang, 'settings')}
        onBack={onBack}
        right={<HeaderActions onNavigate={onNavigate} showSettings={false} />}
      />

      {/* Rows */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--gap-sm)', overflowY: 'auto' }}>
        <Row title={t(lang, 'defaultVolume')} hint={t(lang, 'defaultVolumeHint')}>
          {defaultVolume !== null && (
            <>
              <Slider
                value={defaultVolume}
                onChange={setDefaultVolume}
                onCommit={v => window.electronAPI.settings.setDefaultVolume(Math.round(v)).then(setDefaultVolume)}
                label={t(lang, 'defaultVolume')}
              />
              <div style={{ minWidth: '3.2em', textAlign: 'right', color: '#fff', fontWeight: 800, fontSize: 'var(--fs-h3)', fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(defaultVolume)}%
              </div>
            </>
          )}
        </Row>

        <Row title={t(lang, 'wifi')} hint={wifi.connected ? `${t(lang, 'connectedTo')} ${wifi.ssid}` : t(lang, 'notConnected')}>
          <Chip accent={palette.accentPlay} active={false} onClick={() => onNavigate('wifi')}>{t(lang, 'changeNetwork')}</Chip>
        </Row>

        {battery && (
          <Row title={t(lang, 'battery')} hint={`${Math.round(battery.level)}% · ${t(lang, battery.state)}`}>
            <Chip accent={palette.accentPlay} active={false} onClick={() => onNavigate('battery')}>{t(lang, 'batteryDetails')}</Chip>
          </Row>
        )}

        <Row title={t(lang, 'language')}>
          <Chip accent={palette.accentPlay} active={settings.lang === 'en'} onClick={() => set('lang', 'en')}>English</Chip>
          <Chip accent={palette.accentPlay} active={settings.lang === 'fr'} onClick={() => set('lang', 'fr')}>Français</Chip>
        </Row>

        <Row title={t(lang, 'theme')}>
          {(Object.keys(PALETTES) as Array<keyof typeof PALETTES>).map(name => (
            <Chip accent={palette.accentPlay} key={name} active={settings.theme === name} onClick={() => set('theme', name)}>{name}</Chip>
          ))}
        </Row>

        <Row title={t(lang, 'autoDim')}>
          {dimOptions.map(o => (
            <Chip accent={palette.accentPlay} key={o.v} active={settings.dimSeconds === o.v} onClick={() => set('dimSeconds', o.v)}>{o.label}</Chip>
          ))}
        </Row>

        <Row title={t(lang, 'device')}>
          <Chip accent={palette.accentPlay} active={false} onClick={onRenameDevice}>{t(lang, 'renameDevice')}</Chip>
        </Row>

        <div style={{ display: 'flex', gap: 'var(--gap-sm)', flexShrink: 0 }}>
          <PowerButton icon={<IconRestart size="var(--icon-sm)" />} label={t(lang, 'restart')} onClick={() => onPower('restart')} />
          <PowerButton icon={<IconPower size="var(--icon-sm)" />} label={t(lang, 'turnOff')} onClick={() => onPower('shutdown')} />
        </div>
      </div>
    </div>
  )
}
