export type Category = 'lullabies' | 'music' | 'audiobooks'

export interface MediaItem {
  id: number
  title: string
  artist: string
  category: Category
  duration_seconds: number
  file_path: string
  thumbnail_url: string | null
  source_url: string | null
  created_at: string
}

export interface ImportJob {
  id: number
  youtube_url: string
  status: 'pending' | 'downloading' | 'converting' | 'complete' | 'error'
  progress_percent: number
  error_message: string | null
  media_item_id: number | null
  created_at: string
}

export interface YoutubePrefetch {
  title: string
  artist: string
  durationSeconds: number
  thumbnailUrl: string | null
}

export interface UsbDevice {
  mountPath: string
  label: string
  totalBytes: number
  freeBytes: number
}

export interface DiffEntry {
  relativePath: string
  sizeBytes: number
}

export interface SyncDiff {
  toCopy: DiffEntry[]
  toSkip: { relativePath: string }[]
  orphans: DiffEntry[]
}

export interface SyncProgress {
  copied: number
  total: number
  currentFile: string
  bytesPerSecond: number
}

export interface SyncSummary {
  copied: number
  skipped: number
  deleted: number
  durationSeconds: number
}

export type SyncStatus = 'idle' | 'reviewing' | 'syncing' | 'complete' | 'error'

export interface UpdateStatus {
  currentVersion: string
  supported: boolean
  state: 'idle' | 'checking' | 'updating'
  lastCheck: string | null
  lastCheckError: string | null
  available: { version: string; changelog: string; publishedAt: string | null } | null
  lastResult: { status: 'success' | 'failed' | 'rolled_back'; version: string; message: string; at: string } | null
}
