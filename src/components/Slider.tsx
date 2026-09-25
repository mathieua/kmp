import { useRef, useState, useEffect } from 'react'

interface SliderProps {
  value: number
  max?: number
  /** Fires continuously while dragging. */
  onChange?: (value: number) => void
  /** Fires once, on release (or on a plain tap). */
  onCommit?: (value: number) => void
  /** After release, keep showing the released value this long (ms) so a
   *  slow-to-confirm action (seeking restarts the player) doesn't snap back. */
  holdMs?: number
  fill?: string
  track?: string
  label?: string
}

// Pointer-event slider: works for mouse and touch, and — unlike <input
// type="range"> — has a thumb and hit area big enough for small fingers.
export function Slider({
  value, max = 100, onChange, onCommit, holdMs = 0,
  fill = '#fff', track = 'rgba(255,255,255,0.28)', label,
}: SliderProps) {
  const ref = useRef<HTMLDivElement>(null)
  const latest = useRef(0)
  const [drag, setDrag] = useState<number | null>(null)
  const [held, setHeld] = useState<number | null>(null)

  useEffect(() => {
    if (held === null) return
    const id = setTimeout(() => setHeld(null), holdMs)
    return () => clearTimeout(id)
  }, [held, holdMs])

  const valueAt = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    return f * max
  }

  const shown = drag ?? held ?? value
  const pct = max > 0 ? Math.min(100, Math.max(0, (shown / max) * 100)) : 0

  return (
    <div
      ref={ref}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(shown)}
      onPointerDown={e => {
        e.currentTarget.setPointerCapture(e.pointerId)
        latest.current = valueAt(e)
        setDrag(latest.current)
        setHeld(null)
        onChange?.(latest.current)
      }}
      onPointerMove={e => {
        if (drag === null) return
        latest.current = valueAt(e)
        setDrag(latest.current)
        onChange?.(latest.current)
      }}
      onPointerUp={() => {
        if (drag === null) return
        setDrag(null)
        if (holdMs > 0) setHeld(latest.current)
        onCommit?.(latest.current)
      }}
      onPointerCancel={() => setDrag(null)}
      style={{
        position: 'relative', flex: 1, minWidth: 0, touchAction: 'none', cursor: 'pointer',
        height: 'var(--btn-sm)', display: 'flex', alignItems: 'center',
      }}
    >
      <div style={{ width: '100%', height: 'min(1.5vw, 2.5vh)', borderRadius: 999, background: track, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: fill, borderRadius: 999 }} />
      </div>
      <div style={{
        position: 'absolute', left: `${pct}%`, top: '50%',
        width: 'min(3.4vw, 5.7vh)', height: 'min(3.4vw, 5.7vh)', borderRadius: '50%',
        background: '#fff', transform: 'translate(-50%, -50%)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)', pointerEvents: 'none',
      }} />
    </div>
  )
}
