import { app, BrowserWindow, ipcMain, protocol, net, screen } from 'electron'
import path from 'path'
import { AudioService, Track } from './services/audio'
import { AlarmService } from './services/alarm'
import { HardwareService } from './services/hardware'
import { createApiService } from './services/api'
import { WifiService } from './services/wifi'
import { getMediaItems } from './services/database'
import fs from 'fs'

const isDev = process.env.NODE_ENV !== 'production'
const isKiosk = !isDev && process.platform === 'linux'

let mainWindow: BrowserWindow | null = null
let audioService: AudioService
let alarmService: AlarmService
let wifiService: WifiService
let hardwareService: HardwareService

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
  const mediaDir = isKiosk
    ? path.join(app.getPath('home'), 'alarm-clock/media')
    : path.join(__dirname, '../../media')

  audioService = new AudioService(mediaDir)

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

  alarmService.on('fired', async () => {
    const tracks = await audioService.scanMedia()
    if (tracks.length > 0) {
      const alarm = alarmService.getAlarm()
      const track = alarm?.sound_path
        ? (tracks.find(t => t.filepath === alarm.sound_path) ?? tracks[Math.floor(Math.random() * tracks.length)])
        : tracks[Math.floor(Math.random() * tracks.length)]
      await audioService.setVolume(0)
      await audioService.play(track)

      // Ramp volume from 0 to 70 over 30s (10 steps × 3s)
      let step = 0
      const targetVolume = 70
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
    mainWindow?.webContents.send('alarm:dismissed')
  })

  alarmService.on('snoozed', async () => {
    clearAlarmTimers()
    await audioService.stop()
    mainWindow?.webContents.send('alarm:dismissed')
  })

  alarmService.start()
}

function setupIpcHandlers(mediaDir: string) {
  ipcMain.handle('audio:getState', () => {
    return audioService.getState()
  })

  ipcMain.handle('audio:scanMedia', async () => {
    const tracks = await audioService.scanMedia()
    const dbItems = getMediaItems()
    const dbByPath = new Map(dbItems.map(item => [item.file_path, item]))
    return tracks.map(track => {
      const dbItem = dbByPath.get(track.filepath)
      if (!dbItem) return track
      const artwork = dbItem.thumbnail_url
        ? path.join(mediaDir, dbItem.thumbnail_url.replace(/^\/media\//, ''))
        : track.artwork
      return { ...track, title: dbItem.title, artwork }
    })
  })

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
  ipcMain.handle('alarm:snooze', () => alarmService.snooze())
  ipcMain.handle('alarm:dismiss', () => alarmService.dismiss())
}

app.whenReady().then(() => {
  // Register protocol for serving local media files
  protocol.handle('media', (request) => {
    const filePath = decodeURIComponent(request.url.replace('media://', ''))
    return net.fetch('file://' + filePath)
  })

  const mediaDir = isKiosk
    ? path.join(app.getPath('home'), 'alarm-clock/media')
    : path.join(__dirname, '../../media')
  const dataDir = isKiosk
    ? path.join(app.getPath('home'), 'alarm-clock/data')
    : path.join(__dirname, '../../data')
  fs.mkdirSync(dataDir, { recursive: true })

  wifiService = new WifiService()

  const apiService = createApiService(mediaDir, dataDir, wifiService, () => {
    // Called by Express after successful WiFi connect — notify the renderer
    mainWindow?.webContents.send('wifi:connected')
  })
  apiService.start(3000)

  // WiFi IPC handlers
  ipcMain.handle('wifi:getStatus', () => wifiService.getStatus())

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

  // Hardware integration: only active in production (Pi).
  // In dev the socket connections will silently retry and the sysfs/GPIO
  // paths will not exist — all failures are handled gracefully.
  hardwareService = new HardwareService(audioService, alarmService)
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
