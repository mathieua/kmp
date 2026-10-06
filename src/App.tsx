import { useState, useEffect, useRef, useCallback } from 'react'
import { Clock } from './views/Clock'
import { Alarms } from './views/Alarms'
import { Library } from './views/Library'
import { MusicPlayer } from './views/MusicPlayer'
import { Settings } from './views/Settings'
import { DimmedClock } from './views/DimmedClock'
import { WifiSetup } from './views/WifiSetup'
import { WifiSettings } from './views/WifiSettings'
import { BatterySettings } from './views/BatterySettings'
import { Onboarding } from './views/Onboarding'
import { PowerOverlay, PowerOverlayState, PowerAction } from './components/PowerOverlay'
import { useAlarm } from './hooks/useAlarm'
import { usePlayback } from './hooks/useAudio'
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
    device: 'Device', renameDevice: 'Rename this clock',
    song: 'song', artists: 'Artists', albums: 'Albums', search: 'Search', allPlaylist: 'All',
    unknownArtist: 'Unknown artist', singles: 'Singles',
    searchHint: 'Tap to type a song, artist or album', noResults: 'Nothing found',
    noMusic: 'No music yet', addMusicHint: 'Add music via the parent portal',
    done: 'Done', volume: 'Volume',
    wifi: 'WiFi', connectedTo: 'Connected to', notConnected: 'Not connected', changeNetwork: 'Change network',
    scanning: 'Scanning…', noNetworks: 'No networks found', rescan: 'Scan again',
    wifiPassword: 'Password', connecting: 'Connecting…', connectFailed: 'Could not connect. Check the password.', tryAgain: 'Try again',
    defaultVolume: 'Default volume',
    defaultVolumeHint: 'Starting volume, and the loudest the alarm gets',
    sound: 'Alarm sound', randomSong: 'Random song', alarmSounds: 'Alarm sounds',
    yourSongs: 'Songs', tapToChange: 'Tap to change', playMusic: 'Play music',
    battery: 'Battery', batteryDetails: 'Details', level: 'Level', state: 'State', charging: 'Charging', discharging: 'On battery', full: 'Full', idle: 'Idle',
    voltage: 'Voltage', current: 'Current', power: 'Power', externalPower: 'External power', yes: 'Connected', no: 'Not connected',
    timeRemaining: 'Time remaining', timeToFull: 'Time to full', calculating: 'Calculating…', noBattery: 'No battery detected',
    snd_beep: 'Beep Beep', snd_chime: 'Morning Chime', snd_bird: 'Little Bird', snd_musicbox: 'Music Box',
    turnOff: 'Turn off', restart: 'Restart',
    turnOffTitle: 'Turn off the clock?', restartTitle: 'Restart the clock?',
    turnOffHint: 'Alarms won\'t ring while the clock is off.',
    slideToTurnOff: 'Slide to turn off', slideToRestart: 'Slide to restart',
    turningOff: 'Turning off…', restarting: 'Restarting…',
    safeToSwitchOff: 'When the screen goes dark, you can switch off the battery.',
    keepHolding: 'Keep holding to turn off', letGoToCancel: 'Let go to cancel',
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
    device: 'Appareil', renameDevice: 'Renommer cette horloge',
    song: 'titre', artists: 'Artistes', albums: 'Albums', search: 'Rechercher', allPlaylist: 'Tout',
    unknownArtist: 'Artiste inconnu', singles: 'Titres seuls',
    searchHint: 'Touchez pour chercher un titre, artiste ou album', noResults: 'Aucun résultat',
    noMusic: 'Pas encore de musique', addMusicHint: 'Ajoutez de la musique via le portail parents',
    done: 'OK', volume: 'Volume',
    wifi: 'WiFi', connectedTo: 'Connecté à', notConnected: 'Non connecté', changeNetwork: 'Changer de réseau',
    scanning: 'Recherche…', noNetworks: 'Aucun réseau trouvé', rescan: 'Rechercher',
    wifiPassword: 'Mot de passe', connecting: 'Connexion…', connectFailed: 'Connexion impossible. Vérifiez le mot de passe.', tryAgain: 'Réessayer',
    defaultVolume: 'Volume par défaut',
    defaultVolumeHint: 'Volume de départ, et le maximum de l\'alarme',
    sound: 'Son de l\'alarme', randomSong: 'Chanson au hasard', alarmSounds: 'Sons d\'alarme',
    yourSongs: 'Chansons', tapToChange: 'Touchez pour changer', playMusic: 'Lire de la musique',
    battery: 'Batterie', batteryDetails: 'Détails', level: 'Niveau', state: 'État', charging: 'En charge', discharging: 'Sur batterie', full: 'Pleine', idle: 'Au repos',
    voltage: 'Tension', current: 'Courant', power: 'Puissance', externalPower: 'Alimentation externe', yes: 'Branchée', no: 'Débranchée',
    timeRemaining: 'Autonomie restante', timeToFull: 'Temps avant charge complète', calculating: 'Calcul…', noBattery: 'Aucune batterie détectée',
    snd_beep: 'Bip Bip', snd_chime: 'Carillon du matin', snd_bird: 'Petit oiseau', snd_musicbox: 'Boîte à musique',
    turnOff: 'Éteindre', restart: 'Redémarrer',
    turnOffTitle: 'Éteindre l\'horloge ?', restartTitle: 'Redémarrer l\'horloge ?',
    turnOffHint: 'Les alarmes ne sonneront pas tant que l\'horloge est éteinte.',
    slideToTurnOff: 'Glisser pour éteindre', slideToRestart: 'Glisser pour redémarrer',
    turningOff: 'Extinction…', restarting: 'Redémarrage…',
    safeToSwitchOff: 'Quand l\'écran est noir, vous pouvez couper la batterie.',
    keepHolding: 'Maintenez pour éteindre', letGoToCancel: 'Relâchez pour annuler',
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
export type Route = 'clock' | 'alarms' | 'library' | 'player' | 'settings' | 'wifi' | 'battery'

