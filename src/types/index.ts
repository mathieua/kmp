export interface Track {
  id: string
  filename: string
  filepath: string
  title: string
  artwork?: string
  duration?: number
}

export interface PlaybackState {
  isPlaying: boolean
  currentTrack: Track | null
  position: number
  duration: number
  volume: number
  queue: Track[]
  queueIndex: number
}

export interface UsbDevice {
  mountPath: string
  label: string
  totalBytes: number
  freeBytes: number
}

export interface SyncDiff {
  toCopy: { relativePath: string; sizeBytes: number }[]
  toSkip: { relativePath: string }[]
  orphans: { relativePath: string; sizeBytes: number }[]
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

export type SyncStatus = 'idle' | 'syncing' | 'complete' | 'error'

export interface WifiNetwork {
  ssid: string
  security: string
  signal: number
  inUse: boolean
}

export interface WifiStatus {
  apMode: boolean
  hotspotIp: string | null
  hotspotSsid: string | null
  hostname: string | null
}

export interface Alarm {
  id: number
  time: string      // 'HH:MM'
  enabled: boolean
  sound_path: string | null
  snooze_minutes: number
  auto_dismiss_minutes: number
}

export interface ElectronAPI {
  platform: string
  wifi: {
    getStatus: () => Promise<WifiStatus>
    onConnected: (callback: () => void) => () => void
  }
  alarm: {
    getAlarm: () => Promise<Alarm | null>
    setAlarm: (time: string, enabled: boolean, soundPath?: string | null) => Promise<Alarm>
    snooze: () => Promise<void>
    dismiss: () => Promise<void>
    onFired: (callback: () => void) => () => void
    onDismissed: (callback: () => void) => () => void
    onUpdated: (callback: (alarm: Alarm) => void) => () => void
  }
  audio: {
    getState: () => Promise<PlaybackState>
    scanMedia: () => Promise<Track[]>
    play: (track?: Track) => Promise<void>
    pause: () => Promise<void>
    resume: () => Promise<void>
    togglePlayPause: () => Promise<void>
    stop: () => Promise<void>
    setVolume: (volume: number) => Promise<void>
    setQueue: (tracks: Track[], startIndex: number) => void
    next: () => Promise<void>
    previous: () => Promise<void>
    onStateChange: (callback: (state: PlaybackState) => void) => () => void
    onTrackEnded: (callback: () => void) => () => void
  }
  sync: {
    getDevice: () => Promise<UsbDevice | null>
    getDiff: () => Promise<SyncDiff>
    startSync: (deleteOrphans: string[]) => Promise<void>
    eject: () => Promise<void>
    onEvent: (callback: (event: string, payload: unknown) => void) => () => void
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
