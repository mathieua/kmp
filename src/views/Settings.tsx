import { Palette, Lang, Route, t, PALETTES, CORNER_RADIUS, AppSettings } from '../App'
import { CircleBtn, IconBack } from '../components/Icons'

interface SettingsProps {
  palette: Palette
  lang: Lang
  settings: AppSettings
  onSettings: (s: AppSettings) => void
  onNavigate: (r: Route) => void
}

export function Settings({ palette, lang, settings, onSettings, onNavigate }: SettingsProps) {
  const r = CORNER_RADIUS

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    onSettings({ ...settings, [key]: value })

  const dimOptions = [
    { v: 0,   label: t(lang, 'never') },
    { v: 15,  label: `15 ${t(lang, 'seconds')}` },
    { v: 30,  label: `30 ${t(lang, 'seconds')}` },
    { v: 60,  label: '1 min' },
    { v: 180, label: '3 min' },
  ]

  const Row = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{
      background: 'rgba(255,255,255,0.15)',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.18)',
      borderRadius: 'var(--r)', padding: 'var(--gap)', flexShrink: 0,
    }}>
      <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 'var(--fs-sm)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 'var(--gap-sm)' }}>
        {title}
      </div>
      <div style={{ display: 'flex', gap: 'var(--gap-xs)', flexWrap: 'wrap' }}>{children}</div>
    </div>
  )

  const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button onClick={onClick} style={{
      padding: 'var(--gap-sm) var(--gap)', borderRadius: 999, border: 'none',
      fontWeight: 800, fontSize: 'var(--fs-body)', cursor: 'pointer', fontFamily: 'inherit',
      background: active ? '#fff' : 'rgba(255,255,255,0.18)',
      color: active ? palette.accentPlay : '#fff',
      transition: 'background 0.15s, color 0.15s',
    }}>{children}</button>
  )

  return (
    <div style={{
      width: '100%', height: '100%', background: palette.clock,
      display: 'flex', flexDirection: 'column', padding: 'var(--pad)', gap: 'var(--gap)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <CircleBtn onClick={() => onNavigate('clock')}><IconBack size="var(--icon)" /></CircleBtn>
        <h1 style={{ color: '#fff', fontSize: 'var(--fs-h1)', fontWeight: 800, margin: 0 }}>{t(lang, 'settings')}</h1>
        <div style={{ width: 'var(--btn)' }} />
      </div>

      {/* Rows */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--gap-sm)', overflowY: 'auto' }}>
        <Row title={t(lang, 'language')}>
          <Chip active={settings.lang === 'en'} onClick={() => set('lang', 'en')}>English</Chip>
          <Chip active={settings.lang === 'fr'} onClick={() => set('lang', 'fr')}>Français</Chip>
        </Row>

        <Row title={t(lang, 'theme')}>
          {(Object.keys(PALETTES) as Array<keyof typeof PALETTES>).map(name => (
            <Chip key={name} active={settings.theme === name} onClick={() => set('theme', name)}>{name}</Chip>
          ))}
        </Row>

        <Row title={t(lang, 'autoDim')}>
          {dimOptions.map(o => (
            <Chip key={o.v} active={settings.dimSeconds === o.v} onClick={() => set('dimSeconds', o.v)}>{o.label}</Chip>
          ))}
        </Row>
      </div>
    </div>
  )
}
