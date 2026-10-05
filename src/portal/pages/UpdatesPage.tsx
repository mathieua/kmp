import { useUpdateStatus } from '../hooks/useUpdateStatus'

function formatTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : 'never'
}

const RESULT_LABEL = { success: 'Updated', failed: 'Failed', rolled_back: 'Rolled back' } as const
const RESULT_COLOR = { success: '#a6e3a1', failed: '#f38ba8', rolled_back: '#fab387' } as const

export function UpdatesPage() {
  const { status, error, busy, check, apply } = useUpdateStatus()

  if (!status) return <p style={styles.muted}>{error ?? 'Loading…'}</p>

  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>Software updates</h1>

      <div style={styles.card}>
        <div style={styles.label}>Installed version</div>
        <div style={styles.version}>{status.currentVersion}</div>
        <div style={styles.sub}>Last checked: {formatTime(status.lastCheck)}</div>
        {status.lastCheckError && <div style={styles.errorText}>Last check failed: {status.lastCheckError}</div>}
      </div>

      {!status.supported && (
        <div style={styles.warning}>Over-the-air updates are not set up on this device.</div>
      )}

      {status.state !== 'idle' && (
        <div style={styles.info}>
          {status.state === 'updating'
            ? 'Installing update… the clock will restart in a moment.'
            : 'Checking for updates…'}
        </div>
      )}

      {status.available && (
        <div style={styles.card}>
          <div style={styles.label}>Update available</div>
          <div style={styles.version}>{status.available.version}</div>
          {status.available.publishedAt && <div style={styles.sub}>Released {formatTime(status.available.publishedAt)}</div>}
          {/* Release notes are plain text from the release body — never rendered as HTML. */}
          {status.available.changelog && <pre style={styles.changelog}>{status.available.changelog}</pre>}
        </div>
      )}

      {!status.available && status.supported && status.lastCheck && !status.lastCheckError && (
        <p style={styles.muted}>You're up to date.</p>
      )}

      {status.lastResult && (
        <p style={{ ...styles.muted, color: RESULT_COLOR[status.lastResult.status] }}>
          {RESULT_LABEL[status.lastResult.status]} ({formatTime(status.lastResult.at)}): {status.lastResult.message}
        </p>
      )}

      {error && <div style={styles.errorText}>{error}</div>}

      <div style={styles.actions}>
        <button
          style={{ ...styles.btn, ...styles.btnSecondary, opacity: busy || !status.supported ? 0.5 : 1 }}
          disabled={busy || !status.supported}
          onClick={check}
        >
          Check for updates
        </button>
        {status.available && (
          <button
            style={{ ...styles.btn, ...styles.btnPrimary, opacity: busy ? 0.5 : 1 }}
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Install ${status.available!.version}? The clock restarts and music stops briefly.`)) apply()
            }}
          >
            Install {status.available.version}
          </button>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 600 },
  heading: { fontSize: 24, fontWeight: 700, margin: '0 0 24px', color: '#cdd6f4' },
  card: { background: '#1e1e2e', border: '1px solid #313244', borderRadius: 8, padding: '16px 20px', marginBottom: 20 },
  label: { fontSize: 12, color: '#a6adc8', textTransform: 'uppercase', letterSpacing: '0.05em' },
  version: { fontSize: 28, fontWeight: 700, color: '#cdd6f4', margin: '4px 0' },
  sub: { fontSize: 13, color: '#a6adc8' },
  muted: { color: '#a6adc8', fontSize: 14, margin: '0 0 16px' },
  errorText: { color: '#f38ba8', fontSize: 13, margin: '8px 0' },
  info: { background: '#313244', borderRadius: 6, padding: '10px 14px', fontSize: 14, color: '#89b4fa', marginBottom: 20 },
  warning: { background: '#45475a', border: '1px solid #fab387', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#fab387', marginBottom: 20 },
  changelog: { whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, color: '#cdd6f4', margin: '12px 0 0', maxHeight: 240, overflow: 'auto' },
  actions: { display: 'flex', gap: 12, marginTop: 24 },
  btn: { padding: '10px 20px', borderRadius: 6, border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 },
  btnPrimary: { background: '#cba6f7', color: '#1e1e2e' },
  btnSecondary: { background: '#313244', color: '#cdd6f4' },
}
