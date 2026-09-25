import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import type { AudioService, Track } from './audio'
import { getMediaItems, getTrackMeta, upsertTrackMeta } from './database'

interface Probed {
  duration: number
  artist: string | null
  album: string | null
}

/** Reads duration + artist/album tags with ffprobe (ships with ffmpeg, like ffplay). */
function probe(filepath: string): Promise<Probed | null> {
  return new Promise(resolve => {
    const proc = spawn('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', filepath])
    let out = ''
    proc.stdout?.on('data', d => { out += d })
    proc.on('error', () => resolve(null))
    proc.on('close', () => {
      try {
        const format = JSON.parse(out).format as { duration?: string; tags?: Record<string, string> } | undefined
        if (!format) return resolve(null)
        // Tag key casing differs between ID3 / MP4 / Vorbis.
        const tags: Record<string, string> = {}
        for (const [k, v] of Object.entries(format.tags ?? {})) tags[k.toLowerCase()] = v
        resolve({
          duration: Number(format.duration) || 0,
          artist: tags.artist?.trim() || null,
          album: tags.album?.trim() || null,
        })
      } catch {
        resolve(null)
      }
    })
  })
}

/**
 * The music library the UI browses: files on disk, enriched with portal DB
 * titles/artists/thumbnails and (cached) ffprobe duration/album tags.
 */
export class LibraryService {
  private inflight: Promise<Track[]> | null = null

  constructor(private audio: AudioService, private mediaDir: string) {}

  /** Concurrent callers (app start, alarm, random play) share one scan. */
  getTracks(): Promise<Track[]> {
    if (!this.inflight) {
      this.inflight = this.build().finally(() => { this.inflight = null })
    }
    return this.inflight
  }

  private async build(): Promise<Track[]> {
    const scanned = await this.audio.scanMedia()
    const dbByPath = new Map(getMediaItems().map(item => [item.file_path, item]))

    const tracks = scanned.map(track => {
      const dbItem = dbByPath.get(track.filepath)
      if (!dbItem) return track
      const artwork = dbItem.thumbnail_url
        ? path.join(this.mediaDir, dbItem.thumbnail_url.replace(/^\/media\//, ''))
        : track.artwork
      return { ...track, title: dbItem.title, artist: dbItem.artist || undefined, artwork }
    })

    // Probe with a small worker pool — one ffprobe spawn per file is slow on a Pi.
    let next = 0
    const worker = async () => {
      while (next < tracks.length) {
        const track = tracks[next++]
        const meta = await this.metaFor(track.filepath)
        if (!meta) continue
        track.duration = meta.duration || undefined
        track.album = meta.album ?? undefined
        track.artist = track.artist ?? meta.artist ?? undefined
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker))

    return tracks
  }

  private async metaFor(filepath: string): Promise<Probed | null> {
    let stat: fs.Stats
    try {
      stat = fs.statSync(filepath)
    } catch {
      return null
    }
    const cached = getTrackMeta(filepath)
    if (cached && cached.mtime_ms === Math.round(stat.mtimeMs) && cached.size === stat.size) {
      return { duration: cached.duration, artist: cached.artist, album: cached.album }
    }
    const probed = await probe(filepath)
    // Don't cache a failed probe (e.g. ffprobe not installed) — retry next time.
    if (probed) {
      upsertTrackMeta({
        file_path: filepath,
        mtime_ms: Math.round(stat.mtimeMs),
        size: stat.size,
        duration: probed.duration,
        artist: probed.artist,
        album: probed.album,
      })
    }
    return probed
  }
}
