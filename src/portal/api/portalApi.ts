import type { MediaItem, ImportJob, YoutubePrefetch, UsbDevice, SyncDiff, UpdateStatus } from '../types/portal.types'

const BASE = '/api/portal'

function qs(params?: Record<string, string | undefined>): string {
  if (!params) return ''
  const entries = Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]
  return entries.length ? '?' + new URLSearchParams(entries).toString() : ''
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const portalApi = {
  // Media library
  getMedia: (params?: { category?: string; artist?: string }) =>
    fetch(`${BASE}/media${qs(params)}`).then(r => json<MediaItem[]>(r)),

  getMediaItem: (id: number) =>
    fetch(`${BASE}/media/${id}`).then(r => json<MediaItem>(r)),

  deleteMedia: (id: number) =>
    fetch(`${BASE}/media/${id}`, { method: 'DELETE' }),

  updateMedia: (id: number, patch: Partial<Pick<MediaItem, 'title' | 'artist' | 'category'>>) =>
    fetch(`${BASE}/media/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then(r => json<MediaItem>(r)),

  getCategories: () =>
    fetch(`${BASE}/categories`).then(r => json<{ category: string; count: number }[]>(r)),

  getArtists: (category?: string) =>
    fetch(`${BASE}/artists${qs({ category })}`).then(r => json<{ artist: string; count: number }[]>(r)),

  // YouTube import
  prefetch: (url: string) =>
    fetch(`${BASE}/youtube/prefetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }).then(r => json<YoutubePrefetch>(r)),

  startImport: (params: { url: string; title: string; artist: string; category: string }) =>
    fetch(`${BASE}/youtube/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }).then(r => json<{ jobId: number }>(r)),

  getJobs: () =>
    fetch(`${BASE}/youtube/jobs`).then(r => json<ImportJob[]>(r)),

  getJob: (id: number) =>
    fetch(`${BASE}/youtube/jobs/${id}`).then(r => json<ImportJob>(r)),

  // USB Sync
  getDevice: () =>
    fetch('/api/portal/sync/device').then(r => json<UsbDevice | null>(r)),

  getDiff: () =>
    fetch('/api/portal/sync/diff').then(r => json<SyncDiff>(r)),

  startSync: (body: { deleteOrphans: string[] }) =>
    fetch('/api/portal/sync/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => json<{ message: string }>(r)),

  eject: () =>
    fetch('/api/portal/sync/eject', { method: 'POST' }).then(r => json<{ message: string }>(r)),

  // Upload (XHR for progress — see useUpload hook)
  uploadXhr: (
    formData: FormData,
    onProgress: (percent: number) => void,
  ): Promise<MediaItem> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${BASE}/upload`)
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText) as MediaItem)
        } else {
          reject(new Error(xhr.responseText || `HTTP ${xhr.status}`))
        }
      }
      xhr.onerror = () => reject(new Error('Network error'))
      xhr.send(formData)
    }),

  // OTA updates (not under /portal: shared with the updater/health endpoints)
  getUpdateStatus: () =>
    fetch('/api/update-status').then(r => json<UpdateStatus>(r)),

  checkForUpdate: () =>
    fetch('/api/update/check', { method: 'POST' }).then(r => json<{ message: string }>(r)),

  applyUpdate: () =>
    fetch('/api/update/apply', { method: 'POST' }).then(r => json<{ message: string }>(r)),
}
