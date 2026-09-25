import { useState, useMemo, useEffect } from 'react'
import { Palette, Lang, Route, t, SONG_GRADIENTS } from '../App'
import { Track } from '../types'
import { useLibrary, usePlayback } from '../hooks/useAudio'
import { ScreenHeader } from '../components/ScreenHeader'
import { HeaderActions } from '../components/HeaderActions'
import { OnScreenKeyboard } from '../components/OnScreenKeyboard'
import {
  CircleBtn, IconMusic, IconPlay, IconPause, IconSearch, IconClose, IconChevronRight, Equalizer,
} from '../components/Icons'
import {
  artworkUrl, formatTime, searchTracks, sortByTitle, groupTracks, firstArtwork, Group,
} from '../lib/media'

interface LibraryProps {
  palette: Palette
  lang: Lang
  onNavigate: (r: Route) => void
}

type Tab = 'songs' | 'artists' | 'albums' | 'search'

// ── Playlists ──────────────────────────────────────────────────────────────
// For now the only playlist is the built-in "All" (every song). With just one,
// the playlist picker is skipped and it opens straight away; the picker shows
// up on its own as soon as a second playlist exists.
interface Playlist {
  id: string
  nameKey: 'allPlaylist'
  coverIndex: number   // into SONG_GRADIENTS (resolved at render — App imports this file)
  emoji: string
  select: (all: Track[]) => Track[]
}
const PLAYLISTS: Playlist[] = [
  { id: 'all', nameKey: 'allPlaylist', coverIndex: 2, emoji: '🎵', select: all => all },
]

// Remembered across visits so "back" from the player lands exactly where you were.
interface Nav { playlist: string | null; tab: Tab; artist: string | null; album: string | null; query: string }
let saved: Nav = { playlist: null, tab: 'songs', artist: null, album: null, query: '' }

const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,0.14)',
  backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.18)',
}

function Art({ src, index, size, radius, children }: {
  src?: string; index: number; size: string; radius: string; children?: React.ReactNode
}) {
  const url = artworkUrl(src)
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0, overflow: 'hidden',
      background: SONG_GRADIENTS[index % SONG_GRADIENTS.length],
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {url
        ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : (children ?? <IconMusic size="var(--icon-sm)" stroke="#fff" />)}
    </div>
  )
}

function ListRow({ onClick, active, children }: { onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      ...glass, display: 'flex', alignItems: 'center', gap: 'var(--gap-sm)', textAlign: 'left',
      padding: 'var(--gap-sm)', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: '#fff',
      background: active ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.12)',
      border: active ? '1.5px solid rgba(255,255,255,0.45)' : '1.5px solid transparent',
      fontFamily: 'inherit', flexShrink: 0, width: '100%',
    }}>{children}</button>
  )
}

const ellipsis: React.CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }

