import { useEffect, useState } from 'react'
import { Lang, t } from '../App'
import { IconPower, IconRestart } from './Icons'
import { SlideToConfirm } from './SlideToConfirm'

export type PowerAction = 'shutdown' | 'restart'

/**
 * confirm — opened from Settings, slide to confirm
 * hold    — skip+previous held on the device; counts down to the power-off
 *           (hw/buttons.py sends 'hold' after 1 s and powers off at 5 s)
 * going   — shutdown/restart under way
 */
export type PowerOverlayState =
  | { mode: 'confirm'; action: PowerAction }
  | { mode: 'hold' }
  | { mode: 'going'; action: PowerAction }

const HOLD_COUNTDOWN_S = 4
const COLORS: Record<PowerAction, string> = { shutdown: '#ef4444', restart: '#6366f1' }

interface PowerOverlayProps {
  state: PowerOverlayState
  lang: Lang
  onConfirm: (action: PowerAction) => void
  onCancel: () => void
}

export function PowerOverlay({ state, lang, onConfirm, onCancel }: PowerOverlayProps) {
  const [left, setLeft] = useState(HOLD_COUNTDOWN_S)

  useEffect(() => {
    if (state.mode !== 'hold') return
    setLeft(HOLD_COUNTDOWN_S)
    const id = setInterval(() => setLeft(s => Math.max(1, s - 1)), 1000)
    return () => clearInterval(id)
  }, [state.mode])

  const action: PowerAction = state.mode === 'hold' ? 'shutdown' : state.action
  const Icon = action === 'shutdown' ? IconPower : IconRestart

  let title: string
  let sub: string | null = null
  if (state.mode === 'confirm') {
    title = t(lang, action === 'shutdown' ? 'turnOffTitle' : 'restartTitle')
    if (action === 'shutdown') sub = t(lang, 'turnOffHint')
  } else if (state.mode === 'hold') {
    title = t(lang, 'keepHolding')
    sub = t(lang, 'letGoToCancel')
  } else {
    title = t(lang, action === 'shutdown' ? 'turningOff' : 'restarting')
    if (action === 'shutdown') sub = t(lang, 'safeToSwitchOff')
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'linear-gradient(135deg, #1a1a3e 0%, #0f0f2e 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 'var(--gap)', padding: 'var(--pad)', textAlign: 'center', color: '#fff',
    }}>
      <div style={{
        width: 'var(--btn-lg)', height: 'var(--btn-lg)', borderRadius: '50%',
        background: COLORS[action], display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 'var(--fs-xl)', fontWeight: 800, fontVariantNumeric: 'tabular-nums',
      }}>
        {state.mode === 'hold' ? left : <Icon size="var(--icon-lg)" />}
      </div>

      <div style={{ fontSize: 'var(--fs-h1)', fontWeight: 800 }}>{title}</div>
      {sub && <div style={{ fontSize: 'var(--fs-body)', color: 'rgba(255,255,255,0.75)', maxWidth: '36em' }}>{sub}</div>}

      {state.mode === 'confirm' && (
        <>
          <div style={{ marginTop: 'var(--gap)' }}>
            <SlideToConfirm
              label={t(lang, action === 'shutdown' ? 'slideToTurnOff' : 'slideToRestart')}
              icon={<Icon size="var(--icon)" />}
              color={COLORS[action]}
              onConfirm={() => onConfirm(action)}
            />
          </div>
          <button onClick={onCancel} style={{
            marginTop: 'var(--gap-sm)', padding: 'var(--gap-sm) var(--pad)', borderRadius: 999,
            border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff',
            fontWeight: 800, fontSize: 'var(--fs-body)', fontFamily: 'inherit', cursor: 'pointer',
          }}>
            {t(lang, 'cancel')}
          </button>
        </>
      )}
    </div>
  )
}
