import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'

// Browser preview mock — Electron preload overrides this at runtime
if (!(window as any).electronAPI) {
  ;(window as any).electronAPI = {
    platform: 'darwin',
    audio: {
      getState: () => Promise.resolve({ isPlaying: false, currentTrack: null, position: 0, duration: 0, volume: 70, queue: [], queueIndex: -1 }),
      scanMedia: () => Promise.resolve([
        { id: '1', filename: 'song1.mp3', filepath: '/media/song1.mp3', title: 'Twinkle Twinkle Little Star', duration: 180 },
        { id: '2', filename: 'song2.mp3', filepath: '/media/song2.mp3', title: 'Baby Shark', duration: 120 },
        { id: '3', filename: 'song3.mp3', filepath: '/media/song3.mp3', title: 'Wheels on the Bus', duration: 200 },
      ]),
      play: () => Promise.resolve(), pause: () => Promise.resolve(),
      resume: () => Promise.resolve(), togglePlayPause: () => Promise.resolve(),
      stop: () => Promise.resolve(), setVolume: () => Promise.resolve(),
      setQueue: () => {}, next: () => Promise.resolve(), previous: () => Promise.resolve(),
      onStateChange: () => () => {}, onTrackEnded: () => () => {},
    },
    alarm: {
      getAlarm: () => Promise.resolve({ id: 1, time: '07:00', enabled: true, sound_path: null, snooze_minutes: 5, auto_dismiss_minutes: 5 }),
      setAlarm: (_t: string, enabled: boolean, sound?: string | null) => Promise.resolve({ id: 1, time: _t, enabled, sound_path: sound ?? null, snooze_minutes: 5, auto_dismiss_minutes: 5 }),
      snooze: () => Promise.resolve(), dismiss: () => Promise.resolve(),
      onFired: () => () => {}, onDismissed: () => () => {}, onUpdated: () => () => {},
    },
    wifi: {
      getStatus: () => Promise.resolve({ apMode: false, hotspotIp: null, hotspotSsid: null, hostname: null }),
      scanNetworks: () => Promise.resolve([
        { ssid: 'Livebox-5BD0', security: 'WPA2', signal: 72, inUse: true },
        { ssid: 'Neighbor WiFi', security: 'WPA2', signal: 40, inUse: false },
        { ssid: 'Open Guest Network', security: 'Open', signal: 25, inUse: false },
      ]),
      connect: () => Promise.resolve(),
      onConnected: () => () => {},
      getConnection: () => Promise.resolve({ connected: true, ssid: 'Livebox-5BD0', signal: 80 }),
      switchNetwork: () => Promise.resolve(),
    },
    settings: {
      getDefaultVolume: () => Promise.resolve(50),
      setDefaultVolume: (v: number) => Promise.resolve(v),
    },
    device: {
      getHostname: () => Promise.resolve('kmp-bedside'),
      isOnboarded: () => Promise.resolve(true),
      validateHostname: () => Promise.resolve(null),
      setHostname: () => Promise.resolve(),
      getBattery: () => Promise.resolve(null),
      onBattery: () => () => {},
      powerOff: () => new Promise(() => {}),
      restart: () => new Promise(() => {}),
      onPower: () => () => {},
    },
    sync: { getDevice: () => Promise.resolve(null), getDiff: () => Promise.resolve({ toCopy: [], toSkip: [], orphans: [] }), startSync: () => Promise.resolve(), eject: () => Promise.resolve(), onEvent: () => () => {} },
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
