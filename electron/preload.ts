import { contextBridge, ipcRenderer } from 'electron'

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

export interface PlaybackState {
  isPlaying: boolean
  currentTrack: Track | null
  position: number
  duration: number
  volume: number
  queue: Track[]
  queueIndex: number
}

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // Audio controls
  audio: {
    getState: (): Promise<PlaybackState> => ipcRenderer.invoke('audio:getState'),
    getPlaylists: () => ipcRenderer.invoke('library:getPlaylists'),
    scanMedia: (): Promise<Track[]> => ipcRenderer.invoke('audio:scanMedia'),
    play: (track?: Track): Promise<void> => ipcRenderer.invoke('audio:play', track),
    pause: (): Promise<void> => ipcRenderer.invoke('audio:pause'),
    resume: (): Promise<void> => ipcRenderer.invoke('audio:resume'),
    togglePlayPause: (): Promise<void> => ipcRenderer.invoke('audio:togglePlayPause'),
    stop: (): Promise<void> => ipcRenderer.invoke('audio:stop'),
    setVolume: (volume: number): Promise<void> => ipcRenderer.invoke('audio:setVolume', volume),
    setQueue: (tracks: Track[], startIndex: number): void => {
      ipcRenderer.invoke('audio:setQueue', tracks, startIndex)
    },
    seek: (seconds: number): Promise<void> => ipcRenderer.invoke('audio:seek', seconds),
    next: (): Promise<void> => ipcRenderer.invoke('audio:next'),
    previous: (): Promise<void> => ipcRenderer.invoke('audio:previous'),

    // Event listeners
    onStateChange: (callback: (state: PlaybackState) => void) => {
      const listener = (_: Electron.IpcRendererEvent, state: PlaybackState) => callback(state)
      ipcRenderer.on('audio:stateChange', listener)
      return () => ipcRenderer.removeListener('audio:stateChange', listener)
    },
    onTrackEnded: (callback: () => void) => {
      const listener = () => callback()
      ipcRenderer.on('audio:trackEnded', listener)
      return () => ipcRenderer.removeListener('audio:trackEnded', listener)
    },
  },

  // Alarm controls
  alarm: {
    getAlarm: () => ipcRenderer.invoke('alarm:getAlarm'),
    setAlarm: (time: string, enabled: boolean, soundPath?: string | null) => ipcRenderer.invoke('alarm:setAlarm', time, enabled, soundPath),
    listSounds: () => ipcRenderer.invoke('alarm:listSounds'),
    snooze: () => ipcRenderer.invoke('alarm:snooze'),
    dismiss: () => ipcRenderer.invoke('alarm:dismiss'),
    onFired: (callback: () => void) => {
      const listener = () => callback()
      ipcRenderer.on('alarm:fired', listener)
      return () => ipcRenderer.removeListener('alarm:fired', listener)
    },
    onDismissed: (callback: () => void) => {
      const listener = () => callback()
      ipcRenderer.on('alarm:dismissed', listener)
      return () => ipcRenderer.removeListener('alarm:dismissed', listener)
    },
    onUpdated: (callback: (alarm: unknown) => void) => {
      const listener = (_: Electron.IpcRendererEvent, alarm: unknown) => callback(alarm)
      ipcRenderer.on('alarm:updated', listener)
      return () => ipcRenderer.removeListener('alarm:updated', listener)
    },
  },

  // Persistent settings the main process also needs (alarm volume)
  settings: {
    getDefaultVolume: (): Promise<number> => ipcRenderer.invoke('settings:getDefaultVolume'),
    setDefaultVolume: (volume: number): Promise<number> => ipcRenderer.invoke('settings:setDefaultVolume', volume),
  },

  // WiFi provisioning
  wifi: {
    getStatus: () => ipcRenderer.invoke('wifi:getStatus'),
    scanNetworks: () => ipcRenderer.invoke('wifi:scanNetworks'),
    getConnection: () => ipcRenderer.invoke('wifi:getConnection'),
    switchNetwork: (ssid: string, password: string) => ipcRenderer.invoke('wifi:switchNetwork', ssid, password),
    connect: (ssid: string, password: string) => ipcRenderer.invoke('wifi:connect', ssid, password),
    onConnected: (callback: () => void) => {
      const listener = () => callback()
      ipcRenderer.on('wifi:connected', listener)
      return () => ipcRenderer.removeListener('wifi:connected', listener)
    },
  },

  // Device identity / OOBE
  device: {
    getBattery: () => ipcRenderer.invoke('device:getBattery'),
    onBattery: (callback: (status: unknown) => void) => {
      const listener = (_: unknown, status: unknown) => callback(status)
      ipcRenderer.on('battery:update', listener)
      return () => ipcRenderer.removeListener('battery:update', listener)
    },
    getHostname: () => ipcRenderer.invoke('device:getHostname'),
    isOnboarded: () => ipcRenderer.invoke('device:isOnboarded'),
    validateHostname: (name: string) => ipcRenderer.invoke('device:validateHostname', name),
    setHostname: (name: string) => ipcRenderer.invoke('device:setHostname', name),
  },

  // Sync controls
  sync: {
    getDevice: () => ipcRenderer.invoke('sync:getDevice'),
    getDiff: () => ipcRenderer.invoke('sync:getDiff'),
    startSync: (deleteOrphans: string[]) => ipcRenderer.invoke('sync:startSync', deleteOrphans),
    eject: () => ipcRenderer.invoke('sync:eject'),
    onEvent: (callback: (event: string, payload: unknown) => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: { event: string; payload: unknown }) => {
        callback(data.event, data.payload)
      }
      ipcRenderer.on('sync:event', listener)
      return () => ipcRenderer.removeListener('sync:event', listener)
    },
  },
})
