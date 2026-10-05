import { NavLink } from 'react-router-dom'
import { useImportJobs } from '../../hooks/useImportJobs'
import { useUpdateStatus } from '../../hooks/useUpdateStatus'

export function PortalNav() {
  const { activeCount, isOpen, togglePanel } = useImportJobs()
  const { status: update } = useUpdateStatus()

  return (
    <nav style={styles.nav}>
      <span style={styles.brand}>Parent Portal</span>
      <div style={styles.links}>
        <NavLink to="/portal" end style={({ isActive }) => ({ ...styles.link, ...(isActive ? styles.activeLink : {}) })}>
          Library
        </NavLink>
        <NavLink to="/portal/import" style={({ isActive }) => ({ ...styles.link, ...(isActive ? styles.activeLink : {}) })}>
          Import
        </NavLink>
        <NavLink to="/portal/upload" style={({ isActive }) => ({ ...styles.link, ...(isActive ? styles.activeLink : {}) })}>
          Upload
        </NavLink>
        <NavLink to="/portal/sync" style={({ isActive }) => ({ ...styles.link, ...(isActive ? styles.activeLink : {}) })}>
          Sync
        </NavLink>
        <NavLink to="/portal/updates" style={({ isActive }) => ({ ...styles.link, ...(isActive ? styles.activeLink : {}) })}>
          Updates {update?.available && <span style={styles.badge}>1</span>}
        </NavLink>
        <button onClick={togglePanel} style={styles.jobsBtn}>
          Jobs {activeCount > 0 && <span style={styles.badge}>{activeCount}</span>}
          {isOpen ? ' ▲' : ' ▼'}
        </button>
      </div>
    </nav>
  )
}

const styles: Record<string, React.CSSProperties> = {
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    height: 56,
    background: '#1e1e2e',
    borderBottom: '1px solid #313244',
    flexShrink: 0,
  },
  brand: { fontWeight: 700, fontSize: 18, color: '#cdd6f4' },
  links: { display: 'flex', alignItems: 'center', gap: 8 },
  link: { color: '#a6adc8', textDecoration: 'none', padding: '6px 12px', borderRadius: 6 },
  activeLink: { color: '#cba6f7', background: '#313244' },
  jobsBtn: {
    background: 'none',
    border: '1px solid #45475a',
    color: '#a6adc8',
    padding: '6px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  badge: {
    background: '#f38ba8',
    color: '#1e1e2e',
    borderRadius: '50%',
    width: 18,
    height: 18,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 700,
  },
}
