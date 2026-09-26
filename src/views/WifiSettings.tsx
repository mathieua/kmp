import { useState, useEffect, useCallback } from 'react'
import { Palette, Lang, Route, t } from '../App'
import { WifiNetwork } from '../types'
import { ScreenHeader } from '../components/ScreenHeader'
import { HeaderActions } from '../components/HeaderActions'
import { OnScreenKeyboard } from '../components/OnScreenKeyboard'
import { IconWifi, IconCheck } from '../components/Icons'
import { useWifiConnection } from '../hooks/useStatus'

interface WifiSettingsProps {
  palette: Palette
  lang: Lang
  onBack: () => void
  onNavigate: (r: Route) => void
}

type Step = 'list' | 'password' | 'connecting' | 'error'

const bars = (signal: number) => (signal >= 75 ? 4 : signal >= 50 ? 3 : signal >= 25 ? 2 : 1)

// Change the network from Settings. Unlike first-time setup this connects in
// place — no hotspot teardown and no reboot.
export function WifiSettings({ palette, lang, onBack, onNavigate }: WifiSettingsProps) {
  const current = useWifiConnection()
  const [step, setStep] = useState<Step>('list')
  const [networks, setNetworks] = useState<WifiNetwork[]>([])
  const [scanning, setScanning] = useState(true)
  const [selected, setSelected] = useState<WifiNetwork | null>(null)
  const [password, setPassword] = useState('')

  const scan = useCallback(async () => {
    setScanning(true)
    try { setNetworks(await window.electronAPI.wifi.scanNetworks()) }
    catch { setNetworks([]) }
    finally { setScanning(false) }
  }, [])

  useEffect(() => { scan() }, [scan])

  const connect = async (net: WifiNetwork, pwd: string) => {
    setStep('connecting')
    try {
      await window.electronAPI.wifi.switchNetwork(net.ssid, pwd)
      setStep('list')
      scan()
    } catch {
      setStep('error')
    }
  }

  const pick = (net: WifiNetwork) => {
    setSelected(net)
    setPassword('')
    if (net.security === 'Open') connect(net, '')
    else setStep('password')
  }

  const shell = (children: React.ReactNode) => (
    <div style={{
      width: '100%', height: '100%', background: palette.clock,
      display: 'flex', flexDirection: 'column', padding: 'var(--pad)', gap: 'var(--gap)', overflow: 'hidden',
    }}>{children}</div>
  )

  const centered = (children: React.ReactNode) => (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 'var(--gap)', textAlign: 'center', color: '#fff', fontSize: 'var(--fs-h2)', fontWeight: 800,
    }}>{children}</div>
  )

  const pill = (label: string, onClick: () => void) => (
    <button onClick={onClick} style={{
      padding: 'var(--gap-sm) var(--pad)', borderRadius: 999, border: 'none', cursor: 'pointer',
      background: '#fff', color: palette.accentPlay, fontWeight: 800, fontSize: 'var(--fs-body)',
    }}>{label}</button>
  )

  if (step === 'password' && selected) {
    return shell(
      <>
        <ScreenHeader title={selected.ssid} onBack={() => setStep('list')} />
        <div style={{
          background: 'rgba(255,255,255,0.15)', borderRadius: 999, padding: '0 var(--gap)', height: 'var(--btn-sm)',
          display: 'flex', alignItems: 'center', color: '#fff', fontSize: 'var(--fs-h3)', letterSpacing: '0.1em', flexShrink: 0,
        }}>{'•'.repeat(password.length) || <span style={{ opacity: 0.6, letterSpacing: 0, fontSize: 'var(--fs-body)' }}>{t(lang, 'wifiPassword')}</span>}</div>
        <div style={{ flex: 1 }} />
        <OnScreenKeyboard mode="text" compact value={password} onChange={setPassword} onDone={() => connect(selected, password)} />
      </>
    )
  }

  if (step === 'connecting') {
    return shell(centered(<>{t(lang, 'connecting')}<span style={{ fontSize: 'var(--fs-body)', fontWeight: 600, opacity: 0.85 }}>{selected?.ssid}</span></>))
  }

  if (step === 'error') {
    return shell(centered(<>
      <span style={{ color: '#ffe0e6' }}>{t(lang, 'connectFailed')}</span>
      {pill(t(lang, 'tryAgain'), () => setStep(selected && selected.security !== 'Open' ? 'password' : 'list'))}
    </>))
  }

  return shell(
    <>
      <ScreenHeader
        title={t(lang, 'wifi')}
        onBack={onBack}
        right={<HeaderActions onNavigate={onNavigate} />}
      />

      <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 'var(--fs-body)', fontWeight: 700, flexShrink: 0 }}>
        {current.connected
          ? `${t(lang, 'connectedTo')} ${current.ssid}`
          : t(lang, 'notConnected')}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--gap-xs)' }}>
        {scanning && networks.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 'var(--fs-body)' }}>{t(lang, 'scanning')}</div>
        )}
        {!scanning && networks.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 'var(--fs-body)' }}>{t(lang, 'noNetworks')}</div>
        )}
        {networks.map(net => (
          <button key={net.ssid} onClick={() => pick(net)} style={{
            display: 'flex', alignItems: 'center', gap: 'var(--gap-sm)', width: '100%', flexShrink: 0, cursor: 'pointer',
            padding: 'var(--gap-sm) var(--gap)', borderRadius: 'var(--r-sm)', textAlign: 'left', fontFamily: 'inherit', color: '#fff',
            background: net.inUse ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.14)',
            border: net.inUse ? '1.5px solid rgba(255,255,255,0.6)' : '1.5px solid transparent',
          }}>
            <IconWifi size="var(--icon)" bars={bars(net.signal)} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-body)', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{net.ssid}</span>
            {net.security !== 'Open' && <span style={{ fontSize: 'var(--fs-sm)' }}>🔒</span>}
            {net.inUse && <IconCheck size="var(--icon)" stroke="#fff" />}
          </button>
        ))}
        <div style={{ alignSelf: 'center', marginTop: 'var(--gap-xs)' }}>{pill(t(lang, 'rescan'), scan)}</div>
      </div>
    </>
  )
}
