import { useState, useEffect, useCallback } from 'react'
import type { UpdateStatus } from '../types/portal.types'
import { portalApi } from '../api/portalApi'

function messageOf(err: unknown): string {
  const raw = (err as Error).message
  try { return JSON.parse(raw).error ?? raw } catch { return raw }
}

export function useUpdateStatus() {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setStatus(await portalApi.getUpdateStatus())
    } catch (err) {
      // The backend restarts during an update; keep showing the last status.
      setError(messageOf(err))
    }
  }, [])

  // Poll fast while the updater is working, slowly otherwise.
  const busy = pending || (status !== null && status.state !== 'idle')
  useEffect(() => {
    refresh()
    const id = setInterval(refresh, busy ? 2000 : 30000)
    return () => clearInterval(id)
  }, [refresh, busy])

  // The request is async (systemd starts the updater); clear `pending` once
  // the status reflects it or finishes.
  useEffect(() => {
    if (pending && status && status.state !== 'idle') setPending(false)
  }, [pending, status])

  const run = useCallback(async (call: () => Promise<unknown>) => {
    setError(null)
    setPending(true)
    try {
      await call()
      await refresh()
      // A check with nothing to do can finish before we ever see it running.
      setTimeout(() => setPending(false), 5000)
    } catch (err) {
      setError(messageOf(err))
      setPending(false)
    }
  }, [refresh])

  return {
    status,
    error,
    busy,
    check: () => run(portalApi.checkForUpdate),
    apply: () => run(portalApi.applyUpdate),
  }
}
