import { Route } from '../App'
import { CircleBtn, IconSettings } from './Icons'
import { VolumeButton } from './VolumeButton'

interface HeaderActionsProps {
  onNavigate: (r: Route) => void
  /** Hidden on the Settings screen itself. */
  showSettings?: boolean
  /** Screen-specific buttons, shown before volume/settings. */
  children?: React.ReactNode
}

// The buttons every screen shares in its top-right corner.
export function HeaderActions({ onNavigate, showSettings = true, children }: HeaderActionsProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-sm)' }}>
      {children}
      <VolumeButton />
      {showSettings && (
        <CircleBtn onClick={() => onNavigate('settings')}>
          <IconSettings size="var(--icon)" />
        </CircleBtn>
      )}
    </div>
  )
}
