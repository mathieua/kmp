import { useState } from 'react'

// ── Shared touch keyboard ─────────────────────────────────────────────────
// Two modes:
//   'hostname' — restricted to what a Linux hostname allows (lowercase
//                letters, digits, hyphen). Single page, no shift needed.
//   'text'     — full keyboard for arbitrary input (e.g. WiFi passwords):
//                letters page with shift, and a symbols page for digits/
//                punctuation, toggled like a phone keyboard's ABC/123.
// These kiosks are touchscreen-only with no physical keyboard attached, so
// this is the only way to enter free text anywhere in the app.

export type KeyboardMode = 'hostname' | 'text'

interface OnScreenKeyboardProps {
  mode: KeyboardMode
  value: string
  onChange: (value: string) => void
  onDone?: () => void
  maxLength?: number
  /** Shorter keys, for screens that also need room for results above. */
  compact?: boolean
}

const HOSTNAME_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', '-'],
]

const LETTER_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
]

const SYMBOL_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['-', '_', '+', '=', '!', '@', '#', '$', '%', '^'],
  ['&', '*', '(', ')', '[', ']', '{', '}', '<', '>'],
  ['.', ',', '?', '/', ':', ';', "'", '"', '\\', '|'],
]

export function OnScreenKeyboard({ mode, value, onChange, onDone, maxLength, compact }: OnScreenKeyboardProps) {
  const [shift, setShift] = useState(false)
  const [page, setPage] = useState<'letters' | 'symbols'>('letters')

  const append = (ch: string) => {
    if (maxLength && value.length >= maxLength) return
    onChange(value + ch)
    if (mode === 'text' && shift) setShift(false)
  }

  const backspace = () => onChange(value.slice(0, -1))

  const rows = mode === 'hostname'
    ? HOSTNAME_ROWS
    : page === 'letters' ? LETTER_ROWS : SYMBOL_ROWS

  const display = (ch: string) => (mode === 'text' && page === 'letters' && shift) ? ch.toUpperCase() : ch
  const emit = (ch: string) => append(display(ch))

  return (
    <div className={`kbd ${compact ? 'kbd--compact' : ''}`}>
      {rows.map((row, i) => (
        <div className="kbd__row" key={i}>
          {row.map(ch => (
            <button key={ch} className="kbd__key" onClick={() => emit(ch)}>{display(ch)}</button>
          ))}
        </div>
      ))}

      <div className="kbd__row">
        {mode === 'text' && page === 'letters' && (
          <button
            className={`kbd__key kbd__key--wide ${shift ? 'kbd__key--active' : ''}`}
            onClick={() => setShift(s => !s)}
          >
            ⇧ Shift
          </button>
        )}
        {mode === 'text' && (
          <button
            className="kbd__key kbd__key--wide"
            onClick={() => setPage(p => p === 'letters' ? 'symbols' : 'letters')}
          >
            {page === 'letters' ? '123' : 'ABC'}
          </button>
        )}
        {mode === 'text' && (
          <button className="kbd__key kbd__key--space" onClick={() => append(' ')}>Space</button>
        )}
        <button className="kbd__key kbd__key--wide" onClick={backspace}>⌫ Delete</button>
        {onDone && (
          <button className="kbd__key kbd__key--wide kbd__key--done" onClick={onDone}>Done</button>
        )}
      </div>
    </div>
  )
}
