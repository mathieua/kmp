import { useEffect, useState } from 'react'
import { OnScreenKeyboard } from '../components/OnScreenKeyboard'

// ── First-boot (or Settings-reopened) hostname naming screen ────────────────
// Purely the technical system hostname for now — not shown anywhere in the
// UI beyond Settings, just used for the WiFi setup SSID / mDNS name / etc.
// `onCancel` is only passed when reopened from Settings; the first-boot
// trigger has no way to skip it, matching "keeps showing until named."

interface OnboardingProps {
  onDone: () => void
  onCancel?: () => void
}

export function Onboarding({ onDone, onCancel }: OnboardingProps) {
  const [currentHostname, setCurrentHostname] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dots, setDots] = useState('.')

  useEffect(() => {
    window.electronAPI.device.getHostname().then(setCurrentHostname).catch(() => {})
  }, [])

  useEffect(() => {
    const id = setInterval(() =>
      setDots(d => d.length >= 3 ? '.' : d + '.'), 700)
    return () => clearInterval(id)
  }, [])

  // Live validation as they type, debounced lightly by just re-checking on
  // every change — validateHostname is cheap (no I/O, pure string checks).
  useEffect(() => {
    if (!name) { setError(null); return }
    window.electronAPI.device.validateHostname(name).then(setError).catch(() => {})
  }, [name])

  async function save() {
    setSaving(true)
    try {
      await window.electronAPI.device.setHostname(name)
      onDone()
      // Device reboots itself shortly after (setHostname) — no further action needed.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename. Try again.')
      setSaving(false)
    }
  }

  if (saving) {
    return (
      <div className="wifi-setup">
        <h1 className="wifi-setup__title">Renaming{dots}</h1>
        <p className="wifi-setup__sub">The clock is rebooting</p>
      </div>
    )
  }

  return (
    <div className="wifi-setup">
      <h1 className="wifi-setup__title">Name This Clock</h1>
      <p className="wifi-setup__sub">Currently: {currentHostname || '…'}</p>

      <p className="wifi-setup__url" style={{ minHeight: '1.5em' }}>
        {name || ' '}
      </p>
      {error && <p className="wifi-setup__sub" style={{ color: '#ff7a8a' }}>{error}</p>}

      <OnScreenKeyboard mode="hostname" value={name} onChange={setName} onDone={save} />

      {onCancel && (
        <button className="wifi-setup__phone-toggle" onClick={onCancel}>Cancel</button>
      )}
    </div>
  )
}
