import { useEffect, useState } from 'react'

// ── Displayed on the physical 7" screen when the Pi is in AP / setup mode ────
// The parent joins this device's own "<hostname>-setup" hotspot on their
// phone and visits the URL shown here. Everything happens in the phone
// browser — this screen is just a clear set of instructions. The SSID is
// read from the main process rather than hardcoded, since it's derived
// from whatever this device is currently named.

export function WifiSetup() {
  const [hotspotIp, setHotspotIp]     = useState<string>('10.42.0.1')
  const [hotspotSsid, setHotspotSsid] = useState<string>('this device’s setup network')
  const [hostname, setHostname]       = useState<string | null>(null)
  const [dots, setDots]               = useState('.')

  useEffect(() => {
    window.electronAPI.wifi.getStatus().then(s => {
      if (s.hotspotIp) setHotspotIp(s.hotspotIp)
      if (s.hotspotSsid) setHotspotSsid(s.hotspotSsid)
      if (s.hostname) setHostname(s.hostname)
    }).catch(() => {})
  }, [])

  // Animated ellipsis to indicate the clock is waiting
  useEffect(() => {
    const id = setInterval(() =>
      setDots(d => d.length >= 3 ? '.' : d + '.'), 700)
    return () => clearInterval(id)
  }, [])

  // The hostname-based URL is friendlier and works fine on the hotspot's
  // own network (avahi has no interface restrictions), but mDNS support on
  // phone browsers isn't universal — the raw IP is the guaranteed fallback.
  const friendlyUrl = hostname ? `http://${hostname}.local:3000/setup` : null
  const ipUrl = `http://${hotspotIp}:3000/setup`

  return (
    <div className="wifi-setup">
      <div className="wifi-setup__icon">📡</div>
      <h1 className="wifi-setup__title">WiFi Setup Needed</h1>
      <p className="wifi-setup__sub">Waiting for connection{dots}</p>

      <div className="wifi-setup__steps">
        <div className="wifi-setup__step">
          <span className="wifi-setup__num">1</span>
          <span>
            On your phone, join the WiFi network{' '}
            <strong className="wifi-setup__ssid">{hotspotSsid}</strong>
          </span>
        </div>
        <div className="wifi-setup__step">
          <span className="wifi-setup__num">2</span>
          <span>
            Open your browser and go to{' '}
            <strong className="wifi-setup__url">{friendlyUrl ?? ipUrl}</strong>
            {friendlyUrl && (
              <>
                {' '}<span className="wifi-setup__url-fallback">
                  (or {ipUrl} if that doesn’t load)
                </span>
              </>
            )}
          </span>
        </div>
        <div className="wifi-setup__step">
          <span className="wifi-setup__num">3</span>
          <span>Choose your home WiFi and enter the password</span>
        </div>
      </div>
    </div>
  )
}
