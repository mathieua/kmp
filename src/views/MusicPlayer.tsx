import { useState, useEffect } from 'react'
import { Palette, Lang, Route, t, DATE_LABELS, SONG_GRADIENTS } from '../App'
import { usePlayback } from '../hooks/useAudio'
import { ScreenHeader } from '../components/ScreenHeader'
import { HeaderActions } from '../components/HeaderActions'
import { Slider } from '../components/Slider'
import { CircleBtn, IconMusic, IconPlay, IconPause, IconSkipBack, IconSkipFwd } from '../components/Icons'
import { artworkUrl, formatTime } from '../lib/media'

interface MusicPlayerProps {
  palette: Palette
  lang: Lang
  onNavigate: (r: Route) => void
}

const ellipsis: React.CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }

function DateTime({ lang }: { lang: Lang }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const labels = DATE_LABELS[lang] ?? DATE_LABELS.en
  return (
    <div style={{ textAlign: 'center', color: '#fff', lineHeight: 1.1 }}>
      <div style={{ fontSize: 'var(--fs-h1)', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
        {String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}
      </div>
      <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, opacity: 0.85 }}>
        {labels.fmt(now, labels.days, labels.months)}
      </div>
    </div>
  )
}

export function MusicPlayer({ palette, lang, onNavigate }: MusicPlayerProps) {
  const { isPlaying, currentTrack, position, duration, togglePlayPause, next, previous, seek } = usePlayback()

  const art = artworkUrl(currentTrack?.artwork)
  const total = duration || currentTrack?.duration || 0
  const gradient = SONG_GRADIENTS[(currentTrack?.title.length ?? 0) % SONG_GRADIENTS.length]

  return (
    <div style={{
      width: '100%', height: '100%', background: palette.music,
      display: 'flex', flexDirection: 'column', padding: 'var(--pad)', gap: 'var(--gap)', overflow: 'hidden',
    }}>
      <ScreenHeader
        title={<DateTime lang={lang} />}
        onBack={() => onNavigate('library')}
        right={<HeaderActions onNavigate={onNavigate} />}
      />

      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', gap: 'var(--pad)' }}>
        {/* Thumbnail */}
        <div style={{
          width: 'min(34vw, 56vh)', height: 'min(34vw, 56vh)', flexShrink: 0, borderRadius: 'var(--r)',
          background: gradient, overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 14px 38px rgba(0,0,0,0.28)',
          transform: isPlaying ? 'scale(1)' : 'scale(0.96)', transition: 'transform 0.3s ease',
        }}>
          {art
            ? <img src={art} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <IconMusic size="var(--icon-xl)" stroke="rgba(255,255,255,0.85)" />}
        </div>

        {/* Info + controls */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
          <div>
            <h2 style={{
              color: '#fff', fontSize: 'var(--fs-h1)', fontWeight: 800, margin: 0, lineHeight: 1.15,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {currentTrack?.title ?? t(lang, 'noMusic')}
            </h2>
            {currentTrack?.artist && (
              <div style={{ color: 'rgba(255,255,255,0.92)', fontSize: 'var(--fs-h3)', fontWeight: 700, marginTop: 'var(--gap-xs)', ...ellipsis }}>
                {currentTrack.artist}
              </div>
            )}
            {currentTrack?.album && (
              <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 'var(--fs-body)', marginTop: 2, ...ellipsis }}>
                {currentTrack.album}
              </div>
            )}
          </div>

          {/* Scroller */}
          <div>
            <Slider
              value={Math.min(position, total)}
              max={total || 1}
              holdMs={1500}
              onCommit={seek}
              label="Position"
            />
            <div style={{
              display: 'flex', justifyContent: 'space-between', color: 'rgba(255,255,255,0.85)',
              fontSize: 'var(--fs-sm)', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
            }}>
              <span>{formatTime(position)}</span>
              <span>{total ? formatTime(total) : '--:--'}</span>
            </div>
          </div>

          {/* Playback */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'min(1.75vw, 2.92vh)' }}>
            <CircleBtn onClick={previous}><IconSkipBack size="var(--icon)" /></CircleBtn>
            <CircleBtn size="var(--btn-lg)" bg="#fff" shadow="0 8px 24px rgba(0,0,0,0.25)" onClick={togglePlayPause}>
              {isPlaying
                ? <IconPause size="var(--icon-lg)" stroke={palette.accentPlay} />
                : <div style={{ transform: 'translateX(2px)' }}><IconPlay size="var(--icon-lg)" stroke={palette.accentPlay} /></div>}
            </CircleBtn>
            <CircleBtn onClick={next}><IconSkipFwd size="var(--icon)" /></CircleBtn>
          </div>
        </div>
      </div>
    </div>
  )
}
