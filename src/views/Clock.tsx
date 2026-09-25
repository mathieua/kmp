import { useState, useEffect } from 'react'
import { Palette, Lang, Route, t, DATE_LABELS } from '../App'
import { Alarm, Track } from '../types'
import { CircleBtn, IconAlarm, IconMusic, IconPlay, IconPause } from '../components/Icons'
import { HeaderActions } from '../components/HeaderActions'

interface ClockProps {
  palette: Palette
  lang: Lang
  alarm: Alarm | null
  isPlaying: boolean
  currentTrack: Track | null
  onTogglePlay: () => void
  onNavigate: (r: Route) => void
}

export function Clock({ palette, lang, alarm, isPlaying, currentTrack, onTogglePlay, onNavigate }: ClockProps) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
  const labels = DATE_LABELS[lang] ?? DATE_LABELS.en
  const dateStr = labels.fmt(now, labels.days, labels.months)

  const cardBase: React.CSSProperties = {
    flex: 1, background: 'rgba(255,255,255,0.22)',
    backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
    borderRadius: 'var(--r)', padding: 'var(--gap)', display: 'flex', alignItems: 'center', gap: 'min(1.75vw, 2.92vh)',
    cursor: 'pointer', border: '1px solid rgba(255,255,255,0.18)',
    transition: 'background 0.15s ease',
  }
  const pill = (bg: string): React.CSSProperties => ({
    width: 'var(--pill)', height: 'var(--pill)', borderRadius: '50%', background: bg,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
  })

  return (
    <div style={{
      width: '100%', height: '100%', background: palette.clock,
      display: 'flex', flexDirection: 'column', padding: 'var(--pad)', gap: 'var(--pad)',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Volume + settings — top right */}
      <div style={{ position: 'absolute', top: 'var(--gap)', right: 'var(--gap)', zIndex: 2 }}>
        <HeaderActions onNavigate={onNavigate} />
      </div>

      {/* Time + date */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 4,
      }}>
        <div style={{
          fontSize: 'var(--fs-clock)', fontWeight: 800, color: '#fff',
          letterSpacing: '-0.04em', lineHeight: 0.95,
          textShadow: '0 6px 24px rgba(0,0,0,0.18)', fontVariantNumeric: 'tabular-nums',
        }}>{timeStr}</div>
        <div style={{ fontSize: 'var(--fs-date)', fontWeight: 600, color: 'rgba(255,255,255,0.92)', marginTop: 'var(--gap-xs)' }}>
          {dateStr}
        </div>
      </div>

      {/* Bottom cards */}
      <div style={{ display: 'flex', gap: 'var(--gap)' }}>
        {/* Alarm card */}
        <div onClick={() => onNavigate('alarms')} style={cardBase}
          onMouseDown={e => ((e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.30)')}
          onMouseUp={e => ((e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.22)')}
          onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.22)')}
        >
          <div style={pill('#facc15')}><IconAlarm size="var(--icon)" stroke="#fff" /></div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {alarm?.enabled ? (
              <>
                <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 'var(--fs-sm)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {t(lang, 'nextAlarm')}
                </div>
                <div style={{ color: '#fff', fontSize: 'var(--fs-alarm)', fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                  {alarm.time}
                </div>
              </>
            ) : (
              <>
                <div style={{ color: '#fff', fontSize: 'var(--fs-h2)', fontWeight: 800 }}>{t(lang, 'setAlarm')}</div>
                <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 'var(--fs-sm)' }}>{t(lang, 'tapAdd')}</div>
              </>
            )}
          </div>
        </div>

        {/* Music card */}
        <div onClick={() => onNavigate(isPlaying && currentTrack ? 'player' : 'library')} style={cardBase}
          onMouseDown={e => ((e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.30)')}
          onMouseUp={e => ((e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.22)')}
          onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.22)')}
        >
          <div style={pill('#22c55e')}><IconMusic size="var(--icon)" stroke="#fff" /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {isPlaying && currentTrack ? (
              <>
                <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 'var(--fs-sm)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {t(lang, 'nowPlaying')}
                </div>
                <div style={{ color: '#fff', fontSize: 'var(--fs-body)', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {currentTrack.title}
                </div>
              </>
            ) : (
              <>
                <div style={{ color: '#fff', fontSize: 'var(--fs-h2)', fontWeight: 800 }}>Music</div>
                <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 'var(--fs-sm)' }}>{t(lang, 'tapBrowse')}</div>
              </>
            )}
          </div>
          <CircleBtn bg="#fff" color={palette.accentPlay} shadow="0 6px 18px rgba(0,0,0,0.18)"
            onClick={e => { e.stopPropagation(); onTogglePlay() }}
          >
            {isPlaying
              ? <IconPause size="var(--icon)" />
              : <div style={{ transform: 'translateX(2px)' }}><IconPlay size="var(--icon)" /></div>
            }
          </CircleBtn>
        </div>
      </div>
    </div>
  )
}