export function Library({ palette, lang, onNavigate }: LibraryProps) {
  const { tracks, isLoading } = useLibrary()
  const player = usePlayback()

  const [playlistId, setPlaylistId] = useState(saved.playlist)
  const [tab, setTab] = useState<Tab>(saved.tab)
  const [artist, setArtist] = useState(saved.artist)
  const [album, setAlbum] = useState(saved.album)
  const [query, setQuery] = useState(saved.query)
  const [kbOpen, setKbOpen] = useState(saved.tab === 'search' && !saved.query)

  useEffect(() => { saved = { playlist: playlistId, tab, artist, album, query } },
    [playlistId, tab, artist, album, query])

  // Single playlist -> select it right away.
  const playlist = PLAYLISTS.length === 1
    ? PLAYLISTS[0]
    : PLAYLISTS.find(p => p.id === playlistId) ?? null

  const songs = useMemo(() => (playlist ? sortByTitle(playlist.select(tracks)) : []), [playlist, tracks])
  const artists = useMemo(() => groupTracks(songs, s => s.artist ?? ''), [songs])
  const albums = useMemo(() => groupTracks(songs, s => s.album ?? ''), [songs])
  const results = useMemo(() => searchTracks(songs, query), [songs, query])

  const count = (n: number) => `${n} ${t(lang, n === 1 ? 'song' : 'songs')}`
  const artistName = (name: string) => name || t(lang, 'unknownArtist')
  const albumName = (name: string) => name || t(lang, 'singles')

  const selectedGroup: Group | null =
    artist !== null ? artists.find(g => g.name === artist) ?? null
    : album !== null ? albums.find(g => g.name === album) ?? null
    : null
  const inDetail = selectedGroup !== null
  const searching = tab === 'search' && kbOpen

  const goTab = (next: Tab) => {
    setTab(next)
    setArtist(null)
    setAlbum(null)
    setKbOpen(next === 'search')
  }

  const back = () => {
    if (inDetail) { setArtist(null); setAlbum(null) }
    else if (PLAYLISTS.length > 1 && playlist) setPlaylistId(null)
    else onNavigate('clock')
  }

  const play = (queue: Track[], track: Track) => {
    player.playFrom(queue, track)
    onNavigate('player')
  }

  const trackRow = (track: Track, queue: Track[], i: number) => {
    const active = player.currentTrack?.id === track.id
    const sub = [track.artist, track.album].filter(Boolean).join(' · ')
    return (
      <ListRow key={track.id} active={active} onClick={() => play(queue, track)}>
        <Art src={track.artwork} index={i} size="var(--thumb)" radius="var(--r-xs)">
          {active && player.isPlaying ? <Equalizer /> : <IconMusic size="var(--icon-sm)" stroke="#fff" />}
        </Art>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 'var(--fs-body)', fontWeight: 800, ...ellipsis }}>{track.title}</div>
          {sub && <div style={{ fontSize: 'var(--fs-sm)', opacity: 0.78, ...ellipsis }}>{sub}</div>}
        </div>
        {track.duration ? (
          <div style={{ fontSize: 'var(--fs-sm)', opacity: 0.8, fontVariantNumeric: 'tabular-nums' }}>{formatTime(track.duration)}</div>
        ) : null}
      </ListRow>
    )
  }

  const trackList = (list: Track[]) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-xs)' }}>
      {list.map((track, i) => trackRow(track, list, i))}
    </div>
  )

  const groupGrid = (groups: Group[], kind: 'artist' | 'album') => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gap-xs)' }}>
      {groups.map((g, i) => (
        <ListRow key={g.name || '__none'} onClick={() => (kind === 'artist' ? setArtist(g.name) : setAlbum(g.name))}>
          <Art src={firstArtwork(g.tracks)} index={i} size="var(--thumb)" radius={kind === 'artist' ? '50%' : 'var(--r-xs)'}>
            <span style={{ fontSize: 'var(--fs-h3)', fontWeight: 800 }}>
              {(kind === 'artist' ? artistName(g.name) : albumName(g.name)).charAt(0).toUpperCase()}
            </span>
          </Art>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--fs-body)', fontWeight: 800, ...ellipsis }}>
              {kind === 'artist' ? artistName(g.name) : albumName(g.name)}
            </div>
            <div style={{ fontSize: 'var(--fs-sm)', opacity: 0.78, ...ellipsis }}>
              {count(g.tracks.length)}
            </div>
          </div>
        </ListRow>
      ))}
    </div>
  )

  const empty = (title: string, hint?: string) => (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'rgba(255,255,255,0.75)', fontSize: 'var(--fs-body)', padding: 'var(--gap)' }}>
      <div>
        <div style={{ fontSize: 'var(--fs-h2)', fontWeight: 800, marginBottom: 'var(--gap-xs)' }}>{title}</div>
        {hint && <div>{hint}</div>}
      </div>
    </div>
  )

  const shell = (children: React.ReactNode) => (
    <div style={{
      width: '100%', height: '100%', background: palette.music,
      display: 'flex', flexDirection: 'column', padding: 'var(--pad)', gap: 'var(--gap)', overflow: 'hidden',
    }}>{children}</div>
  )

  // ── Playlist picker (only when there is more than one playlist) ──────────
  if (!playlist) {
    return shell(
      <>
        <ScreenHeader title={t(lang, 'myMusic')} onBack={() => onNavigate('clock')}
          right={<HeaderActions onNavigate={onNavigate} />} />
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--gap-sm)' }}>
          {PLAYLISTS.map(p => {
            return (
              <ListRow key={p.id} onClick={() => setPlaylistId(p.id)}>
                <div style={{
                  width: 'var(--thumb-lg)', height: 'var(--thumb-lg)', borderRadius: 'var(--r-sm)', background: SONG_GRADIENTS[p.coverIndex],
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--fs-h1)', flexShrink: 0,
                }}>{p.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--fs-h2)', fontWeight: 800 }}>{t(lang, p.nameKey)}</div>
                  <div style={{ fontSize: 'var(--fs-sm)', opacity: 0.85 }}>{count(p.select(tracks).length)}</div>
                </div>
                <IconChevronRight size="var(--icon)" stroke="#fff" />
              </ListRow>
            )
          })}
        </div>
      </>
    )
  }

  // ── Body for the current tab ─────────────────────────────────────────────
  let body: React.ReactNode
  if (isLoading && tracks.length === 0) {
    body = empty('…')
  } else if (songs.length === 0) {
    body = empty(t(lang, 'noMusic'), t(lang, 'addMusicHint'))
  } else if (selectedGroup) {
    body = trackList(selectedGroup.tracks)
  } else if (tab === 'songs') {
    body = trackList(songs)
  } else if (tab === 'artists') {
    body = groupGrid(artists, 'artist')
  } else if (tab === 'albums') {
    body = groupGrid(albums, 'album')
  } else {
    body = query
      ? (results.length ? trackList(results) : empty(t(lang, 'noResults')))
      : empty(t(lang, 'search'), t(lang, 'searchHint'))
  }

  const title = selectedGroup
    ? (artist !== null ? artistName(selectedGroup.name) : albumName(selectedGroup.name))
    : t(lang, 'myMusic')

  const searchField = (
    <div style={{ display: 'flex', gap: 'var(--gap-sm)', alignItems: 'center', flexShrink: 0 }}>
      <div onClick={() => setKbOpen(true)} style={{
        ...glass, flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 'var(--gap-sm)',
        padding: '0 var(--gap)', height: 'var(--btn-sm)', borderRadius: 999,
        border: kbOpen ? '2px solid #fff' : '2px solid rgba(255,255,255,0.18)', cursor: 'text',
      }}>
        <IconSearch size="var(--icon-sm)" stroke="#fff" />
        <span style={{ flex: 1, minWidth: 0, color: query ? '#fff' : 'rgba(255,255,255,0.6)', fontSize: 'var(--fs-body)', fontWeight: 700, ...ellipsis }}>
          {query || t(lang, 'search')}
        </span>
        {query && (
          <button onClick={e => { e.stopPropagation(); setQuery('') }} aria-label="Clear"
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}>
            <IconClose size="var(--icon-sm)" stroke="#fff" />
          </button>
        )}
      </div>
      {kbOpen && (
        <button onClick={() => { setKbOpen(false); if (!query) goTab('songs') }} style={{
          height: 'var(--btn-sm)', padding: '0 var(--gap)', borderRadius: 999, border: 'none',
          background: '#fff', color: palette.accentPlay, fontWeight: 800, fontSize: 'var(--fs-body)', cursor: 'pointer',
        }}>{t(lang, 'done')}</button>
      )}
    </div>
  )

  const tabs: { id: Tab; label: string }[] = [
    { id: 'songs', label: t(lang, 'yourSongs') },
    { id: 'artists', label: t(lang, 'artists') },
    { id: 'albums', label: t(lang, 'albums') },
    { id: 'search', label: t(lang, 'search') },
  ]

  return shell(
    <>
      {searching ? searchField : (
        <>
          <ScreenHeader title={title} onBack={back} right={<HeaderActions onNavigate={onNavigate} />} />

          {!inDetail && (
            <div style={{ display: 'flex', gap: 'var(--gap-xs)', flexShrink: 0 }}>
              {tabs.map(tb => (
                <button key={tb.id} onClick={() => goTab(tb.id)} style={{
                  flex: 1, padding: 'var(--gap-sm) 0', borderRadius: 999, border: 'none', cursor: 'pointer',
                  fontWeight: 800, fontSize: 'var(--fs-body)', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--gap-xs)',
                  background: tab === tb.id ? '#fff' : 'rgba(255,255,255,0.18)',
                  color: tab === tb.id ? palette.accentPlay : '#fff',
                }}>
                  {tb.id === 'search' && <IconSearch size="var(--icon-sm)" stroke="currentColor" />}
                  {tb.label}
                </button>
              ))}
            </div>
          )}

          {tab === 'search' && !inDetail && searchField}
        </>
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {body}
      </div>

      {searching && (
        <div style={{ flexShrink: 0 }}>
          <OnScreenKeyboard mode="text" compact value={query} onChange={setQuery} onDone={() => setKbOpen(false)} />
        </div>
      )}

      {/* Mini player: jump back to the playback screen */}
      {!searching && player.currentTrack && (
        <div onClick={() => onNavigate('player')} style={{
          ...glass, background: 'rgba(255,255,255,0.24)', flexShrink: 0, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 'var(--gap-sm)',
          padding: 'var(--gap-xs) var(--gap-sm)', borderRadius: 'var(--r-sm)',
        }}>
          <Art src={player.currentTrack.artwork} index={0} size="var(--thumb)" radius="var(--r-xs)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontSize: 'var(--fs-body)', fontWeight: 800, ...ellipsis }}>{player.currentTrack.title}</div>
            {player.currentTrack.artist && (
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 'var(--fs-sm)', ...ellipsis }}>{player.currentTrack.artist}</div>
            )}
          </div>
          <CircleBtn size="var(--btn-sm)" bg="#fff" onClick={e => { e.stopPropagation(); player.togglePlayPause() }}>
            {player.isPlaying
              ? <IconPause size="var(--icon)" stroke={palette.accentPlay} />
              : <div style={{ transform: 'translateX(2px)' }}><IconPlay size="var(--icon)" stroke={palette.accentPlay} /></div>}
          </CircleBtn>
        </div>
      )}
    </>
  )
}
