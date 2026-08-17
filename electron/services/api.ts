import express, { Request, Response, NextFunction } from 'express'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import multer from 'multer'
import * as path from 'path'
import * as fs from 'fs'
import * as fsPromises from 'fs/promises'
import { spawn, exec, ChildProcess } from 'child_process'
import { promisify } from 'util'
import { WifiService, buildSetupPageHtml } from './wifi'
import {
  initDatabase,
  getMediaItems,
  getMediaItem,
  insertMediaItem,
  updateMediaItem,
  deleteMediaItem,
  mediaItemExistsByPath,
  getCategories,
  getArtists,
  createImportJob,
  getImportJob,
  getImportJobs,
  updateImportJob,
  MediaItem,
} from './database'

const execAsync = promisify(exec)

const CATEGORIES = ['lullabies', 'music', 'audiobooks'] as const
type Category = typeof CATEGORIES[number]

// ---- WebSocket broadcast ----

let wss: WebSocketServer
let ipcBroadcast: ((event: string, payload: unknown) => void) | null = null

function broadcast(event: string, payload: unknown): void {
  const message = JSON.stringify({ event, ...payload as object })
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  }
  ipcBroadcast?.(event, payload)
}

// ---- Slugify helper ----

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ---- Media directory scan ----

async function scanMediaDir(mediaDir: string): Promise<void> {
  for (const category of CATEGORIES) {
    const catDir = path.join(mediaDir, category)
    if (!fs.existsSync(catDir)) continue

    const artists = await fsPromises.readdir(catDir)
    for (const artist of artists) {
      const artistDir = path.join(catDir, artist)
      const stat = await fsPromises.stat(artistDir)
      if (!stat.isDirectory()) continue

      const files = await fsPromises.readdir(artistDir)
      for (const file of files) {
        if (!file.endsWith('.mp3')) continue
        const filePath = path.join(artistDir, file)
        if (!mediaItemExistsByPath(filePath)) {
          const title = file.replace(/\.mp3$/, '').replace(/-/g, ' ')
          insertMediaItem({
            title,
            artist,
            category,
            duration_seconds: 0,
            file_path: filePath,
            thumbnail_url: null,
            source_url: null,
          })
        }
      }
    }
  }
}

// ---- yt-dlp queue ----

let activeYtdlpProcess: ChildProcess | null = null
const ytdlpQueue: (() => void)[] = []

function runNextYtdlp(): void {
  if (activeYtdlpProcess || ytdlpQueue.length === 0) return
  const next = ytdlpQueue.shift()!
  next()
}

// ---- USB Sync state ----

interface UsbDevice {
  mountPath: string
  label: string
  totalBytes: number
  freeBytes: number
}

interface DiffEntry {
  relativePath: string
  sizeBytes: number
}

interface SyncDiff {
  toCopy: DiffEntry[]
  toSkip: { relativePath: string }[]
  orphans: DiffEntry[]
}

interface SyncProgress {
  copied: number
  total: number
  currentFile: string
  bytesPerSecond: number
}

interface SyncSummary {
  copied: number
  skipped: number
  deleted: number
  durationSeconds: number
}

interface SyncJob {
  status: 'syncing' | 'complete' | 'error'
  progress: SyncProgress | null
  summary: SyncSummary | null
  error: string | null
}

let currentUsbDevice: UsbDevice | null = null
let lastDetectedMountPath: string | null = null
let activeSyncJob: SyncJob | null = null
let usbPollInterval: NodeJS.Timeout | null = null

// ---- API service factory ----

