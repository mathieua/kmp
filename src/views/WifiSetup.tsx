import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { OnScreenKeyboard } from '../components/OnScreenKeyboard'
import type { WifiNetwork } from '../types'

// ── Displayed on the physical 7" screen when the Pi is in AP / setup mode ────
// Primary path is entirely on-device: pick a network from a scanned list,
// type the password on the on-screen keyboard, connect. A QR code (and the
// phone/browser URL as text fallback) is offered as an alternative for
// parents who'd rather type on their phone.

type Step = 'list' | 'password' | 'connecting' | 'error'

export function WifiSetup() {
  const [hotspotIp, setHotspotIp]     = useState<string>('10.42.0.1')
  const [hotspotSsid, setHotspotSsid] = useState<string>('this device’s setup network')
  const [hostname, setHostname]       = useState<string | null>(null)
  const [dots, setDots]               = useState('.')

  const [step, setStep] = useState<Step>('list')
  const [networks, setNetworks] = useState<WifiNetwork[]>([])
  const [scanning, setScanning] = useState(true)
  const [selected, setSelected] = useState<WifiNetwork | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showPhoneOption, setShowPhoneOption] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.wifi.getStatus().then(s => {
      if (s.hotspotIp) setHotspotIp(s.hotspotIp)
      if (s.hotspotSsid) setHotspotSsid(s.hotspotSsid)
      if (s.hostname) setHostname(s.hostname)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    loadNetworks()
  }, [])

  // QR encodes this device's own OPEN setup hotspot (not the home network
  // being configured) so a phone camera can join it without typing the SSID.
  useEffect(() => {
    QRCode.toDataURL(`WIFI:T:nopass;S:${hotspotSsid};;`, { margin: 1, width: 220 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null))
  }, [hotspotSsid])

  // Animated ellipsis while scanning/connecting
  useEffect(() => {
    const id = setInterval(() =>
      setDots(d => d.length >= 3 ? '.' : d + '.'), 700)
    return () => clearInterval(id)
  }, [])

  async function loadNetworks() {
    setScanning(true)
    try {
      const nets = await window.electronAPI.wifi.scanNetworks()
      setNetworks(nets)
    } catch {
      setNetworks([])
    } finally {
      setScanning(false)
    }
  }

  function pick(net: WifiNetwork) {
    setSelected(net)
    setPassword('')
    setError(null)
    setStep(net.security === 'Open' ? 'connecting' : 'password')
    if (net.security === 'Open') void doConnect(net, '')
  }

  async function doConnect(net: WifiNetwork, pwd: string) {
    setStep('connecting')
    try {
      await window.electronAPI.wifi.connect(net.ssid, pwd)
      // Success — device reboots itself shortly after (connectAndFinalize).
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed. Check the password and try again.')
      setStep('error')
    }
  }

  const friendlyUrl = hostname ? `http://${hostname}.local:3000/setup` : null
  const ipUrl = `http://${hotspotIp}:3000/setup`

  return (
    <div className="wifi-setup">
      {step !== 'password' && <div className="wifi-setup__icon">📡</div>}
      <h1 className="wifi-setup__title">WiFi Setup Needed</h1>

      {step === 'list' && (
        <>
          <p className="wifi-setup__sub">Choose your home WiFi</p>
          <div className="wifi-setup__steps" style={{ maxHeight: '40vh', overflowY: 'auto' }}>
            {scanning && networks.length === 0 && (
              <div className="wifi-setup__step"><span>Scanning{dots}</span></div>
            )}
            {!scanning && networks.length === 0 && (
              <div className="wifi-setup__step">
                <span>No networks found.</span>
              </div>
            )}
            {networks.map(net => (
              <div key={net.ssid} className="wifi-setup__step" onClick={() => pick(net)} style={{ cursor: 'pointer' }}>
                <span className="wifi-setup__num">{net.security === 'Open' ? '📶' : '🔒'}</span>
                <span>{net.ssid}{net.inUse ? ' (connected)' : ''}</span>
              </div>
            ))}
          </div>

          <button
            className="wifi-setup__phone-toggle"
            onClick={() => setShowPhoneOption(v => !v)}
          >
            {showPhoneOption ? 'Hide phone option' : 'Or set up from your phone instead'}
          </button>

          {showPhoneOption && (
            <div className="wifi-setup__phone-panel">
              {qrDataUrl && <img src={qrDataUrl} alt="Scan to join setup WiFi" className="wifi-setup__qr" />}
              <p className="wifi-setup__sub" style={{ marginTop: 'var(--gap-sm)' }}>
                Scan to join <strong className="wifi-setup__ssid">{hotspotSsid}</strong>, then visit{' '}
                <strong className="wifi-setup__url">{friendlyUrl ?? ipUrl}</strong>
              </p>
            </div>
          )}
        </>
      )}

      {step === 'password' && selected && (
        <>
          <p className="wifi-setup__sub">
            Enter password for <strong className="wifi-setup__ssid">{selected.ssid}</strong>
          </p>
          <p className="wifi-setup__url" style={{ minHeight: '1.5em', letterSpacing: '0.1em' }}>
            {'•'.repeat(password.length) || ' '}
          </p>
          <OnScreenKeyboard
            mode="text"
            value={password}
            onChange={setPassword}
            onDone={() => doConnect(selected, password)}
          />
          <button className="wifi-setup__phone-toggle" onClick={() => setStep('list')}>
            ← Back to network list
          </button>
        </>
      )}

      {step === 'connecting' && (
        <p className="wifi-setup__sub">Connecting{dots}</p>
      )}

      {step === 'error' && (
        <>
          <p className="wifi-setup__sub" style={{ color: '#ff7a8a' }}>{error}</p>
          <button className="wifi-setup__phone-toggle" onClick={() => { setStep('list'); loadNetworks() }}>
            Try again
          </button>
        </>
      )}
    </div>
  )
}
