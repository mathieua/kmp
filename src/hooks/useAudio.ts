import { useState, useEffect, useCallback } from 'react'
import { Track, PlaybackState, Playlist } from '../types'

const initialState: PlaybackState = {
  isPlaying: false,
  currentTrack: null,
  position: 0,
  duration: 0,
  volume: 50,
  queue: [],
  queueIndex: -1,
}

// ── Library: scanned once, shared by every screen ──────────────────────────
// Cached at module level so navigating between screens shows the list
// instantly; each mount still refreshes in the background (the main process
// caches ffprobe results, so this is cheap).
let libraryCache: Track[] | null = null
const libraryListeners = new Set<(tracks: Track[]) => void>()

async function refreshLibrary(): Promise<void> {
  libraryCache = await window.electronAPI.audio.scanMedia()
  libraryListeners.forEach(l => l(libraryCache!))
}

export function useLibrary() {
  const [tracks, setTracks] = useState<Track[]>(libraryCache ?? [])
  const [isLoading, setIsLoading] = useState(libraryCache === null)

  useEffect(() => {
    libraryListeners.add(setTracks)
    refreshLibrary().catch(console.error).finally(() => setIsLoading(false))
    return () => { libraryListeners.delete(setTracks) }
  }, [])

  return { tracks, isLoading, rescan: refreshLibrary }
}

// ── Playback: live state + controls, no library scan ───────────────────────
export function usePlayback() {
  const [state, setState] = useState<PlaybackState>(initialState)

  useEffect(() => {
    window.electronAPI.audio.getState().then(setState)
    return window.electronAPI.audio.onStateChange(setState)
  }, [])

  const togglePlayPause = useCallback(() => window.electronAPI.audio.togglePlayPause(), [])
  const setVolume = useCallback((volume: number) => window.electronAPI.audio.setVolume(volume), [])
  const next = useCallback(() => window.electronAPI.audio.next(), [])
  const previous = useCallback(() => window.electronAPI.audio.previous(), [])
  const seek = useCallback((seconds: number) => window.electronAPI.audio.seek(seconds), [])

  /** Plays `track`, with `queue` (in order) as what follows it. */
  const playFrom = useCallback((queue: Track[], track: Track) => {
    const index = queue.findIndex(t => t.id === track.id)
    window.electronAPI.audio.setQueue(queue, index >= 0 ? index : 0)
  }, [])

  return { ...state, togglePlayPause, setVolume, next, previous, seek, playFrom }
}

/** Playback + the full library (kept for views that need both). */
export function useAudio() {
  const playback = usePlayback()
  const { tracks, isLoading, rescan } = useLibrary()
  const playTrack = useCallback((track: Track) => playback.playFrom(tracks, track), [playback.playFrom, tracks])
  return { ...playback, tracks, isLoading, rescan, playTrack }
}

/** Playlists made in the parent app. Refetched on mount so new ones show up. */
export function usePlaylists(): Playlist[] {
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  useEffect(() => {
    window.electronAPI.audio.getPlaylists().then(setPlaylists).catch(() => {})
  }, [])
  return playlists
}