export function createApiService(
  mediaDir: string,
  dataDir: string,
  wifiService?: WifiService,
  onWifiConnected?: () => void,
) {
  const thumbnailDir = path.join(mediaDir, '.thumbnails')
  fs.mkdirSync(thumbnailDir, { recursive: true })

  initDatabase(dataDir)
  scanMediaDir(mediaDir).catch(console.error)

  const app = express()
  app.use(express.json())

  // Serve portal static files
  const portalDist = path.join(__dirname, '../../portal')
  app.use('/portal', express.static(portalDist, { index: 'portal.html' }))
  app.get('/portal/*splat', (_req, res) => {
    res.sendFile(path.join(portalDist, 'portal.html'))
  })

  // Serve media files and thumbnails (.thumbnails dir needs dotfiles allowed)
  app.use('/media', express.static(mediaDir, { dotfiles: 'allow' }))

  const httpServer = createServer(app)
  wss = new WebSocketServer({ server: httpServer })

  wss.on('connection', (ws) => {
    ws.on('error', console.error)
  })

  // Start USB polling
  usbPollInterval = setInterval(async () => {
    try {
      const device = await detectUsbDevice()
      const mountPath = device?.mountPath ?? null

      if (mountPath !== lastDetectedMountPath) {
        if (mountPath && !lastDetectedMountPath) {
          currentUsbDevice = device!
          broadcast('usb_connected', { ...device })
        } else if (!mountPath && lastDetectedMountPath) {
          const prevPath = lastDetectedMountPath
          currentUsbDevice = null
          activeSyncJob = null
          broadcast('usb_disconnected', { mountPath: prevPath })
        } else {
          // Different device mounted
          const prevPath = lastDetectedMountPath
          currentUsbDevice = device!
          broadcast('usb_disconnected', { mountPath: prevPath })
          broadcast('usb_connected', { ...device })
        }
        lastDetectedMountPath = mountPath
      } else if (device) {
        currentUsbDevice = device // refresh free space
      }
    } catch {
      // ignore polling errors
    }
  }, 3000)

  // ---- Media Library endpoints ----

  app.get('/api/portal/media', (req: Request, res: Response) => {
    const { category, artist } = req.query as { category?: string; artist?: string }
    const items = getMediaItems({ category, artist })
    res.json(items)
  })

  app.get('/api/portal/media/:id', (req: Request, res: Response) => {
    const item = getMediaItem(Number(req.params.id))
    if (!item) return res.status(404).json({ error: 'Not found' })
    res.json(item)
  })

  app.delete('/api/portal/media/:id', async (req: Request, res: Response) => {
    const item = getMediaItem(Number(req.params.id))
    if (!item) return res.status(404).json({ error: 'Not found' })
    try {
      await fsPromises.unlink(item.file_path)
    } catch {
      // File may already be gone; proceed with DB deletion
    }
    deleteMediaItem(item.id)
    res.status(204).send()
  })

  app.patch('/api/portal/media/:id', async (req: Request, res: Response) => {
    const item = getMediaItem(Number(req.params.id))
    if (!item) return res.status(404).json({ error: 'Not found' })

    const { title, artist, category } = req.body as Partial<MediaItem>
    const patch: Partial<Pick<MediaItem, 'title' | 'artist' | 'category'>> = {}
    if (title) patch.title = title
    if (artist) patch.artist = artist
    if (category && CATEGORIES.includes(category)) patch.category = category

    const updated = updateMediaItem(item.id, patch)
    res.json(updated)
  })

  app.get('/api/portal/categories', (_req: Request, res: Response) => {
    res.json(getCategories())
  })

  app.get('/api/portal/artists', (req: Request, res: Response) => {
    const { category } = req.query as { category?: string }
    res.json(getArtists(category))
  })

  // ---- YouTube import endpoints ----

  app.post('/api/portal/youtube/prefetch', async (req: Request, res: Response) => {
    const { url } = req.body as { url: string }
    if (!url) return res.status(400).json({ error: 'url is required' })

    try {
      const data = await ytdlpDumpJson(url)
      const videoId = data.id as string
      const thumbnailUrl = await cacheThumbnail(data.thumbnail as string, videoId, thumbnailDir)

      res.json({
        title: data.title as string,
        artist: data.uploader as string,
        durationSeconds: data.duration as number,
        thumbnailUrl: thumbnailUrl ? `/media/.thumbnails/${videoId}.jpg` : null,
      })
    } catch (err: unknown) {
      res.status(422).json({ error: (err as Error).message })
    }
  })

  app.post('/api/portal/youtube/import', async (req: Request, res: Response) => {
    const { url, title, artist, category } = req.body as {
      url: string; title: string; artist: string; category: Category
    }
    if (!url || !title || !artist || !category) {
      return res.status(400).json({ error: 'url, title, artist, category are required' })
    }
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' })
    }

    const job = createImportJob(url)
    res.status(202).json({ jobId: job.id })

    ytdlpQueue.push(() => runYtdlpJob(job.id, url, title, artist, category, mediaDir, thumbnailDir))
    runNextYtdlp()
  })

  app.get('/api/portal/youtube/jobs', (_req: Request, res: Response) => {
    res.json(getImportJobs())
  })

  app.get('/api/portal/youtube/jobs/:id', (req: Request, res: Response) => {
    const job = getImportJob(Number(req.params.id))
    if (!job) return res.status(404).json({ error: 'Not found' })
    res.json(job)
  })

  // ---- Upload endpoint ----

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dataDir),
    filename: (_req, file, cb) => cb(null, `upload-${Date.now()}-${file.originalname}`),
  })
  const upload = multer({ storage, fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === 'audio/mpeg' || file.originalname.endsWith('.mp3'))
  }})

  app.post('/api/portal/upload', upload.single('file'), async (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const { title, artist, category } = req.body as { title: string; artist: string; category: Category }
    if (!title || !artist || !category) {
      await fsPromises.unlink(req.file.path)
      return res.status(400).json({ error: 'title, artist, category are required' })
    }
    if (!CATEGORIES.includes(category)) {
      await fsPromises.unlink(req.file.path)
      return res.status(400).json({ error: 'Invalid category' })
    }

    const destDir = path.join(mediaDir, category, artist)
    await fsPromises.mkdir(destDir, { recursive: true })
    const filename = `${slugify(title)}.mp3`
    const destPath = path.join(destDir, filename)
    await fsPromises.rename(req.file.path, destPath)

    const item = insertMediaItem({
      title,
      artist,
      category,
      duration_seconds: 0,
      file_path: destPath,
      thumbnail_url: null,
      source_url: null,
    })
    res.status(201).json(item)
  })

  // ---- USB Sync endpoints ----

  app.get('/api/portal/sync/device', (_req: Request, res: Response) => {
    res.json(currentUsbDevice)
  })

  app.get('/api/portal/sync/diff', async (_req: Request, res: Response) => {
    if (!currentUsbDevice) {
      return res.status(404).json({ error: 'No USB device detected' })
    }
    try {
      const diff = await computeDiff(mediaDir, currentUsbDevice.mountPath)
      res.json(diff)
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  app.post('/api/portal/sync/start', async (req: Request, res: Response) => {
    if (!currentUsbDevice) {
      return res.status(404).json({ error: 'No USB device detected' })
    }
    if (activeSyncJob?.status === 'syncing') {
      return res.status(409).json({ error: 'Sync already in progress' })
    }

    const { deleteOrphans = [] } = req.body as { deleteOrphans?: string[] }
    const device = currentUsbDevice

    activeSyncJob = { status: 'syncing', progress: null, summary: null, error: null }
    res.status(202).json({ message: 'Sync started' })

    computeDiff(mediaDir, device.mountPath)
      .then(diff => runSyncJob(diff, deleteOrphans, mediaDir, device.mountPath))
      .catch(err => {
        if (activeSyncJob) {
          activeSyncJob.status = 'error'
          activeSyncJob.error = (err as Error).message
          broadcast('sync_error', { error: (err as Error).message })
        }
      })
  })

  app.get('/api/portal/sync/status', (_req: Request, res: Response) => {
    res.json(activeSyncJob)
  })

  app.post('/api/portal/sync/eject', async (_req: Request, res: Response) => {
    if (!currentUsbDevice) {
      return res.status(404).json({ error: 'No USB device detected' })
    }
    const { mountPath } = currentUsbDevice
    try {
      if (process.platform === 'darwin') {
        await execAsync(`diskutil eject "${mountPath}"`)
      } else {
        await execAsync(`sudo umount "${mountPath}"`)
      }
      currentUsbDevice = null
      lastDetectedMountPath = null
      broadcast('usb_disconnected', { mountPath })
      res.json({ message: 'Ejected' })
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // ---- WiFi provisioning (only meaningful when Pi is in AP mode) ----

  // Phone browser lands here after joining this device's <hostname>-setup hotspot
  app.get('/setup', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(buildSetupPageHtml())
  })

  // Redirect bare root to /setup when in AP mode so typing the IP is enough
  app.get('/', (_req: Request, res: Response) => {
    if (wifiService?.isApMode()) {
      return res.redirect('/setup')
    }
    res.redirect('/portal')
  })

  app.get('/api/wifi/networks', async (_req: Request, res: Response) => {
    if (!wifiService) return res.status(503).json({ error: 'WiFi service unavailable' })
    try {
      const networks = await wifiService.scanNetworks()
      res.json(networks)
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  app.post('/api/wifi/connect', async (req: Request, res: Response) => {
    if (!wifiService) return res.status(503).json({ error: 'WiFi service unavailable' })
    const { ssid, password = '' } = req.body as { ssid?: string; password?: string }
    if (!ssid) return res.status(400).json({ error: 'ssid is required' })

    try {
      await wifiService.connect(ssid, password)
    } catch (err: unknown) {
      return res.status(422).json({ error: (err as Error).message || 'Connection failed' })
    }

    // Connection succeeded — respond to phone, then clean up + reboot
    res.json({ message: 'Connected. Rebooting…' })

    setTimeout(async () => {
      try {
        await wifiService.teardownHotspot()
        onWifiConnected?.()
        await wifiService.reboot()
      } catch (err) {
        console.error('[WiFi] post-connect teardown error:', err)
      }
    }, 1500)
  })

  // ---- Start server ----

  return {
    start(port: number): void {
      httpServer.listen(port, () => {
        console.log(`[API] Portal server listening on port ${port}`)
      })
    },
    stop(): void {
      if (usbPollInterval) {
        clearInterval(usbPollInterval)
        usbPollInterval = null
      }
      httpServer.close()
    },
    sync: {
      getDevice: () => currentUsbDevice,
      getDiff: (): Promise<SyncDiff> => {
        if (!currentUsbDevice) return Promise.reject(new Error('No device'))
        return computeDiff(mediaDir, currentUsbDevice.mountPath)
      },
      startSync: (deleteOrphans: string[]) => {
        if (!currentUsbDevice) throw new Error('No device')
        if (activeSyncJob?.status === 'syncing') throw new Error('Already syncing')
        const device = currentUsbDevice
        activeSyncJob = { status: 'syncing', progress: null, summary: null, error: null }
        computeDiff(mediaDir, device.mountPath)
          .then(diff => runSyncJob(diff, deleteOrphans, mediaDir, device.mountPath))
          .catch(err => {
            if (activeSyncJob) {
              activeSyncJob.status = 'error'
              activeSyncJob.error = (err as Error).message
              broadcast('sync_error', { error: (err as Error).message })
            }
          })
      },
      eject: async () => {
        if (!currentUsbDevice) throw new Error('No device')
        const { mountPath } = currentUsbDevice
        if (process.platform === 'darwin') {
          await execAsync(`diskutil eject "${mountPath}"`)
        } else {
          await execAsync(`sudo umount "${mountPath}"`)
        }
        currentUsbDevice = null
        lastDetectedMountPath = null
        broadcast('usb_disconnected', { mountPath })
      },
      onEvent: (cb: (event: string, payload: unknown) => void) => {
        ipcBroadcast = cb
      },
    },
  }
}

// ---- yt-dlp helpers ----

async function ytdlpDumpJson(url: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    const proc = spawn('yt-dlp', ['--dump-json', '--no-playlist', '--js-runtimes', 'node', url])
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr || 'yt-dlp failed'))
      try { resolve(JSON.parse(stdout)) } catch { reject(new Error('Failed to parse yt-dlp output')) }
    })
  })
}

async function cacheThumbnail(thumbnailUrl: string, videoId: string, thumbnailDir: string): Promise<boolean> {
  if (!thumbnailUrl) return false
  const destPath = path.join(thumbnailDir, `${videoId}.jpg`)
  if (fs.existsSync(destPath)) return true

  try {
    const { net } = await import('electron')
    const response = await net.fetch(thumbnailUrl)
    if (!response.ok) return false
    const buffer = Buffer.from(await response.arrayBuffer())
    await fsPromises.writeFile(destPath, buffer)
    return true
  } catch {
    return false
  }
}

function runYtdlpJob(
  jobId: number,
  url: string,
  title: string,
  artist: string,
  category: Category,
  mediaDir: string,
  thumbnailDir: string
): void {
  updateImportJob(jobId, { status: 'downloading', progress_percent: 0 })
  broadcast('download_progress', { jobId, percent: 0, status: 'downloading' })

  const tmpOutput = `/tmp/alarm-ytdlp-${jobId}.%(ext)s`
  const proc = spawn('yt-dlp', [
    '-x', '--audio-format', 'mp3', '--audio-quality', '128K',
    '--add-metadata',
    '--no-playlist',
    '--js-runtimes', 'node',
    '--progress', '--newline',
    '-o', tmpOutput,
    url,
  ])

  activeYtdlpProcess = proc

  const progressRe = /\[download\]\s+([\d.]+)%/
  let stdoutBuf = ''

  proc.stdout.on('data', (d: Buffer) => {
    stdoutBuf += d.toString()
    const lines = stdoutBuf.split('\n')
    stdoutBuf = lines.pop()!
    for (const line of lines) {
      const match = progressRe.exec(line)
      if (match) {
        const percent = Math.round(parseFloat(match[1]))
        updateImportJob(jobId, { progress_percent: percent })
        broadcast('download_progress', { jobId, percent, status: 'downloading' })
      }
      if (line.includes('[ffmpeg]') || line.includes('Destination')) {
        updateImportJob(jobId, { status: 'converting' })
        broadcast('download_progress', { jobId, percent: 99, status: 'converting' })
      }
      console.log('[yt-dlp stdout]', line)
    }
  })

  proc.stderr.on('data', (d: Buffer) => {
    console.error('[yt-dlp]', d.toString())
  })

  proc.on('close', async (code) => {
    activeYtdlpProcess = null
    runNextYtdlp()
    console.log(`[yt-dlp] job ${jobId} exited with code ${code}`)

    if (code !== 0) {
      updateImportJob(jobId, { status: 'error', error_message: 'yt-dlp exited with code ' + code })
      broadcast('download_error', { jobId, error: 'Download failed' })
      return
    }

    try {
      const tmpFile = `/tmp/alarm-ytdlp-${jobId}.mp3`
      const destDir = path.join(mediaDir, category, artist)
      await fsPromises.mkdir(destDir, { recursive: true })
      const filename = `${slugify(title)}.mp3`
      const destPath = path.join(destDir, filename)
      console.log(`[yt-dlp] moving ${tmpFile} → ${destPath}`)
      try {
        await fsPromises.rename(tmpFile, destPath)
      } catch (renameErr: unknown) {
        // rename fails cross-device; fall back to copy + unlink
        if ((renameErr as NodeJS.ErrnoException).code === 'EXDEV') {
          await fsPromises.copyFile(tmpFile, destPath)
          await fsPromises.unlink(tmpFile)
        } else {
          throw renameErr
        }
      }

      // Check if thumbnail was cached during prefetch
      const videoIdMatch = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
      const videoId = videoIdMatch?.[1]
      const thumbnailFile = videoId ? path.join(thumbnailDir, `${videoId}.jpg`) : null
      const thumbnailUrl = thumbnailFile && fs.existsSync(thumbnailFile)
        ? `/media/.thumbnails/${videoId}.jpg`
        : null

      const mediaItem = insertMediaItem({
        title,
        artist,
        category,
        duration_seconds: 0,
        file_path: destPath,
        thumbnail_url: thumbnailUrl,
        source_url: url,
      })

      updateImportJob(jobId, { status: 'complete', progress_percent: 100, media_item_id: mediaItem.id })
      broadcast('download_complete', { jobId, mediaItem })
    } catch (err: unknown) {
      console.error('[yt-dlp] post-process error:', err)
      updateImportJob(jobId, { status: 'error', error_message: (err as Error).message })
      broadcast('download_error', { jobId, error: (err as Error).message })
    }
  })
}

// ---- USB Sync helpers ----

interface LsblkDevice {
  name: string
  mountpoint: string | null
  rm: boolean
  size: string
  label: string | null
  children?: LsblkDevice[]
}

// Find the first non-empty partition of a removable disk (mounted or not)
function findRemovablePartition(devices: LsblkDevice[]): LsblkDevice | null {
  for (const dev of devices) {
    if (!dev.rm) continue
    if (dev.children) {
      // Removable disk — find first partition with non-zero size
      for (const child of dev.children) {
        if (child.size && child.size !== '0B') return child
      }
    } else if (dev.size && dev.size !== '0B' && dev.mountpoint) {
      // Removable device with no partition table (already mounted)
      return dev
    }
  }
  return null
}

const LINUX_MOUNT_DIR = '/media/alarm-clock'

async function detectUsbDevice(): Promise<UsbDevice | null> {
  if (process.platform === 'linux') {
    return detectLinuxUsb()
  } else if (process.platform === 'darwin') {
    return detectMacUsb()
  }
  return null
}

async function detectLinuxUsb(): Promise<UsbDevice | null> {
  try {
    const { stdout } = await execAsync('lsblk -J -o NAME,MOUNTPOINT,RM,SIZE,LABEL')
    const data = JSON.parse(stdout) as { blockdevices: LsblkDevice[] }
    const dev = findRemovablePartition(data.blockdevices || [])
    if (!dev) return null

    let mountPath = dev.mountpoint
    if (!mountPath) {
      // Not mounted — mount it with the current user's uid/gid so writes work
      const uid = process.getuid?.() ?? 1000
      const gid = process.getgid?.() ?? 1000
      await execAsync(`sudo mkdir -p "${LINUX_MOUNT_DIR}"`)
      try {
        // FAT32/exFAT support uid/gid mount options (covers all MP3 players)
        await execAsync(`sudo mount /dev/${dev.name} "${LINUX_MOUNT_DIR}" -o uid=${uid},gid=${gid},umask=022`)
      } catch {
        // ext4 / other: plain mount then fix ownership
        await execAsync(`sudo mount /dev/${dev.name} "${LINUX_MOUNT_DIR}"`)
        await execAsync(`sudo chown -R ${uid}:${gid} "${LINUX_MOUNT_DIR}"`)
      }
      mountPath = LINUX_MOUNT_DIR
    }

    const { stdout: dfOut } = await execAsync(`df -Pk "${mountPath}"`)
    const parts = dfOut.trim().split('\n')[1].trim().split(/\s+/)
    return {
      mountPath,
      label: dev.label || path.basename(mountPath),
      totalBytes: parseInt(parts[1]) * 1024,
      freeBytes: parseInt(parts[3]) * 1024,
    }
  } catch {
    return null
  }
}

async function detectMacUsb(): Promise<UsbDevice | null> {
  const SYSTEM_VOLUMES = new Set([
    'macintosh hd', 'macintosh hd - data', 'data',
    'preboot', 'recovery', 'vm', 'time machine backups', 'efi',
  ])
  try {
    const volumes = await fsPromises.readdir('/Volumes')
    for (const label of volumes) {
      if (label.startsWith('.')) continue
      if (SYSTEM_VOLUMES.has(label.toLowerCase())) continue

      const mountPath = `/Volumes/${label}`
      try {
        const { stdout } = await execAsync(`df -Pk "${mountPath}"`)
        const parts = stdout.trim().split('\n')[1].trim().split(/\s+/)
        const totalBytes = parseInt(parts[1]) * 1024
        const freeBytes = parseInt(parts[3]) * 1024
        if (isNaN(totalBytes) || isNaN(freeBytes)) continue
        return { mountPath, label, totalBytes, freeBytes }
      } catch { continue }
    }
  } catch {}
  return null
}

async function walkMp3Files(baseDir: string, dir: string, result: Map<string, number>): Promise<void> {
  let entries: fs.Dirent[]
  try {
    entries = await fsPromises.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walkMp3Files(baseDir, fullPath, result)
    } else if (entry.name.toLowerCase().endsWith('.mp3')) {
      const stat = await fsPromises.stat(fullPath)
      result.set(path.relative(baseDir, fullPath), stat.size)
    }
  }
}

