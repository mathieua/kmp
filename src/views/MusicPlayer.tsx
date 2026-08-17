import { Palette, Lang, Route, t, CORNER_RADIUS, SONG_GRADIENTS } from '../App'
import { useAudio } from '../hooks/useAudio'
import { CircleBtn, IconBack, IconMusic, IconPlay, IconPause, IconSkipBack, IconSkipFwd, Equalizer } from '../components/Icons'

interface MusicPlayerProps {
  palette: Palette
  lang: Lang
  onNavigate: (r: Route) => void
}

export function MusicPlayer({ palette, lang, onNavigate }: MusicPlayerProps) {
  const { tracks, isPlaying, currentTrack, playTrack, togglePlayPause, next, previous } = useAudio()
  const r = CORNER_RADIUS

  const currentIndex = currentTrack ? tracks.findIndex(t => t.id === currentTrack.id) : 0
  const artGradient = SONG_GRADIENTS[Math.max(0, currentIndex) % SONG_GRADIENTS.length]

  return (
    <div style={{
      width: '100%', height: '100%', background: palette.music,
      display: 'flex', flexDirection: 'column', padding: 'var(--pad)', gap: 'var(--gap)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <CircleBtn onClick={() => onNavigate('playlists')}><IconBack size="var(--icon)" /></CircleBtn>
        <h1 style={{ color: '#fff', fontSize: 'var(--fs-h1)', fontWeight: 800, margin: 0 }}>{t(lang, 'myMusic')}</h1>
        <div style={{ width: 'var(--btn)' }} />
      </div>

      {/* Two-column body */}
      <div style={{ flex: 1, display: 'flex', gap: 'var(--gap)', overflow: 'hidden' }}>

        {/* Left — Now Playing */}
        <div style={{ width: 'min(37.5vw, 62.5vh)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
          {/* Album art */}
          <div style={{
            width: 'var(--art)', height: 'var(--art)', borderRadius: 'var(--r)',
            background: artGradient,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 14px 38px rgba(0,0,0,0.28)',
            marginBottom: 'var(--gap)',
            transform: isPlaying ? 'scale(1.02)' : 'scale(1)',
            transition: 'transform 0.3s ease',
          }}>
            <IconMusic size="var(--icon-xl)" stroke="rgba(255,255,255,0.85)" />
          </div>

          {/* Track info */}
          <h2 style={{ color: '#fff', fontSize: 'var(--fs-h2)', fontWeight: 800, margin: 0, textAlign: 'center', maxWidth: '35vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentTrack?.title ?? 'No track'}
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.82)', fontSize: 'var(--fs-body)', margin: 'var(--gap-xs) 0 var(--gap)' }}>
            Kids Music
          </p>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'min(1.75vw, 2.92vh)' }}>
            <CircleBtn onClick={previous}><IconSkipBack size="var(--icon)" /></CircleBtn>
            <CircleBtn size="var(--btn-lg)" bg="#fff" color={palette.accentPlay} shadow="0 8px 24px rgba(0,0,0,0.25)" onClick={togglePlayPause}>
              {isPlaying
                ? <IconPause size="var(--icon-lg)" stroke={palette.accentPlay} />
                : <div style={{ transform: 'translateX(2px)' }}><IconPlay size="var(--icon-lg)" stroke={palette.accentPlay} /></div>
              }
            </CircleBtn>
            <CircleBtn onClick={next}><IconSkipFwd size="var(--icon)" /></CircleBtn>
          </div>
        </div>

        {/* Right — Playlist */}
        <div style={{
          flex: 1,
          background: 'rgba(255,255,255,0.12)',
          backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
          borderRadius: 'var(--r)', padding: 'var(--gap)',
          border: '1px solid rgba(255,255,255,0.16)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <h3 style={{ color: '#fff', fontSize: 'var(--fs-h3)', fontWeight: 800, margin: '0 0 var(--gap-sm)', letterSpacing: '0.02em', flexShrink: 0 }}>
            {t(lang, 'myMusic')}
          </h3>

          {tracks.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 'var(--fs-body)', textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: 'var(--fs-h2)', fontWeight: 700, marginBottom: 'var(--gap-xs)' }}>No tracks yet</div>
                <div>Add music via the parent portal</div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-xs)', overflowY: 'auto' }}>
              {tracks.map((track, index) => {
                const active = currentTrack?.id === track.id
                return (
                  <div key={track.id} onClick={() => playTrack(track)} style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--gap-sm)', padding: 'var(--gap-sm)',
                    borderRadius: 'var(--r-sm)', cursor: 'pointer', transition: 'background 0.15s',
                    background: active ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.10)',
                    border: active ? '1.5px solid rgba(255,255,255,0.4)' : '1.5px solid transparent',
                  }}>
                    <div style={{
                      width: 'var(--thumb)', height: 'var(--thumb)', borderRadius: 'var(--r-xs)', flexShrink: 0,
                      background: SONG_GRADIENTS[index % SONG_GRADIENTS.length],
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {active && isPlaying ? <Equalizer /> : <IconMusic size="var(--icon-sm)" stroke="#fff" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#fff', fontSize: 'var(--fs-body)', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {track.title}
                      </div>
                      <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 'var(--fs-sm)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        Kids Music
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
