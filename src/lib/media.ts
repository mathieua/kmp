import { Track } from '../types'

export function artworkUrl(artwork?: string): string | undefined {
  return artwork ? `media://${encodeURIComponent(artwork)}` : undefined
}

/** 187 -> "3:07" */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Lowercase + strip accents so "Beyonce" finds "Beyoncé". */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function searchTracks(tracks: Track[], query: string): Track[] {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  return tracks.filter(t => {
    const hay = normalize(`${t.title} ${t.artist ?? ''} ${t.album ?? ''}`)
    return words.every(w => hay.includes(w))
  })
}

export function sortByTitle(tracks: Track[]): Track[] {
  return [...tracks].sort((a, b) => a.title.localeCompare(b.title))
}

export interface Group {
  /** '' for tracks with no artist/album tag */
  name: string
  tracks: Track[]
}

/** Groups tracks by a key, alphabetically, with the untagged group last. */
export function groupTracks(tracks: Track[], key: (t: Track) => string): Group[] {
  const map = new Map<string, Track[]>()
  for (const t of tracks) {
    const k = key(t)
    map.set(k, [...(map.get(k) ?? []), t])
  }
  return [...map.entries()]
    .map(([name, list]) => ({ name, tracks: sortByTitle(list) }))
    .sort((a, b) => (a.name === '' ? 1 : b.name === '' ? -1 : a.name.localeCompare(b.name)))
}

export function firstArtwork(tracks: Track[]): string | undefined {
  return tracks.find(t => t.artwork)?.artwork
}