async function computeDiff(mediaDir: string, mountPath: string): Promise<SyncDiff> {
  const libraryFiles = new Map<string, number>()
  const deviceFiles = new Map<string, number>()

  await walkMp3Files(mediaDir, mediaDir, libraryFiles)
  await walkMp3Files(mountPath, mountPath, deviceFiles)

  const toCopy: DiffEntry[] = []
  const toSkip: { relativePath: string }[] = []
  const orphans: DiffEntry[] = []

  for (const [rel, size] of libraryFiles) {
    const devSize = deviceFiles.get(rel)
    if (devSize === undefined || devSize !== size) {
      toCopy.push({ relativePath: rel, sizeBytes: size })
    } else {
      toSkip.push({ relativePath: rel })
    }
  }

  for (const [rel, size] of deviceFiles) {
    if (!libraryFiles.has(rel)) {
      orphans.push({ relativePath: rel, sizeBytes: size })
    }
  }

  return { toCopy, toSkip, orphans }
}

async function runSyncJob(
  diff: SyncDiff,
  deleteOrphans: string[],
  mediaDir: string,
  mountPath: string
): Promise<void> {
  if (!activeSyncJob) return

  const { toCopy, toSkip } = diff
  const total = toCopy.length
  let copied = 0
  let deleted = 0
  let totalBytesCopied = 0
  const startTime = Date.now()

  // Delete selected orphans
  for (const rel of deleteOrphans) {
    try {
      await fsPromises.unlink(path.join(mountPath, rel))
      deleted++
    } catch { /* ignore */ }
  }

  // Copy files
  for (const { relativePath, sizeBytes } of toCopy) {
    if (!activeSyncJob || activeSyncJob.status !== 'syncing') break

    const srcPath = path.join(mediaDir, relativePath)
    const destPath = path.join(mountPath, relativePath)

    try {
      await fsPromises.mkdir(path.dirname(destPath), { recursive: true })
      await fsPromises.copyFile(srcPath, destPath)
      copied++
      totalBytesCopied += sizeBytes

      const elapsedSec = (Date.now() - startTime) / 1000
      const bytesPerSecond = elapsedSec > 0 ? Math.round(totalBytesCopied / elapsedSec) : 0

      const progress: SyncProgress = { copied, total, currentFile: relativePath, bytesPerSecond }
      activeSyncJob.progress = progress
      broadcast('sync_progress', progress)
    } catch (err: unknown) {
      if (activeSyncJob) {
        activeSyncJob.status = 'error'
        activeSyncJob.error = (err as Error).message
        broadcast('sync_error', { error: (err as Error).message })
      }
      return
    }
  }

  const durationSeconds = Math.round((Date.now() - startTime) / 1000)
  const summary: SyncSummary = { copied, skipped: toSkip.length, deleted, durationSeconds }
  if (activeSyncJob) {
    activeSyncJob.status = 'complete'
    activeSyncJob.summary = summary
    broadcast('sync_complete', summary)
  }
}
