import { app, BrowserWindow, ipcMain, protocol, net, screen } from 'electron'
import path from 'path'
import { AudioService, Track } from './services/audio'
import { AlarmService } from './services/alarm'
import { HardwareService } from './services/hardware'
import { createApiService } from './services/api'
import { WifiService } from './services/wifi'
import { PowerGuard } from './services/powerGuard'
import { DeviceService } from './services/device'
import { LibraryService } from './services/library'
import { ensureAlarmSounds } from './services/alarmSounds'
import { getDefaultVolume, setDefaultVolume, getPlaylists } from './services/database'
import fs from 'fs'

const isDev = process.env.NODE_ENV !== 'production'
const isKiosk = !isDev && process.platform === 'linux'

let mainWindow: BrowserWindow | null = null
let audioService: AudioService
let alarmService: AlarmService
let wifiService: WifiService
let deviceService: DeviceService
let hardwareService: HardwareService

// Shared by the Settings buttons and the skip+previous hold. Tells the UI
// first so it can show its "turning off" screen, stops playback so the amp
// is switched off cleanly, then hands over to the OS.
async function powerAction(action: 'shutdown' | 'restart'): Promise<void> {
  mainWindow?.webContents.send('power:event', action)
  await audioService?.stop().catch(() => {})
  if (action === 'shutdown') await deviceService.powerOff()
  else await deviceService.restart()
}
let libraryService: LibraryService
// Generated alarm tones (written to the data dir on startup)
let alarmSounds: Track[] = []
// True from the moment an alarm fires until it's dismissed/snoozed, so we only
// restore the volume afterwards when an alarm actually changed it.
let alarmSession = false

// Timers managed by main process when alarm fires
let alarmVolumeRampTimer: NodeJS.Timeout | null = null
let alarmAutoDismissTimer: NodeJS.Timeout | null = null

