import { Palette, Lang, Route, t, CORNER_RADIUS, SONG_GRADIENTS } from '../App'
import { useAudio } from '../hooks/useAudio'
import { CircleBtn, IconBack, IconChevronRight } from '../components/Icons'

interface PlaylistsProps {
  palette: Palette
  lang: Lang
  onNavigate: (r: Route) => void
}

const STATIC_PLAYLISTS = [
  { id: 'wakeup',    title: 'Wake Up',     subtitle: 'Morning energy', cover: 'linear-gradient(135deg, #fbbf24, #fb923c)', emoji: '☀️' },
  { id: 'adventure', title: 'Adventure',   subtitle: 'Big and bold',   cover: 'linear-gradient(135deg, #4ade80, #2dd4bf)', emoji: '🚀' },
  { id: 'calm',      title: 'Calm Down',   subtitle: 'Quiet time',     cover: 'linear-gradient(135deg, #60a5fa, #a78bfa)', emoji: '🌙' },
  { id: 'dance',     title: 'Dance Party', subtitle: 'Wiggle time',    cover: 'linear-gradient(135deg, #f472b6, #f87171)', emoji: '🎉' },
]

export function Playlists({ palette, lang, onNavigate }: PlaylistsProps) {
  const { tracks } = useAudio()
  const r = CORNER_RADIUS

  // One real "My Music" playlist + static ones for categorisation
  const myMusicCount = tracks.length
  const allPlaylists = [
    {
      id: 'mymusic',
      title: t(lang, 'myMusic'),
      subtitle: t(lang, 'allTracks'),
      cover: SONG_GRADIENTS[2],
      emoji: '🎵',
      count: myMusicCount,
    },
    ...STATIC_PLAYLISTS.map(p => ({ ...p, count: 4 })),
  ]

  return (
    <div style={{
      width: '100%', height: '100%', background: palette.music,
      display: 'flex', flexDirection: 'column', padding: 'var(--pad)', gap: 'var(--gap)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <CircleBtn onClick={() => onNavigate('clock')}><IconBack size="var(--icon)" /></CircleBtn>
        <h1 style={{ color: '#fff', fontSize: 'var(--fs-h1)', fontWeight: 800, margin: 0 }}>{t(lang, 'playlists')}</h1>
        <div style={{ width: 'var(--btn)' }} />
      </div>

      {/* List */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--gap-sm)', overflowY: 'auto', paddingRight: 4 }}>
        {allPlaylists.map(p => (
          <button key={p.id}
            onClick={() => onNavigate('music')}
            style={{
              background: 'rgba(255,255,255,0.15)',
              backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: 'var(--r)', padding: 'var(--gap-sm)',
              display: 'flex', alignItems: 'center', gap: 'var(--gap)',
              cursor: 'pointer', textAlign: 'left', color: '#fff',
              transition: 'transform 0.12s ease, background 0.15s',
              flexShrink: 0, fontFamily: 'inherit',
            }}
            onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.98)')}
            onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <div style={{
              width: 'var(--thumb-lg)', height: 'var(--thumb-lg)', borderRadius: 'var(--r-sm)', background: p.cover,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 'var(--fs-h1)', boxShadow: '0 8px 22px rgba(0,0,0,0.22)', flexShrink: 0,
            }}>{p.emoji}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 'var(--fs-h2)', fontWeight: 800, lineHeight: 1.1, marginBottom: 'var(--gap-xs)' }}>{p.title}</div>
              <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, opacity: 0.85 }}>
                {p.subtitle} · {p.count} {t(lang, 'songs')}
              </div>
            </div>
            <div style={{
              width: 'var(--btn-sm)', height: 'var(--btn-sm)', borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <IconChevronRight size="var(--icon)" stroke="#fff" />
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