// ── App ────────────────────────────────────────────────────────────────────
function App() {
  const [route, setRoute] = useState<Route>('clock')
  const [settings, setSettingsState] = useState<AppSettings>(loadSettings)
  const [dimmed, setDimmed] = useState(false)
  const [wifiApMode, setWifiApMode] = useState(false)
  const [onboarded, setOnboarded] = useState<boolean | null>(null)
  const [renameRequested, setRenameRequested] = useState(false)
  const [hasUsbDevice, setHasUsbDevice] = useState(false)
  // Settings is reachable from every screen, so "back" returns to wherever it was opened from.
  const [returnRoute, setReturnRoute] = useState<Route>('clock')
  const dimTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [power, setPower] = useState<PowerOverlayState | null>(null)

  const { alarm, isFiring, snooze, dismiss } = useAlarm()
  const { isPlaying, currentTrack, togglePlayPause } = usePlayback()

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

  // First-boot naming (OOBE) — checked once; flips true directly via the
  // Onboarding screen's onDone callback rather than re-polling, since
  // nothing external changes this the way AP mode can.
  useEffect(() => {
    window.electronAPI.device.isOnboarded().then(setOnboarded).catch(() => setOnboarded(true))
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

  // Skip+previous hold on the device, and shutdowns/restarts started from
  // either place (the main process announces them before going down).
  useEffect(() => window.electronAPI.device.onPower(event => {
    setDimmed(false)
    if (event === 'hold') setPower({ mode: 'hold' })
    else if (event === 'cancel') setPower(p => (p?.mode === 'hold' ? null : p))
    else setPower({ mode: 'going', action: event })
  }), [])

  const confirmPower = useCallback((action: PowerAction) => {
    setPower({ mode: 'going', action })
    const call = action === 'shutdown' ? window.electronAPI.device.powerOff : window.electronAPI.device.restart
    call().catch(() => setPower(null))
  }, [])

  const wake = useCallback(() => setDimmed(false), [])

  const navigate = useCallback((r: Route) => {
    if (r === 'settings') setReturnRoute(cur => (route === 'settings' || route === 'wifi' || route === 'battery' ? cur : route))
    setRoute(r)
    setDimmed(false)
  }, [route])

  if (wifiApMode) {
    return <Stage><WifiSetup /></Stage>
  }

  if (onboarded === false) {
    return <Stage><Onboarding onDone={() => setOnboarded(true)} /></Stage>
  }

  if (renameRequested) {
    return (
      <Stage>
        <Onboarding
          onDone={() => setRenameRequested(false)}
          onCancel={() => setRenameRequested(false)}
        />
      </Stage>
    )
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
          {route === 'library' && (
            <Library
              palette={palette}
              lang={lang}
              onNavigate={navigate}
            />
          )}
          {route === 'player' && (
            <MusicPlayer
              palette={palette}
              lang={lang}
              onNavigate={navigate}
            />
          )}
          {route === 'wifi' && (
            <WifiSettings
              palette={palette}
              lang={lang}
              onBack={() => navigate('settings')}
              onNavigate={navigate}
            />
          )}
          {route === 'battery' && (
            <BatterySettings
              palette={palette}
              lang={lang}
              onBack={() => navigate('settings')}
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
              onBack={() => navigate(returnRoute)}
              onRenameDevice={() => setRenameRequested(true)}
              onPower={action => setPower({ mode: 'confirm', action })}
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

      {power && (
        <PowerOverlay state={power} lang={lang} onConfirm={confirmPower} onCancel={() => setPower(null)} />
      )}
    </Stage>
  )
}

export default App
