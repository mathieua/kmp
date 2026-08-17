import { useState, useEffect, useRef, useCallback } from 'react'
import { Clock } from './views/Clock'
import { Alarms } from './views/Alarms'
import { Playlists } from './views/Playlists'
import { MusicPlayer } from './views/MusicPlayer'
import { Settings } from './views/Settings'
import { DimmedClock } from './views/DimmedClock'
import { WifiSetup } from './views/WifiSetup'
import { useAlarm } from './hooks/useAlarm'
import { useAudio } from './hooks/useAudio'
import './styles/global.css'
import './types'

// ── Design tokens ──────────────────────────────────────────────────────────
export const PALETTES = {
  Sunset: {
    clock:  'linear-gradient(135deg, #c084fc 0%, #f472b6 50%, #60a5fa 100%)',
    alarms: 'linear-gradient(135deg, #fb923c 0%, #f87171 50%, #f472b6 100%)',
    music:  'linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)',
    accentPlay: '#9333ea',
  },
  Mint: {
    clock:  'linear-gradient(135deg, #5eead4 0%, #67e8f9 50%, #a5b4fc 100%)',
    alarms: 'linear-gradient(135deg, #fde047 0%, #fb923c 50%, #f472b6 100%)',
    music:  'linear-gradient(135deg, #10b981 0%, #14b8a6 50%, #6366f1 100%)',
    accentPlay: '#0d9488',
  },
  Candy: {
    clock:  'linear-gradient(135deg, #fb7185 0%, #f0abfc 50%, #fde047 100%)',
    alarms: 'linear-gradient(135deg, #fb7185 0%, #fbbf24 50%, #fde047 100%)',
    music:  'linear-gradient(135deg, #ec4899 0%, #f43f5e 50%, #fb923c 100%)',
    accentPlay: '#be185d',
  },
  Ocean: {
    clock:  'linear-gradient(135deg, #0ea5e9 0%, #6366f1 50%, #1e3a8a 100%)',
    alarms: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 50%, #6366f1 100%)',
    music:  'linear-gradient(135deg, #1e3a8a 0%, #6366f1 50%, #06b6d4 100%)',
    accentPlay: '#1d4ed8',
  },
}
export type PaletteName = keyof typeof PALETTES
export type Palette = typeof PALETTES[PaletteName]

export const SONG_GRADIENTS = [
  'linear-gradient(135deg, #fbbf24, #fb923c)',
  'linear-gradient(135deg, #4ade80, #2dd4bf)',
  'linear-gradient(135deg, #60a5fa, #a78bfa)',
  'linear-gradient(135deg, #f472b6, #f87171)',
  'linear-gradient(135deg, #818cf8, #a855f7)',
  'linear-gradient(135deg, #22d3ee, #60a5fa)',
]

export const CORNER_RADIUS = 28

// ── i18n ───────────────────────────────────────────────────────────────────
export const STRINGS = {
  en: {
    alarms: 'Alarms', music: 'Music Player', playlists: 'Playlists',
    settings: 'Settings', nextAlarm: 'Next Alarm', setAlarm: 'Set Alarm',
    tapAdd: 'Tap to add', nowPlaying: 'Now Playing', tapBrowse: 'Tap to browse',
    save: 'Save', cancel: 'Cancel', noAlarms: 'No alarms yet',
    addFirst: 'Tap the + button to add your first alarm',
    songs: 'songs', language: 'Language', theme: 'Theme', autoDim: 'Auto dim',
    seconds: 's', never: 'Never', tapToWake: 'Tap anywhere to wake',
    myMusic: 'My Music', allTracks: 'Your tracks',
  },
  fr: {
    alarms: 'Alarmes', music: 'Lecteur', playlists: 'Playlists',
    settings: 'Réglages', nextAlarm: 'Prochaine alarme', setAlarm: 'Régler une alarme',
    tapAdd: 'Touchez pour ajouter', nowPlaying: 'En lecture', tapBrowse: 'Touchez pour parcourir',
    save: 'Enregistrer', cancel: 'Annuler', noAlarms: 'Aucune alarme',
    addFirst: 'Touchez le bouton + pour ajouter une alarme',
    songs: 'titres', language: 'Langue', theme: 'Thème', autoDim: 'Mise en veille',
    seconds: 's', never: 'Jamais', tapToWake: 'Touchez pour réveiller',
    myMusic: 'Ma Musique', allTracks: 'Vos pistes',
  },
} as const
export type Lang = keyof typeof STRINGS
export const t = (lang: Lang, key: keyof typeof STRINGS['en']): string =>
  (STRINGS[lang] ?? STRINGS.en)[key] ?? key

export const DATE_LABELS = {
  en: {
    days: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
    months: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
    fmt: (d: Date, days: string[], months: string[]) =>
      `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`,
  },
  fr: {
    days: ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'],
    months: ['Janv.','Févr.','Mars','Avr.','Mai','Juin','Juil.','Août','Sept.','Oct.','Nov.','Déc.'],
    fmt: (d: Date, days: string[], months: string[]) =>
      `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`,
  },
}

export const DAYS_EN = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] as const
export const DAYS_FR = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'] as const
export type DayCode = typeof DAYS_EN[number]

// ── Settings ───────────────────────────────────────────────────────────────
export interface AppSettings {
  lang: Lang
  theme: PaletteName
  dimSeconds: number
}

