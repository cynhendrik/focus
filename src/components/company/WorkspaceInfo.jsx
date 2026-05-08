import { useState } from 'react'
import { useStore } from '../../store'

function StatCard({ label, value, sub, icon }) {
  return (
    <div style={{
      background: 'var(--bg1)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)', padding: '20px',
      display: 'flex', gap: 16, alignItems: 'center',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: 'var(--p5)', border: '1px solid var(--border3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--p)',
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text4)', marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  )
}

export function WorkspaceInfo() {
  const workspaceName      = useStore(s => s.workspaceName)
  const workspaceCreatedAt = useStore(s => s.workspaceCreatedAt)
  const setWorkspaceName   = useStore(s => s.setWorkspaceName)
  const customers          = useStore(s => s.customers)
  const modules            = useStore(s => s.modules)

  const [editing, setEditing]   = useState(false)
  const [draft,   setDraft]     = useState(workspaceName)

  const activeModules = Object.values(modules).filter(Boolean).length

  const createdDate = workspaceCreatedAt
    ? new Date(workspaceCreatedAt).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—'

  const save = () => {
    const v = draft.trim()
    if (v) setWorkspaceName(v)
    else setDraft(workspaceName)
    setEditing(false)
  }

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', marginBottom: 4 }}>Workspace</h2>
        <p style={{ fontSize: 13, color: 'var(--text3)' }}>Übersicht und Einstellungen deines Workspaces</p>
      </div>

      {/* Workspace name */}
      <div style={{
        background: 'var(--bg1)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)', padding: '20px', marginBottom: 24,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10 }}>
          Workspace-Name
        </div>
        {editing ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDraft(workspaceName); setEditing(false) } }}
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 'var(--r-md)',
                background: 'var(--bg2)', border: '1px solid rgba(124,58,237,0.5)',
                color: 'var(--text)', fontSize: 15, fontWeight: 600, fontFamily: 'inherit', outline: 'none',
              }}
            />
            <button onClick={save} style={{
              padding: '9px 20px', borderRadius: 'var(--r-md)',
              background: 'var(--p)', border: 'none', color: '#fff',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>Speichern</button>
            <button onClick={() => { setDraft(workspaceName); setEditing(false) }} style={{
              padding: '9px 16px', borderRadius: 'var(--r-md)',
              background: 'transparent', border: '1px solid var(--border2)',
              color: 'var(--text3)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            }}>Abbrechen</button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{workspaceName}</span>
            <button onClick={() => setEditing(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 'var(--r-md)',
              background: 'transparent', border: '1px solid var(--border2)',
              color: 'var(--text3)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--text2)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text3)' }}
            >
              <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
              </svg>
              Umbenennen
            </button>
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        <StatCard
          label="Kunden gesamt"
          value={customers.length}
          sub="in diesem Workspace"
          icon={<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>}
        />
        <StatCard
          label="Aktive Module"
          value={activeModules}
          sub="von 7 verfügbar"
          icon={<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>}
        />
        <StatCard
          label="Erstellt am"
          value={createdDate}
          icon={<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>}
        />
        <StatCard
          label="Aktive Kunden"
          value={customers.filter(c => c.status === 'Aktiv' || c.status === 'aktiv').length}
          sub="mit Status Aktiv"
          icon={<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
        />
      </div>
    </div>
  )
}
