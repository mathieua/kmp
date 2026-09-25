import { useState, useEffect, useRef } from 'react'
import { Palette, Lang, Route, t, DAYS_EN, DAYS_FR, SONG_GRADIENTS } from '../App'
import { Track } from '../types'
import { useAlarm } from '../hooks/useAlarm'
import { useLibrary } from '../hooks/useAudio'
import { CircleBtn, IconMusic, IconCheck, IconChevronRight } from '../components/Icons'
import { ScreenHeader } from '../components/ScreenHeader'
import { HeaderActions } from '../components/HeaderActions'

interface AlarmsProps {
  palette: Palette
  lang: Lang
  onNavigate: (r: Route) => void
}

const SOUND_PREFIX = 'alarm-sound:'

/** Generated alarm tones are named by id so they can be translated. */
function soundTitle(track: Track, lang: Lang): string {
  return track.id.startsWith(SOUND_PREFIX)
    ? t(lang, `snd_${track.id.slice(SOUND_PREFIX.length)}` as Parameters<typeof t>[1])
    : track.title
}

function Stepper({ value, onInc, onDec }: { value: number; onInc: () => void; onDec: () => void }) {
  const btn: React.CSSProperties = {
    width: 'min(8vw, 13.33vh)', height: 'min(5vw, 8.33vh)', borderRadius: 'var(--r-xs)',
    background: '#ede9fe', color: '#7c3aed', border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', padding: 0, fontFamily: 'inherit',
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--gap-xs)', background: '#f3f4f6', borderRadius: 'var(--r-sm)', padding: 'min(1vw, 1.67vh) min(0.75vw, 1.25vh)' }}>
      <button style={btn} onClick={onInc}
        onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.92)')}
        onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 'var(--icon)', height: 'var(--icon)' }}><path d="m6 15 6-6 6 6"/></svg>
      </button>
      <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 900, color: '#7c3aed', lineHeight: 1, fontVariantNumeric: 'tabular-nums', minWidth: 'min(9.5vw, 15.83vh)', textAlign: 'center' }}>
        {String(value).padStart(2, '0')}
      </div>
      <button style={btn} onClick={onDec}
        onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.92)')}
        onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 'var(--icon)', height: 'var(--icon)' }}><path d="m6 9 6 6 6-6"/></svg>
      </button>
    </div>
  )
}

function Switch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} style={{
      width: 56, height: 32, borderRadius: 16,
      background: checked ? '#22c55e' : '#cbd5e1',
      border: 'none', padding: 0, cursor: 'pointer', position: 'relative',
      transition: 'background 0.2s ease', flexShrink: 0,
    }}>
      <span style={{
        position: 'absolute', top: 3, left: checked ? 27 : 3,
        width: 26, height: 26, borderRadius: '50%', background: '#fff',
        boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
        transition: 'left 0.2s ease', display: 'block',
      }} />
    </button>
  )
}