const SETTINGS_KEY = 'kmp_settings'
const loadSettings = (): AppSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? { lang: 'en', theme: 'Sunset', dimSeconds: 30, ...JSON.parse(raw) } : { lang: 'en', theme: 'Sunset', dimSeconds: 30 }
  } catch { return { lang: 'en', theme: 'Sunset', dimSeconds: 30 } }
}
const saveSettings = (s: AppSettings) => localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))

// ── Stage ──────────────────────────────────────────────────────────────────
function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#000' }}>
      {children}
    </div>
  )
}

// ── Routes ─────────────────────────────────────────────────────────────────
export type Route = 'clock' | 'alarms' | 'playlists' | 'music' | 'settings'

// ── App ────────────────────────────────────────────────────────────────────
function App() {
  const [route, setRoute] = useState<Route>('clock')
  const [settings, setSettingsState] = useState<AppSettings>(loadSettings)
  const [dimmed, setDimmed] = useState(false)
  const [wifiApMode, setWifiApMode] = useState(false)
  const [hasUsbDevice, setHasUsbDevice] = useState(false)
  const dimTimerRef = useRef<NodeJS.Timeout | null>(null)

  const { alarm, isFiring, snooze, dismiss } = useAlarm()
  const { isPlaying, currentTrack, togglePlayPause } = useAudio()

  const palette = PALETTES[settings.theme] ?? PALETTES.Sunset
  const lang = settings.lang

  const updateSettings = useCallback((s: AppSettings) => {
    setSettingsState(s)
    saveSettings(s)
  }, [])

  // WiFi AP mode
  useEffect(() => {
    const check = () => window.electronAPI.wifi.getStatus()
      .then(s => setWifiApMode(s.apMode))
      .catch(() => {})
    check()
    // Safety net: the systemd wifi check is supposed to finish (AP mode
    // included) before the app ever launches, but if that ordering is ever
    // broken (e.g. an older unit file still installed), don't get stuck
    // showing the wrong screen for the rest of the session — keep polling
    // for AP mode turning on. Cheap: a single fs.existsSync check.
    const interval = setInterval(check, 5000)
    const unsubscribe = window.electronAPI.wifi.onConnected(() => setWifiApMode(false))
    return () => {
      clearInterval(interval)
      unsubscribe()
    }
  }, [])

  // USB sync device
  useEffect(() => {
    window.electronAPI.sync.getDevice().then(dev => setHasUsbDevice(!!dev)).catch(() => {})
    return window.electronAPI.sync.onEvent((event) => {
      if (event === 'usb_connected') setHasUsbDevice(true)
      else if (event === 'usb_disconnected') setHasUsbDevice(false)
    })
  }, [])

  // Navigate to sync on USB connect
  useEffect(() => {
    if (hasUsbDevice) setRoute('clock') // sync view handled in Clock via overlay
  }, [hasUsbDevice])

  // Auto-dim idle timer
  useEffect(() => {
    const { dimSeconds } = settings
    if (!dimSeconds) return

    const reset = () => {
      if (dimTimerRef.current) clearTimeout(dimTimerRef.current)
      if (dimmed) return
      dimTimerRef.current = setTimeout(() => setDimmed(true), dimSeconds * 1000)
    }
    reset()
    const events = ['mousedown', 'mousemove', 'touchstart', 'keydown'] as const
    events.forEach(e => window.addEventListener(e, reset))
    return () => {
      if (dimTimerRef.current) clearTimeout(dimTimerRef.current)
      events.forEach(e => window.removeEventListener(e, reset))
    }
  }, [settings.dimSeconds, dimmed, route])

  const wake = useCallback(() => setDimmed(false), [])

  const navigate = useCallback((r: Route) => {
    setRoute(r)
    setDimmed(false)
  }, [])

  if (wifiApMode) {
    return <Stage><WifiSetup /></Stage>
  }

  return (
    <Stage>
      {dimmed ? (
        <DimmedClock
          alarm={alarm}
          isPlaying={isPlaying}
          currentTrack={currentTrack}
          lang={lang}
          onWake={wake}
        />
      ) : (
        <>
          {route === 'clock' && (
            <Clock
              palette={palette}
              lang={lang}
              alarm={alarm}
              isPlaying={isPlaying}
              currentTrack={currentTrack}
              onTogglePlay={togglePlayPause}
              onNavigate={navigate}
            />
          )}
          {route === 'alarms' && (
            <Alarms
              palette={palette}
              lang={lang}
              onNavigate={navigate}
            />
          )}
          {route === 'playlists' && (
            <Playlists
              palette={palette}
              lang={lang}
              onNavigate={navigate}
            />
          )}
          {route === 'music' && (
            <MusicPlayer
              palette={palette}
              lang={lang}
              onNavigate={navigate}
            />
          )}
          {route === 'settings' && (
            <Settings
              palette={palette}
              lang={lang}
              settings={settings}
              onSettings={updateSettings}
              onNavigate={navigate}
            />
          )}
        </>
      )}

      {/* Alarm fired overlay */}
      {isFiring && (
        <div className="alarm-overlay">
          <div className="alarm-overlay-time">
            {alarm ? (() => {
              const [h, m] = alarm.time.split(':').map(Number)
              return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
            })() : ''}
          </div>
          <div className="alarm-overlay-label">Wake Up! ☀️</div>
          <div className="alarm-overlay-actions">
            <button className="alarm-overlay-btn alarm-overlay-btn--snooze" onClick={snooze}>
              <span>Snooze</span>
              <span className="alarm-overlay-btn-sub">5 minutes</span>
            </button>
            <button className="alarm-overlay-btn alarm-overlay-btn--dismiss" onClick={dismiss}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </Stage>
  )
}

export default App