function createWindow() {
  // `fullscreen`/`kiosk` are EWMH hints that rely on a window manager to
  // enforce them. These kiosks run bare Xorg with no WM (see .xinitrc), so
  // on displays other than the original 800x480 panel those flags are
  // silently ignored and the window sits at its literal width/height,
  // centered with black borders. Sizing explicitly from the real display
  // bounds works regardless of whether a WM is present.
  const { width, height } = isKiosk ? screen.getPrimaryDisplay().bounds : { width: 800, height: 480 }

  mainWindow = new BrowserWindow({
    width,
    height,
    x: isKiosk ? 0 : undefined,
    y: isKiosk ? 0 : undefined,
    fullscreen: isKiosk,
    frame: !isKiosk,
    kiosk: isKiosk,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // Hide cursor in production (kiosk mode)
  if (isKiosk) {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow?.webContents.insertCSS('* { cursor: none !important; }')
    })
  }

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function clearAlarmTimers() {
  if (alarmVolumeRampTimer) {
    clearInterval(alarmVolumeRampTimer)
    alarmVolumeRampTimer = null
  }
  if (alarmAutoDismissTimer) {
    clearTimeout(alarmAutoDismissTimer)
    alarmAutoDismissTimer = null
  }
}

function setupAudioService() {
  const mediaDir = process.env.KMP_MEDIA_DIR
    ?? (isKiosk
      ? path.join(app.getPath('home'), 'alarm-clock/media')
      : path.join(__dirname, '../../media'))

  audioService = new AudioService(mediaDir)
  libraryService = new LibraryService(audioService, mediaDir)
  audioService.setLibraryProvider(() => libraryService.getTracks())
  audioService.setVolume(getDefaultVolume())

  // Forward state changes to renderer
  audioService.on('stateChange', (state) => {
    mainWindow?.webContents.send('audio:stateChange', state)
  })

  audioService.on('trackEnded', () => {
    mainWindow?.webContents.send('audio:trackEnded')
  })
}

function setupAlarmService() {
  alarmService = new AlarmService()

  // Volume is always ramped up to (and restored to) the parent's default
  // volume, so it doubles as the alarm's maximum loudness.
  const restoreVolume = async () => {
    if (!alarmSession) return
    alarmSession = false
    await audioService.setVolume(getDefaultVolume())
  }

  alarmService.on('fired', async () => {
    clearAlarmTimers()
    alarmSession = true

    // Chosen sound (a song or a generated tone) -> else a random song ->
    // else a generated tone, so an empty library never means a silent alarm.
    const alarm = alarmService.getAlarm()
    const tracks = await libraryService.getTracks()
    const chosen = alarm?.sound_path
      ? [...alarmSounds, ...tracks].find(t => t.filepath === alarm.sound_path)
      : undefined
    const track = chosen
      ?? (tracks.length > 0
        ? tracks[Math.floor(Math.random() * tracks.length)]
        : alarmSounds[0])

    if (track) {
      await audioService.setVolume(0)
      await audioService.play(track)

      // Fade in from 0 to the default volume over 30s (10 steps × 3s)
      let step = 0
      const targetVolume = getDefaultVolume()
      const steps = 10
      alarmVolumeRampTimer = setInterval(async () => {
        step++
        const vol = Math.round((targetVolume / steps) * step)
        await audioService.setVolume(Math.min(vol, targetVolume))
        if (step >= steps) {
          clearInterval(alarmVolumeRampTimer!)
          alarmVolumeRampTimer = null
        }
      }, 3000)
    }

    // Auto-dismiss after 5 minutes
    alarmAutoDismissTimer = setTimeout(() => {
      alarmService.dismiss()
    }, 5 * 60_000)

    mainWindow?.webContents.send('alarm:fired')
  })

  alarmService.on('dismissed', async () => {
    clearAlarmTimers()
    await audioService.stop()
    await restoreVolume()
    mainWindow?.webContents.send('alarm:dismissed')
  })

  alarmService.on('snoozed', async () => {
    clearAlarmTimers()
    await audioService.stop()
    await restoreVolume()
    mainWindow?.webContents.send('alarm:dismissed')
  })

  alarmService.start()
}

function setupIpcHandlers(mediaDir: string) {
  ipcMain.handle('audio:getState', () => {
    return audioService.getState()
  })

  ipcMain.handle('library:getPlaylists', () => getPlaylists())
  ipcMain.handle('audio:scanMedia', () => libraryService.getTracks())

  ipcMain.handle('audio:play', async (_, track?: Track) => {
    await audioService.play(track)
  })

  ipcMain.handle('audio:pause', async () => {
    await audioService.pause()
  })

  ipcMain.handle('audio:resume', async () => {
    await audioService.resume()
  })

  ipcMain.handle('audio:togglePlayPause', async () => {
    await audioService.togglePlayPause()
  })

  ipcMain.handle('audio:stop', async () => {
    await audioService.stop()
  })

  ipcMain.handle('audio:setVolume', async (_, volume: number) => {
    await audioService.setVolume(volume)
  })

  ipcMain.handle('audio:setQueue', (_, tracks: Track[], startIndex: number) => {
    audioService.setQueue(tracks, startIndex)
  })

  ipcMain.handle('audio:seek', async (_, seconds: number) => {
    await audioService.seek(seconds)
  })

  // Settings
  ipcMain.handle('settings:getDefaultVolume', () => getDefaultVolume())
  ipcMain.handle('settings:setDefaultVolume', async (_, volume: number) => {
    const v = setDefaultVolume(volume)
    // Apply it right away so the parent hears what they picked.
    await audioService.setVolume(v)
    return v
  })

  ipcMain.handle('audio:next', async () => {
    await audioService.playNext()
  })

  ipcMain.handle('audio:previous', async () => {
    await audioService.playPrevious()
  })

  // Alarm IPC handlers
  ipcMain.handle('alarm:getAlarm', () => alarmService.getAlarm())
  ipcMain.handle('alarm:setAlarm', (_, time: string, enabled: boolean, soundPath?: string | null) => {
    const updated = alarmService.setAlarm(time, enabled, soundPath)
    mainWindow?.webContents.send('alarm:updated', updated)
    return updated
  })
  ipcMain.handle('alarm:listSounds', () => alarmSounds)
  ipcMain.handle('alarm:snooze', () => alarmService.snooze())
  ipcMain.handle('alarm:dismiss', () => alarmService.dismiss())
}

app.whenReady().then(() => {
  // Register protocol for serving local media files
  protocol.handle('media', (request) => {
    const filePath = decodeURIComponent(request.url.replace('media://', ''))
    return net.fetch('file://' + filePath)
  })

  const mediaDir = process.env.KMP_MEDIA_DIR
    ?? (isKiosk
      ? path.join(app.getPath('home'), 'alarm-clock/media')
      : path.join(__dirname, '../../media'))
  // OTA layout (kmp-backend.service) points these at the writable /opt/kmp
  // mount; the defaults keep pre-OTA devices and dev machines working.
  const dataDir = process.env.KMP_DATA_DIR
    ?? (isKiosk
      ? path.join(app.getPath('home'), 'alarm-clock/data')
      : path.join(__dirname, '../../data'))
  fs.mkdirSync(dataDir, { recursive: true })
  alarmSounds = ensureAlarmSounds(path.join(dataDir, 'alarm-sounds'))

  wifiService = new WifiService()

  const apiService = createApiService(mediaDir, dataDir, wifiService, () => {
    // Called by Express after successful WiFi connect — notify the renderer
    mainWindow?.webContents.send('wifi:connected')
  })
  apiService.start(3000)

  // WiFi IPC handlers
  ipcMain.handle('wifi:getStatus', () => wifiService.getStatus())
  ipcMain.handle('wifi:getConnection', () => wifiService.getConnection())
  // Change network from Settings: connect in place, no teardown/reboot (unlike wifi:connect, the AP-setup flow).
  ipcMain.handle('wifi:switchNetwork', (_, ssid: string, password: string) => wifiService.connect(ssid, password))
  ipcMain.handle('wifi:scanNetworks', () => wifiService.scanNetworks())
  ipcMain.handle('wifi:connect', (_, ssid: string, password: string) =>
    wifiService.connectAndFinalize(ssid, password, () => {
      mainWindow?.webContents.send('wifi:connected')
    })
  )

  // Device IPC handlers (requires the DB, initialized inside createApiService above)
  deviceService = new DeviceService(dataDir)
  ipcMain.handle('device:getBattery', () => deviceService.getBattery())
  ipcMain.handle('device:getHostname', () => deviceService.getHostname())
  ipcMain.handle('device:isOnboarded', () => deviceService.isOnboarded())
  ipcMain.handle('device:validateHostname', (_, name: string) => deviceService.validateHostname(name))
  ipcMain.handle('device:setHostname', (_, name: string) => deviceService.setHostname(name))
  ipcMain.handle('device:powerOff', () => powerAction('shutdown'))
  ipcMain.handle('device:restart', () => powerAction('restart'))

  // Forward sync/USB events to renderer
  apiService.sync.onEvent((event, payload) => {
    mainWindow?.webContents.send('sync:event', { event, payload })
  })

  ipcMain.handle('sync:getDevice', () => apiService.sync.getDevice())
  ipcMain.handle('sync:getDiff', () => apiService.sync.getDiff())
  ipcMain.handle('sync:startSync', (_, deleteOrphans: string[]) => {
    apiService.sync.startSync(deleteOrphans)
  })
  ipcMain.handle('sync:eject', () => apiService.sync.eject())

  setupAudioService()
  setupAlarmService()
  deviceService.battery.onUpdate(status => mainWindow?.webContents.send('battery:update', status))
  new PowerGuard(deviceService.battery, alarmService).start()

  // Hardware integration: only active in production (Pi).
  // In dev the socket connections will silently retry and the sysfs/GPIO
  // paths will not exist — all failures are handled gracefully.
  hardwareService = new HardwareService(audioService, alarmService, event => {
    if (event === 'off') powerAction('shutdown')
    else mainWindow?.webContents.send('power:event', event)
  })
  hardwareService.start()

  setupIpcHandlers(mediaDir)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  hardwareService?.stop()
  alarmService?.stop()
  audioService?.destroy()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
