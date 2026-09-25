import { CircleBtn, IconBack } from './Icons'

interface ScreenHeaderProps {
  title: React.ReactNode
  onBack?: () => void
  right?: React.ReactNode
}

// Back button | centered title | actions. The side columns are equal width so
// the title stays centered however many buttons are on the right.
export function ScreenHeader({ title, onBack, right }: ScreenHeaderProps) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center',
      gap: 'var(--gap-sm)', flexShrink: 0,
    }}>
      <div style={{ justifySelf: 'start' }}>
        {onBack && <CircleBtn onClick={onBack}><IconBack size="var(--icon)" /></CircleBtn>}
      </div>
      {typeof title === 'string'
        ? <h1 style={{
            color: '#fff', fontSize: 'var(--fs-h1)', fontWeight: 800, margin: 0,
            maxWidth: '42vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{title}</h1>
        : title}
      <div style={{ justifySelf: 'end' }}>{right}</div>
    </div>
  )
}
