import React from 'react'

interface IconProps {
  size?: number | string
  stroke?: string
  fill?: string
  sw?: number
}

function Icon({ size = 24, stroke = 'currentColor', fill = 'none', sw = 2.2, children }: IconProps & { children?: React.ReactNode }) {
  const dim = typeof size === 'number' ? `${size}px` : size
  return (
    <svg viewBox="0 0 24 24" fill={fill} stroke={stroke}
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
      style={{ width: dim, height: dim, display: 'block', flexShrink: 0 }}>
      {children}
    </svg>
  )
}

export const IconAlarm = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="13" r="8"/>
    <path d="M12 9v4l2 2"/>
    <path d="M5 3 2 6"/>
    <path d="m22 6-3-3"/>
    <path d="M6.38 18.7 4 21"/>
    <path d="M17.64 18.67 20 21"/>
  </Icon>
)

export const IconMusic = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 18V5l12-2v13"/>
    <circle cx="6" cy="18" r="3"/>
    <circle cx="18" cy="16" r="3"/>
  </Icon>
)

export const IconPlay = (p: IconProps) => (
  <Icon {...p} fill={p.stroke ?? 'currentColor'} stroke="none">
    <path d="M6 4l14 8-14 8z"/>
  </Icon>
)

export const IconPause = (p: IconProps) => (
  <Icon {...p} fill={p.stroke ?? 'currentColor'} stroke="none">
    <rect x="6" y="4" width="4" height="16" rx="1"/>
    <rect x="14" y="4" width="4" height="16" rx="1"/>
  </Icon>
)

export const IconBack = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 12H5"/>
    <path d="m12 19-7-7 7-7"/>
  </Icon>
)

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14"/>
    <path d="M5 12h14"/>
  </Icon>
)

export const IconTrash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 6h18"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </Icon>
)

export const IconSkipBack = (p: IconProps) => (
  <Icon {...p} fill={p.stroke ?? 'currentColor'} stroke="none">
    <path d="M19 20 9 12l10-8z"/>
    <rect x="5" y="4" width="2" height="16" rx="1"/>
  </Icon>
)

export const IconSkipFwd = (p: IconProps) => (
  <Icon {...p} fill={p.stroke ?? 'currentColor'} stroke="none">
    <path d="m5 4 10 8-10 8z"/>
    <rect x="17" y="4" width="2" height="16" rx="1"/>
  </Icon>
)

export const IconSettings = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </Icon>
)

export const IconVolume = (p: IconProps) => (
  <Icon {...p}>
    <path d="M11 5 6 9H2v6h4l5 4z"/>
    <path d="M15.5 8.5a5 5 0 0 1 0 7"/>
    <path d="M19 5a10 10 0 0 1 0 14"/>
  </Icon>
)

export const IconVolumeMute = (p: IconProps) => (
  <Icon {...p}>
    <path d="M11 5 6 9H2v6h4l5 4z"/>
    <path d="m22 9-6 6"/>
    <path d="m16 9 6 6"/>
  </Icon>
)

export const IconList = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/>
    <path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>
  </Icon>
)

export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7"/>
    <path d="m21 21-4.3-4.3"/>
  </Icon>
)

export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 6 6 18"/>
    <path d="m6 6 12 12"/>
  </Icon>
)

export const IconCheck = (p: IconProps) => (
  <Icon {...p}><path d="M20 6 9 17l-5-5"/></Icon>
)

/** `bars` is 1-4 signal strength. */
export const IconWifi = ({ bars = 4, ...p }: IconProps & { bars?: number }) => (
  <Icon {...p}>
    <path d="M5 12.5a10 10 0 0 1 14 0" opacity={bars >= 3 ? 1 : 0.3}/>
    <path d="M8.5 16a5 5 0 0 1 7 0" opacity={bars >= 2 ? 1 : 0.3}/>
    <path d="M2 9a14 14 0 0 1 20 0" opacity={bars >= 4 ? 1 : 0.3}/>
    <circle cx="12" cy="19.5" r="1" fill="currentColor"/>
  </Icon>
)

export const IconWifiOff = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8.5 16a5 5 0 0 1 7 0" opacity="0.4"/>
    <path d="M5 12.5a10 10 0 0 1 14 0" opacity="0.4"/>
    <path d="M3 3l18 18"/>
  </Icon>
)

/** `level` 0-100; shows a bolt when charging. */
export const IconBattery = ({ level = 100, charging = false, color, ...p }: IconProps & { level?: number; charging?: boolean; color?: string }) => {
  const w = Math.max(0, Math.min(100, level)) / 100 * 13
  return (
    <Icon {...p} stroke={color ?? 'currentColor'}>
      <rect x="2" y="7" width="17" height="10" rx="2.5"/>
      <path d="M22 11v2"/>
      <rect x="4" y="9" width={w} height="6" rx="1" fill={color ?? 'currentColor'} stroke="none"
        opacity={level <= 15 && !charging ? 0.9 : 1}/>
      {charging && <path d="M11.5 8.5 9 12.5h3.5L10.5 16" stroke="#000" strokeWidth="1.6" opacity="0.55"/>}
    </Icon>
  )
}

export const IconChevronRight = (p: IconProps) => (
  <Icon {...p}><path d="m9 6 6 6-6 6"/></Icon>
)

export const IconChevronUp = (p: IconProps) => (
  <Icon {...p}><path d="m6 15 6-6 6 6"/></Icon>
)

export const IconChevronDown = (p: IconProps) => (
  <Icon {...p}><path d="m6 9 6 6 6-6"/></Icon>
)

// ── Circle button ──────────────────────────────────────────────────────────
interface CircleBtnProps {
  onClick?: (e: React.MouseEvent) => void
  children: React.ReactNode
  size?: number | string
  bg?: string
  color?: string
  shadow?: string
  style?: React.CSSProperties
}

export function CircleBtn({ onClick, children, size = 'var(--btn)', bg = 'rgba(255,255,255,0.22)', color = '#fff', shadow, style }: CircleBtnProps) {
  const dim = typeof size === 'number' ? `${size}px` : size
  return (
    <button
      onClick={onClick}
      style={{
        width: dim, height: dim, borderRadius: '50%',
        background: bg, color, border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', padding: 0, flexShrink: 0,
        transition: 'transform 0.12s ease',
        boxShadow: shadow ?? 'none',
        ...style,
      }}
      onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.93)')}
      onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
    >
      {children}
    </button>
  )
}

// ── Equalizer bars (animated) ──────────────────────────────────────────────
export function Equalizer() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 22 }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{
          width: 4, background: '#fff', borderRadius: 2,
          animation: `eq ${0.6 + i * 0.15}s ease-in-out infinite alternate`,
          animationDelay: `${i * 0.1}s`,
        }} />
      ))}
    </div>
  )
}
