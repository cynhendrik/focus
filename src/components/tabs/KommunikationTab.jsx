export function KommunikationTab() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 640 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8, letterSpacing: '-0.02em' }}>Kommunikation</h3>
      <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 24 }}>E-Mail- und Nachrichtenverlauf wird hier angezeigt.</p>

      <div style={{
        background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
        padding: '48px', textAlign: 'center',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: 'var(--p5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 12px',
        }}>
          <svg width="22" height="22" fill="none" stroke="var(--p)" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
          </svg>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Demnächst verfügbar</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', maxWidth: 280, margin: '0 auto', lineHeight: 1.6 }}>
          E-Mail-Integration und Kommunikationsverlauf werden in einer zukünftigen Version verfügbar sein.
        </div>
      </div>
    </div>
  )
}
