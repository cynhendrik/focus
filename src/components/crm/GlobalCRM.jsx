import { useState, useMemo } from 'react'
import { useStore } from '../../store'
import { avGrad, getInitials } from '../../utils/helpers'
import { CrmCustomerDetail } from './CrmCustomerDetail'
import { CrmFollowUpsGlobal } from './CrmFollowUpsGlobal'

const PRIO_COLOR = { Low: '#22c55e', Medium: '#f59e0b', High: '#ef4444' }
const STATUS_BG  = { Lead: 'rgba(139,92,246,0.12)', Aktiv: 'rgba(16,185,129,0.12)', Inaktiv: 'rgba(148,163,184,0.12)', Lost: 'rgba(239,68,68,0.12)' }
const STATUS_FG  = { Lead: '#8b5cf6', Aktiv: '#10b981', Inaktiv: '#94a3b8', Lost: '#ef4444' }

export function GlobalCRM() {
  const companyView    = useStore(s => s.companyView)
  const setCompanyView = useStore(s => s.setCompanyView)
  const customers      = useStore(s => s.customers)
  const addCustomer    = useStore(s => s.addCustomer)
  const crmStatuses    = useStore(s => s.crmSettings.statuses)
  const crmPriorities  = useStore(s => s.crmSettings.priorities)

  const view = companyView === 'crm-followups' ? 'followups' : 'kunden'

  const [selectedId, setSelectedId] = useState(null)
  const [search,   setSearch]   = useState('')
  const [filtSt,   setFiltSt]   = useState('Alle')
  const [filtPrio, setFiltPrio] = useState('Alle')
  const [addOpen,  setAddOpen]  = useState(false)
  const [newForm, setNewForm]   = useState({ name: '', company: '', email: '', phone: '', status: 'Aktiv', priority: 'Medium' })

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return customers
      .filter(c => {
        if (q && !c.name.toLowerCase().includes(q) && !(c.company || '').toLowerCase().includes(q)) return false
        if (filtSt   !== 'Alle' && c.status   !== filtSt)   return false
        if (filtPrio !== 'Alle' && c.priority  !== filtPrio) return false
        return true
      })
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  }, [customers, search, filtSt, filtPrio])

  const selectedCustomer = customers.find(c => c.id === selectedId)

  const handleAdd = () => {
    if (!newForm.name.trim()) return
    const c = addCustomer(newForm)
    setSelectedId(c.id)
    setCompanyView('crm-kunden')
    setAddOpen(false)
    setNewForm({ name: '', company: '', email: '', phone: '', status: 'Aktiv', priority: 'Medium' })
  }

  const handleSelectCustomer = (id) => {
    setSelectedId(id)
    if (view === 'followups') setCompanyView('crm-kunden')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', flex: 1 }}>

      {/* ── Top bar ── */}
      <div style={{
        height: 48, flexShrink: 0, display: 'flex', alignItems: 'center',
        padding: '0 20px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg1)', gap: 12,
      }}>
        {/* CRM label */}
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>CRM</span>

        {/* View tabs */}
        <div style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
          {[['crm-kunden', 'Kunden'], ['crm-followups', 'Follow-Ups']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setCompanyView(id)}
              style={{
                padding: '4px 12px', borderRadius: 'var(--r-pill)', fontSize: 12, fontWeight: view === (id === 'crm-kunden' ? 'kunden' : 'followups') ? 700 : 400,
                background: view === (id === 'crm-kunden' ? 'kunden' : 'followups') ? 'var(--p5)' : 'transparent',
                border: `1px solid ${view === (id === 'crm-kunden' ? 'kunden' : 'followups') ? 'var(--border3)' : 'transparent'}`,
                color: view === (id === 'crm-kunden' ? 'kunden' : 'followups') ? 'var(--p)' : 'var(--text3)',
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              }}
            >{label}</button>
          ))}
        </div>

        {/* Customer count */}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text4)' }}>
          {customers.length} Kunden im Workspace
        </span>
      </div>

      {/* ── Main layout: left list + right content ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

      {/* ── Left: Customer list ── */}
      <div style={{
        width: 268, flexShrink: 0, display: 'flex', flexDirection: 'column',
        background: 'var(--bg1)', borderRight: '1px solid var(--border)',
      }}>
        <div style={{ padding: '14px 14px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)' }}>
              {filtered.length} Treffer
            </span>
            <button
              onClick={() => setAddOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 'var(--r-pill)', fontSize: 11, fontWeight: 700, background: 'var(--p)', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> Neu
            </button>
          </div>

          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Suchen…"
            style={{ width: '100%', padding: '7px 10px', borderRadius: 'var(--r-md)', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12, fontFamily: 'inherit', outline: 'none', marginBottom: 8 }}
          />

          <div style={{ display: 'flex', gap: 6 }}>
            <select
              value={filtSt}
              onChange={e => setFiltSt(e.target.value)}
              style={{ flex: 1, padding: '5px 6px', borderRadius: 'var(--r-sm)', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text3)', fontSize: 11, fontFamily: 'inherit', outline: 'none' }}
            >
              <option value="Alle">Status: Alle</option>
              {crmStatuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={filtPrio}
              onChange={e => setFiltPrio(e.target.value)}
              style={{ flex: 1, padding: '5px 6px', borderRadius: 'var(--r-sm)', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text3)', fontSize: 11, fontFamily: 'inherit', outline: 'none' }}
            >
              <option value="Alle">Prio: Alle</option>
              {crmPriorities.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '32px 12px', textAlign: 'center', color: 'var(--text4)', fontSize: 12, lineHeight: 1.7 }}>
              {search || filtSt !== 'Alle' || filtPrio !== 'Alle'
                ? 'Keine Treffer gefunden.'
                : 'Noch keine Kunden.\nKlicke + Neu um zu starten.'}
            </div>
          ) : filtered.map(c => {
            const active = c.id === selectedId && view === 'kunden'
            return (
              <button
                key={c.id}
                onClick={() => handleSelectCustomer(c.id)}
                style={{
                  width: '100%', padding: '10px', borderRadius: 'var(--r-md)', textAlign: 'left',
                  background: active ? 'var(--p5)' : 'transparent',
                  border: `1px solid ${active ? 'rgba(124,58,237,0.2)' : 'transparent'}`,
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s', marginBottom: 2,
                  display: 'flex', alignItems: 'center', gap: 10,
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg2)' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: avGrad(c.id), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>
                  {getInitials(c.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--p)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name}
                    </span>
                    {c.status && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 99, flexShrink: 0, background: STATUS_BG[c.status] ?? 'var(--bg3)', color: STATUS_FG[c.status] ?? 'var(--text3)' }}>
                        {c.status}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                    {c.company || '—'}
                    {c.priority && (
                      <span style={{ marginLeft: 6, fontWeight: 600, color: PRIO_COLOR[c.priority] ?? 'var(--text4)' }}>· {c.priority}</span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Right: Content ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        {view === 'kunden' && (
          selectedCustomer
            ? <CrmCustomerDetail customer={selectedCustomer} key={selectedCustomer.id} />
            : <EmptyState onAdd={() => setAddOpen(true)} />
        )}
        {view === 'followups' && (
          <CrmFollowUpsGlobal onSelectCustomer={handleSelectCustomer} />
        )}
      </div>

      </div>{/* end main layout */}

      {/* ── Add Customer Modal ── */}
      {addOpen && (
        <div
          onClick={e => e.target === e.currentTarget && setAddOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div style={{ background: 'var(--bg1)', borderRadius: 'var(--r-lg)', padding: 28, width: 420, border: '1px solid var(--border2)', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Neuer Kunde</h3>
            <FormField label="Name *"  value={newForm.name}    onChange={v => setNewForm(f => ({ ...f, name: v }))}    placeholder="Max Mustermann"   autoFocus onEnter={handleAdd} />
            <FormField label="Firma"   value={newForm.company} onChange={v => setNewForm(f => ({ ...f, company: v }))} placeholder="Muster GmbH" />
            <FormField label="E-Mail"  value={newForm.email}   onChange={v => setNewForm(f => ({ ...f, email: v }))}   placeholder="max@firma.de" type="email" />
            <FormField label="Telefon" value={newForm.phone}   onChange={v => setNewForm(f => ({ ...f, phone: v }))}   placeholder="+49 123 456789" />
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <div style={{ flex: 1 }}>
                <FieldLabel>Status</FieldLabel>
                <select value={newForm.status} onChange={e => setNewForm(f => ({ ...f, status: e.target.value }))} style={selStyle}>
                  {crmStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <FieldLabel>Priorität</FieldLabel>
                <select value={newForm.priority} onChange={e => setNewForm(f => ({ ...f, priority: e.target.value }))} style={selStyle}>
                  {crmPriorities.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleAdd} style={{ flex: 1, padding: '10px', borderRadius: 'var(--r-md)', background: 'var(--p)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Anlegen</button>
              <button onClick={() => setAddOpen(false)} style={{ padding: '10px 16px', borderRadius: 'var(--r-md)', background: 'transparent', border: '1px solid var(--border2)', color: 'var(--text3)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyState({ onAdd }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 40 }}>
      <svg width="52" height="52" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--text4)', opacity: 0.4 }}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
      </svg>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Kein Kunde ausgewählt</div>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>Wähle einen Kunden aus der Liste oder lege einen neuen an.</div>
      </div>
      <button onClick={onAdd} style={{ padding: '9px 22px', borderRadius: 'var(--r-pill)', background: 'var(--p)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
        + Neuer Kunde
      </button>
    </div>
  )
}

const selStyle = { width: '100%', padding: '9px 10px', borderRadius: 'var(--r-md)', background: 'var(--bg2)', border: '1px solid var(--border2)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }

function FieldLabel({ children }) {
  return <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 5 }}>{children}</label>
}

function FormField({ label, value, onChange, placeholder, type = 'text', autoFocus, onEnter }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <FieldLabel>{label}</FieldLabel>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onKeyDown={e => e.key === 'Enter' && onEnter?.()}
        style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--r-md)', background: 'var(--bg2)', border: '1px solid var(--border2)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
      />
    </div>
  )
}
