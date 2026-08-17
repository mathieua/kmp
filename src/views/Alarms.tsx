import { useState } from 'react'
import { Palette, Lang, Route, t, CORNER_RADIUS, DAYS_EN, DAYS_FR } from '../App'
import { useAlarm } from '../hooks/useAlarm'
import { CircleBtn, IconBack } from '../components/Icons'

interface AlarmsProps {
  palette: Palette
  lang: Lang
  onNavigate: (r: Route) => void
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
  const [editHour, setEditHour] = useState(alarm ? parseInt(alarm.time.split(':')[0]) : 7)
  const [editMinute, setEditMinute] = useState(alarm ? parseInt(alarm.time.split(':')[1]) : 0)
  const [editing, setEditing] = useState(false)
  const [activeDays, setActiveDays] = useState<string[]>(['Mon','Tue','Wed','Thu','Fri'])

  const r = CORNER_RADIUS
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
    setEditing(true)
  }

  const save = () => {
    const time = `${String(editHour).padStart(2,'0')}:${String(editMinute).padStart(2,'0')}`
    setAlarmTime(time, true, alarm?.sound_path)
    setEditing(false)
  }

  const toggleEnabled = () => { if (alarm) setAlarmTime(alarm.time, !alarm.enabled, alarm.sound_path) }
  const toggleDay = (d: string) => setActiveDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])

  return (
    <div style={{
      width: '100%', height: '100%', background: palette.alarms,
      display: 'flex', flexDirection: 'column', padding: 'var(--pad)', gap: 'var(--gap)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <CircleBtn onClick={() => onNavigate('clock')}><IconBack size="var(--icon)" /></CircleBtn>
        <h1 style={{ color: '#fff', fontSize: 'var(--fs-h1)', fontWeight: 800, margin: 0 }}>{t(lang, 'alarms')}</h1>
        {alarm && !editing ? (
          <CircleBtn bg="#facc15" color="#fff" onClick={openEdit}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 'var(--icon)', height: 'var(--icon)' }}><path d="M12 5v14"/><path d="M5 12h14"/></svg>
          </CircleBtn>
        ) : <div style={{ width: 'var(--btn)' }} />}
      </div>

      {/* Time stepper (edit mode) */}
      {editing && (
        <div style={{ background: '#fff', borderRadius: 'var(--r-sm)', padding: 'var(--gap)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--gap-sm)', marginBottom: 'var(--gap)' }}>
            <Stepper value={editHour}   onInc={() => bumpHour(1)}   onDec={() => bumpHour(-1)} />
            <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 900, color: '#7c3aed', lineHeight: 1, padding: '0 min(0.5vw, 0.83vh)' }}>:</div>
            <Stepper value={editMinute} onInc={() => bumpMinute(5)} onDec={() => bumpMinute(-5)} />
          </div>
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
