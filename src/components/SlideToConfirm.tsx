import { useRef, useState } from 'react'

interface SlideToConfirmProps {
  label: string
  icon: React.ReactNode
  color: string
  onConfirm: () => void
}

const CONFIRM_AT = 0.92   // fraction of the travel the knob must reach
const INSET = 4           // px between the knob and the track edge

// Drag the knob all the way right to confirm; let go early and it springs
// back. Deliberately harder to trigger than a tap, for actions a small
// finger shouldn't fire by accident.
export function SlideToConfirm({ label, icon, color, onConfirm }: SlideToConfirmProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startX: number; travel: number } | null>(null)
  const [px, setPx] = useState(0)          // knob offset from its rest position
  const [dragging, setDragging] = useState(false)
  const [done, setDone] = useState(false)

  const travel = () => trackRef.current!.clientWidth - knobRef.current!.offsetWidth - 2 * INSET
  const f = drag.current ? px / drag.current.travel : px > 0 ? 1 : 0

  return (
    <div
      ref={trackRef}
      style={{
        position: 'relative', width: 'min(60vw, 100vh)', height: 'var(--btn-lg)',
        borderRadius: 999, background: 'rgba(255,255,255,0.15)',
        border: '1px solid rgba(255,255,255,0.22)', overflow: 'hidden', touchAction: 'none',
      }}
    >
      {/* Fill trailing the knob */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: 0,
        width: `calc(${px + INSET}px + var(--btn-lg) / 2)`,
        background: color, opacity: 0.6, transition: dragging ? 'none' : 'width 0.25s',
      }} />
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        paddingLeft: 'var(--btn-lg)', color: '#fff', fontWeight: 800, fontSize: 'var(--fs-h3)',
        opacity: Math.max(0, 1 - f * 1.6), pointerEvents: 'none',
      }}>
        {label}&nbsp;&nbsp;›››
      </div>
      <div
        ref={knobRef}
        onPointerDown={e => {
          if (done) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { startX: e.clientX, travel: travel() }
          setDragging(true)
        }}
        onPointerMove={e => {
          if (!drag.current) return
          setPx(Math.min(drag.current.travel, Math.max(0, e.clientX - drag.current.startX)))
        }}
        onPointerUp={() => {
          if (!drag.current) return
          const t = drag.current.travel
          drag.current = null
          setDragging(false)
          if (px >= t * CONFIRM_AT) {
            setPx(t)
            setDone(true)
            onConfirm()
          } else {
            setPx(0)
          }
        }}
        onPointerCancel={() => { drag.current = null; setDragging(false); setPx(0) }}
        style={{
          position: 'absolute', top: INSET, left: INSET,
          width: `calc(var(--btn-lg) - ${2 * INSET + 2}px)`, height: `calc(var(--btn-lg) - ${2 * INSET + 2}px)`,
          borderRadius: '50%', background: '#fff', color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 10px rgba(0,0,0,0.35)', cursor: 'grab',
          transform: `translateX(${px}px)`, transition: dragging ? 'none' : 'transform 0.25s',
        }}
      >
        {icon}
      </div>
    </div>
  )
}
