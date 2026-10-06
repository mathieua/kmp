export interface Track {
  id: string
  filename: string
  filepath: string
  title: string
  artist?: string
  album?: string
  artwork?: string
  duration?: number
  loop?: boolean
}

export interface Playlist {
  id: number
  name: string
  /** Song file paths, in play order. */
  paths: string[]
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

export interface WifiConnection {
  connected: boolean
  ssid: string | null
  signal: number   // 0-100
}

export interface BatteryStatus {
  level: number    // 0-100
  charging: boolean
  state: 'charging' | 'discharging' | 'full' | 'idle'
  voltage: number  // V
  current: number  // A, positive = charging
  power: number    // W, absolute
  externalPower: boolean
  minutesRemaining: number | null  // to empty (discharging) or full (charging)
}

export interface Alarm {
  id: number
  time: string      // 'HH:MM'
  enabled: boolean
  sound_path: string | null
  snooze_minutes: number
  auto_dismiss_minutes: number
}

export type PowerEvent = 'hold' | 'cancel' | 'shutdown' | 'restart'

export interface ElectronAPI {
  platform: string
  wifi: {
    getStatus: () => Promise<WifiStatus>
    scanNetworks: () => Promise<WifiNetwork[]>
    connect: (ssid: string, password: string) => Promise<void>
    getConnection: () => Promise<WifiConnection>
    switchNetwork: (ssid: string, password: string) => Promise<void>
    onConnected: (callback: () => void) => () => void
  }
  device: {
    getBattery: () => Promise<BatteryStatus | null>
    onBattery: (callback: (status: BatteryStatus | null) => void) => () => void
    getHostname: () => Promise<string>
    isOnboarded: () => Promise<boolean>
    validateHostname: (name: string) => Promise<string | null>
    setHostname: (name: string) => Promise<void>
    powerOff: () => Promise<void>
    restart: () => Promise<void>
    /** 'hold' / 'cancel': skip+previous power-off countdown; 'shutdown' / 'restart': going down now. */
    onPower: (callback: (event: PowerEvent) => void) => () => void
  }
  alarm: {
    listSounds: () => Promise<Track[]>
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
    getPlaylists: () => Promise<Playlist[]>
    scanMedia: () => Promise<Track[]>
    play: (track?: Track) => Promise<void>
    pause: () => Promise<void>
    resume: () => Promise<void>
    togglePlayPause: () => Promise<void>
    stop: () => Promise<void>
    setVolume: (volume: number) => Promise<void>
    setQueue: (tracks: Track[], startIndex: number) => void
    seek: (seconds: number) => Promise<void>
    next: () => Promise<void>
    previous: () => Promise<void>
    onStateChange: (callback: (state: PlaybackState) => void) => () => void
    onTrackEnded: (callback: () => void) => () => void
  }
  settings: {
    getDefaultVolume: () => Promise<number>
    setDefaultVolume: (volume: number) => Promise<number>
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