export function Alarms({ palette, lang, onNavigate }: AlarmsProps) {
  const { alarm, setAlarmTime } = useAlarm()
  const { tracks } = useLibrary()
  const [sounds, setSounds] = useState<Track[]>([])
  const [picking, setPicking] = useState(false)
  // Only stop audio we started ourselves — never the user's own music.
  const previewing = useRef(false)
  // null = random song. Edited locally so it can be saved together with the time.
  const [editSound, setEditSound] = useState<string | null>(alarm?.sound_path ?? null)
  const [editHour, setEditHour] = useState(alarm ? parseInt(alarm.time.split(':')[0]) : 7)
  const [editMinute, setEditMinute] = useState(alarm ? parseInt(alarm.time.split(':')[1]) : 0)
  const [editing, setEditing] = useState(false)
  const [activeDays, setActiveDays] = useState<string[]>(['Mon','Tue','Wed','Thu','Fri'])

  useEffect(() => { window.electronAPI.alarm.listSounds().then(setSounds).catch(() => {}) }, [])
  // Follow the stored alarm when it loads or changes elsewhere.
  useEffect(() => { setEditSound(alarm?.sound_path ?? null) }, [alarm?.sound_path])
  // Leaving the screen shouldn't leave a preview playing.
  useEffect(() => () => { if (previewing.current) window.electronAPI.audio.stop().catch(() => {}) }, [])

  const days = lang === 'fr' ? DAYS_FR : DAYS_EN

  const bumpHour = (delta: number) => setEditHour(h => (h + delta + 24) % 24)
  const bumpMinute = (delta: number) => {
    setEditMinute(m => {
      const next = m + delta
      if (next >= 60) { bumpHour(1); return next - 60 }
      if (next < 0)  { bumpHour(-1); return next + 60 }
      return next
    })
  }

  const openEdit = () => {
    if (alarm) { setEditHour(parseInt(alarm.time.split(':')[0])); setEditMinute(parseInt(alarm.time.split(':')[1])) }
    setEditSound(alarm?.sound_path ?? null)
    setEditing(true)
  }

  const save = () => {
    const time = `${String(editHour).padStart(2,'0')}:${String(editMinute).padStart(2,'0')}`
    setAlarmTime(time, true, editSound)
    setEditing(false)
  }

  const toggleEnabled = () => { if (alarm) setAlarmTime(alarm.time, !alarm.enabled, alarm.sound_path) }
  const toggleDay = (d: string) => setActiveDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])

  const soundName = (path: string | null) => {
    const found = path ? [...sounds, ...tracks].find(x => x.filepath === path) : undefined
    return found ? soundTitle(found, lang) : t(lang, 'randomSong')
  }

  const stopPreview = () => {
    if (!previewing.current) return
    previewing.current = false
    window.electronAPI.audio.stop().catch(() => {})
  }

  const closePicker = () => {
    stopPreview()
    setPicking(false)
  }

  // Choosing also plays it, so the sound can be heard before committing.
  const chooseSound = (track: Track | null) => {
    const path = track?.filepath ?? null
    setEditSound(path)
    // Outside edit mode there's no Save button — apply straight away.
    if (!editing && alarm) setAlarmTime(alarm.time, alarm.enabled, path)
    if (track) { window.electronAPI.audio.play(track).catch(() => {}); previewing.current = true }
    else stopPreview()
  }

  const soundRow = (
    <button onClick={() => setPicking(true)} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--gap-sm)', cursor: 'pointer',
      background: '#f3f4f6', border: 'none', borderRadius: 'var(--r-xs)', padding: 'var(--gap-sm)',
      fontFamily: 'inherit', textAlign: 'left',
    }}>
      <IconMusic size="var(--icon-sm)" stroke="#7c3aed" />
      <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-body)', fontWeight: 800, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {soundName(editing ? editSound : alarm?.sound_path ?? null)}
      </span>
      <span style={{ fontSize: 'var(--fs-sm)', color: '#9ca3af', fontWeight: 700 }}>{t(lang, 'tapToChange')}</span>
      <IconChevronRight size="var(--icon-sm)" stroke="#9ca3af" />
    </button>
  )

  // ── Sound picker ─────────────────────────────────────────────────────────
  if (picking) {
    const Option = ({ title, subtitle, selected, gradient, onClick }: {
      title: string; subtitle?: string; selected: boolean; gradient: string; onClick: () => void
    }) => (
      <button onClick={onClick} style={{
        display: 'flex', alignItems: 'center', gap: 'var(--gap-sm)', width: '100%', flexShrink: 0, cursor: 'pointer',
        padding: 'var(--gap-sm)', borderRadius: 'var(--r-sm)', textAlign: 'left', fontFamily: 'inherit', color: '#fff',
        background: selected ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.14)',
        border: selected ? '1.5px solid rgba(255,255,255,0.6)' : '1.5px solid transparent',
      }}>
        <div style={{
          width: 'var(--thumb)', height: 'var(--thumb)', borderRadius: 'var(--r-xs)', background: gradient, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><IconMusic size="var(--icon-sm)" stroke="#fff" /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 'var(--fs-body)', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 'var(--fs-sm)', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>}
        </div>
        {selected && <IconCheck size="var(--icon)" stroke="#fff" />}
      </button>
    )
    const label = (text: string) => (
      <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 'var(--fs-sm)', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', margin: 'var(--gap-xs) 0 0' }}>{text}</div>
    )
    return (
      <div style={{
        width: '100%', height: '100%', background: palette.alarms,
        display: 'flex', flexDirection: 'column', padding: 'var(--pad)', gap: 'var(--gap)', overflow: 'hidden',
      }}>
        <ScreenHeader title={t(lang, 'sound')} onBack={closePicker}
          right={<HeaderActions onNavigate={r => { closePicker(); onNavigate(r) }} />} />
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--gap-xs)' }}>
          <Option title={t(lang, 'randomSong')} selected={editSound === null}
            gradient="linear-gradient(135deg, #fbbf24, #fb923c)" onClick={() => chooseSound(null)} />
          {label(t(lang, 'alarmSounds'))}
          {sounds.map((s, i) => (
            <Option key={s.id} title={soundTitle(s, lang)} selected={editSound === s.filepath}
              gradient={SONG_GRADIENTS[i % SONG_GRADIENTS.length]} onClick={() => chooseSound(s)} />
          ))}
          {tracks.length > 0 && label(t(lang, 'yourSongs'))}
          {tracks.map((s, i) => (
            <Option key={s.id} title={s.title} subtitle={s.artist} selected={editSound === s.filepath}
              gradient={SONG_GRADIENTS[(i + 2) % SONG_GRADIENTS.length]} onClick={() => chooseSound(s)} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{
      width: '100%', height: '100%', background: palette.alarms,
      display: 'flex', flexDirection: 'column', padding: 'var(--pad)', gap: 'var(--gap)', overflow: 'hidden',
    }}>
      <ScreenHeader
        title={t(lang, 'alarms')}
        onBack={() => onNavigate('clock')}
        right={
          <HeaderActions onNavigate={onNavigate}>
            {alarm && !editing && (
              <CircleBtn bg="#facc15" color="#fff" onClick={openEdit}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 'var(--icon)', height: 'var(--icon)' }}><path d="M12 5v14"/><path d="M5 12h14"/></svg>
              </CircleBtn>
            )}
          </HeaderActions>
        }
      />

      {/* Time stepper (edit mode) */}
      {editing && (
        <div style={{ background: '#fff', borderRadius: 'var(--r-sm)', padding: 'var(--gap)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--gap-sm)', marginBottom: 'var(--gap)' }}>
            <Stepper value={editHour}   onInc={() => bumpHour(1)}   onDec={() => bumpHour(-1)} />
            <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 900, color: '#7c3aed', lineHeight: 1, padding: '0 min(0.5vw, 0.83vh)' }}>:</div>
            <Stepper value={editMinute} onInc={() => bumpMinute(5)} onDec={() => bumpMinute(-5)} />
          </div>
          <div style={{ marginBottom: 'var(--gap)' }}>{soundRow}</div>
          <div style={{ display: 'flex', gap: 'var(--gap-sm)' }}>
            <button onClick={save} style={{ flex: 1, background: '#22c55e', color: '#fff', border: 'none', padding: 'var(--gap-sm) 0', borderRadius: 'var(--r-sm)', fontSize: 'var(--fs-body)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>{t(lang, 'save')}</button>
            <button onClick={() => setEditing(false)} style={{ flex: 1, background: 'transparent', color: '#374151', border: '2px solid #e5e7eb', padding: 'var(--gap-sm) 0', borderRadius: 'var(--r-sm)', fontSize: 'var(--fs-body)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>{t(lang, 'cancel')}</button>
          </div>
        </div>
      )}

      {/* Alarm row (view mode) */}
      {!editing && alarm && (
        <div style={{ background: '#fff', borderRadius: 'var(--r-sm)', padding: 'var(--gap)', opacity: alarm.enabled ? 1 : 0.55, transition: 'opacity 0.2s ease', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--gap-sm)' }}>
            <button onClick={openEdit} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
              <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, color: '#7c3aed', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{alarm.time}</div>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-sm)' }}>
              <Switch checked={alarm.enabled} onChange={toggleEnabled} />
              <button onClick={() => setAlarmTime(alarm.time, false, alarm.sound_path)} style={{
                background: '#fee2e2', border: 'none', color: '#dc2626', width: 'var(--btn-sm)', height: 'var(--btn-sm)',
                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 'var(--icon)', height: 'var(--icon)' }}>
                  <path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--gap-xs)' }}>
            {DAYS_EN.map((d, i) => {
              const active = activeDays.includes(d)
              return (
                <button key={d} onClick={() => toggleDay(d)} style={{
                  flex: 1, padding: 'var(--gap-xs) 0', borderRadius: 'var(--r-xs)', border: 'none',
                  fontWeight: 800, fontSize: 'var(--fs-sm)', cursor: 'pointer', fontFamily: 'inherit',
                  background: active ? '#3b82f6' : '#e5e7eb', color: active ? '#fff' : '#9ca3af',
                  transition: 'background 0.15s',
                }}>{days[i]}</button>
              )
            })}
          </div>
          <div style={{ marginTop: 'var(--gap-sm)' }}>{soundRow}</div>
        </div>
      )}

      {/* Empty state + add button */}
      {!editing && !alarm && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--gap)' }}>
          <div style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 'var(--r)', padding: 'var(--pad)', textAlign: 'center', color: 'rgba(255,255,255,0.95)' }}>
            <div style={{ fontSize: 'var(--fs-h2)', fontWeight: 800, marginBottom: 'var(--gap-xs)' }}>{t(lang, 'noAlarms')}</div>
            <div style={{ fontSize: 'var(--fs-body)', opacity: 0.9 }}>{t(lang, 'addFirst')}</div>
          </div>
          <CircleBtn bg="#facc15" color="#fff" onClick={openEdit}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 'var(--icon)', height: 'var(--icon)' }}><path d="M12 5v14"/><path d="M5 12h14"/></svg>
          </CircleBtn>
        </div>
      )}
    </div>
  )
}
