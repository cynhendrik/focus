import { useStore } from '../../store'

export function TopBar({ onNewClient, onTimeEntry, onPrivatNotes, privatNotesOpen }) {
  const focusMode      = useStore(s => s.focusMode)
  const toggleFocusMode = useStore(s => s.toggleFocusMode)

  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  return (
    <div style={{
      height: 64, display: 'flex', alignItems: 'center',
      padding: '0 32px', background: 'var(--bg1)',
      borderBottom: '1px solid var(--border)', flexShrink: 0, gap: 16,
    }}>
      <div style={{ minWidth: 160 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          Today in Cynera
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{dateStr}</div>
      </div>

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%', maxWidth: 480,
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-pill)', padding: '8px 16px',
        }}>
          <svg width="13" height="13" fill="none" stroke="var(--text3)" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input
            placeholder="Search..."
            style={{ background: 'none', border: 'none', outline: 'none', fontSize: 13, color: 'var(--text)', fontFamily: 'inherit', flex: 1 }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {/* Time entry clock button */}
        <button
          onClick={onTimeEntry}
          title="Zeit erfassen"
          style={{
            width: 38, height: 38, borderRadius: '50%',
            background: 'var(--bg2)', border: '1px solid var(--border2)',
            color: 'var(--text3)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--p5)'; e.currentTarget.style.color = 'var(--p)'; e.currentTarget.style.borderColor = 'var(--border3)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--text3)'; e.currentTarget.style.borderColor = 'var(--border2)' }}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" strokeWidth={1.75}/>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 6v6l4 2"/>
          </svg>
        </button>

        {/* Privat notes */}
        {onPrivatNotes && (
          <button
            onClick={onPrivatNotes}
            title="Privat Notizen"
            style={{
              width: 38, height: 38, borderRadius: '50%',
              background: privatNotesOpen ? 'var(--p5)' : 'var(--bg2)',
              border: `1px solid ${privatNotesOpen ? 'var(--border3)' : 'var(--border2)'}`,
              color: privatNotesOpen ? 'var(--p)' : 'var(--text3)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!privatNotesOpen) { e.currentTarget.style.background = 'var(--p5)'; e.currentTarget.style.color = 'var(--p)'; e.currentTarget.style.borderColor = 'var(--border3)' } }}
            onMouseLeave={e => { if (!privatNotesOpen) { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--text3)'; e.currentTarget.style.borderColor = 'var(--border2)' } }}
          >
            <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
            </svg>
          </button>
        )}

        {/* Focus mode toggle */}
        <button
          onClick={toggleFocusMode}
          title={focusMode ? 'Fokus beenden' : 'Fokus-Modus'}
          style={{
            width: 38, height: 38, borderRadius: '50%',
            background: focusMode ? '#f59e0b' : 'var(--bg2)',
            border: `1px solid ${focusMode ? '#f59e0b' : 'var(--border2)'}`,
            color: focusMode ? '#000' : 'var(--text3)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s',
            boxShadow: focusMode ? '0 0 16px rgba(245,158,11,0.45)' : 'none',
          }}
          onMouseEnter={e => { if (!focusMode) { e.currentTarget.style.background = 'rgba(245,158,11,0.15)'; e.currentTarget.style.color = '#f59e0b'; e.currentTarget.style.borderColor = 'rgba(245,158,11,0.4)' } }}
          onMouseLeave={e => { if (!focusMode) { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--text3)'; e.currentTarget.style.borderColor = 'var(--border2)' } }}
        >
          <svg width="15" height="15" fill={focusMode ? '#000' : 'currentColor'} viewBox="0 0 24 24">
            <path d="M13 2L4.09 12.96A1 1 0 005 14.5h6.5L10 22l9.91-10.96A1 1 0 0019 9.5h-6.5L13 2z"/>
          </svg>
        </button>

        <button
          onClick={onNewClient}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 20px', borderRadius: 'var(--r-pill)',
            background: 'var(--p)', border: 'none', color: '#fff',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            letterSpacing: '-0.01em',
            boxShadow: '0 2px 12px rgba(124,58,237,0.25)',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--p2)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--p)'}
        >
          <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/>
          </svg>
          New Client
        </button>
      </div>
    </div>
  )
}
