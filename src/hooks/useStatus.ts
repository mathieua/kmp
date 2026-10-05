import { useState, useEffect } from 'react'
import { WifiConnection, BatteryStatus } from '../types'

function usePolled<T>(fetcher: () => Promise<T>, initial: T, everyMs: number): T {
  const [value, setValue] = useState<T>(initial)
  useEffect(() => {
    let alive = true
    const tick = () => fetcher().then(v => { if (alive) setValue(v) }).catch(() => {})
    tick()
    const id = setInterval(tick, everyMs)
    return () => { alive = false; clearInterval(id) }
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  return value
}

export const useWifiConnection = (): WifiConnection =>
  usePolled(() => window.electronAPI.wifi.getConnection(), { connected: false, ssid: null, signal: 0 }, 10_000)

/** null = no battery on this unit. Fetched once, then pushed by the main process. */
export const useBattery = (): BatteryStatus | null => {
  const [value, setValue] = useState<BatteryStatus | null>(null)
  useEffect(() => {
    let alive = true
    const off = window.electronAPI.device.onBattery(s => { if (alive) setValue(s) })
    window.electronAPI.device.getBattery().then(s => { if (alive) setValue(s) }).catch(() => {})
    return () => { alive = false; off() }
  }, [])
  return value
}
