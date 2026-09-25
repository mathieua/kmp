import { useState, useEffect, useRef, useCallback } from 'react'
import { CircleBtn, IconVolume, IconVolumeMute } from './Icons'
import { Slider } from './Slider'
import { usePlayback } from '../hooks/useAudio'

const STEP = 5
const AUTO_CLOSE_MS = 5000
// Each volume change spawns a process on the Pi, so live dragging is throttled.
const LIVE_THROTTLE_MS = 120

interface VolumeButtonProps {
  size?: number | string
}

// Speaker button that opens a small volume panel: a big slider plus −/+ steps.
export function VolumeButton({ size }: VolumeButtonProps) {
  const { volume, setVolume } = usePlayback()
  const [open, setOpen] = useState(false)
  const [touched, setTouched] = useState(0)     // bumps to restart the auto-close timer
  const lastSent = useRef(0)

  useEffect(() => {
    if (!open) return
    const id = setTimeout(() => setOpen(false), AUTO_CLOSE_MS)
    return () => clearTimeout(id)
  }, [open, touched])

  const apply = useCallback((v: number, live = false) => {
    setTouched(n => n + 1)
    const now = Date.now()
    if (live && now - lastSent.current < LIVE_THROTTLE_MS) return
    lastSent.current = now
    setVolume(Math.round(Math.max(0, Math.min(100, v))))
  }, [setVolume])

  const stepBtn: React.CSSProperties = {
    width: 'var(--btn)', height: 'var(--btn)', borderRadius: '50%', border: 'none',
    background: 'rgba(255,255,255,0.22)', color: '#fff', cursor: 'pointer', flexShrink: 0,
    fontSize: 'var(--fs-h1)', fontWeight: 800, lineHeight: 1, padding: 0,
  }

  return (
    <div style={{ position: 'relative' }}>
      <CircleBtn size={size} onClick={() => setOpen(o => !o)} bg={open ? 'rgba(255,255,255,0.4)' : undefined}>
        {volume === 0
          ? <IconVolumeMute size="var(--icon)" />
          : <IconVolume size="var(--icon)" />}
      </CircleBtn>

      {open && (
        <>
          {/* Tap anywhere else to close */}
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + var(--gap-sm))', right: 0, zIndex: 31,
            width: 'min(52vw, 86vh)', padding: 'var(--gap)',
            background: 'rgba(30,20,60,0.88)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.2)', borderRadius: 'var(--r)',
            boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', gap: 'var(--gap-sm)',
          }}>
            <button style={stepBtn} onClick={() => apply(volume - STEP)}>−</button>
            <Slider value={volume} onChange={v => apply(v, true)} onCommit={v => apply(v)} label="Volume" />
            <button style={stepBtn} onClick={() => apply(volume + STEP)}>+</button>
            <div style={{
              minWidth: '3.2em', textAlign: 'right', color: '#fff', fontWeight: 800,
              fontSize: 'var(--fs-h3)', fontVariantNumeric: 'tabular-nums',
            }}>{volume}%</div>
          </div>
        </>
      )}
    </div>
  )
}
