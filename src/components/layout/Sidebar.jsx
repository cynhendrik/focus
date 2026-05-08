import { useState, useMemo } from 'react'
import { useStore } from '../../store'
import { PRIVAT_ID } from '../../store'
import { Avatar } from '../ui/Avatar'
import { unreadCounts } from '../../utils/crmIntelligence'

// ── Shared nav button style ───────────────────────────────────────────────────

function NavButton({ label, icon, active, onClick, accent = false }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', padding: '7px 10px', borderRadius: 'var(--r-md)',
        display: 'flex', alignItems: 'center', gap: 7,
        fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        transition: 'all 0.15s', border: '1px solid var(--border3)',
        background: active
          ? 'var(--p)'
          : accent
            ? 'var(--p5)'
            : 'var(--bg2)',
        color: active ? '#fff' : accent ? 'var(--p)' : 'var(--text2)',
        borderColor: active ? 'var(--p)' : accent ? 'var(--border3)' : 'var(--border)',
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.background = accent ? 'rgba(124,58,237,0.18)' : 'var(--bg3)'
          e.currentTarget.style.color = 'var(--p)'
          e.currentTarget.style.borderColor = 'var(--border3)'
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.background = accent ? 'var(--p5)' : 'var(--bg2)'
          e.currentTarget.style.color = accent ? 'var(--p)' : 'var(--text2)'
          e.currentTarget.style.borderColor = accent ? 'var(--border3)' : 'var(--border)'
        }
      }}
    >
      {icon}
      {label}
    </button>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const OverviewIcon = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
  </svg>
)
const CompanyIcon = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
  </svg>
)
const CRMIcon = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
  </svg>
)
const LockIcon = () => (
  <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
  </svg>
)
const MailIcon = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
  </svg>
)

// ── Sidebar ───────────────────────────────────────────────────────────────────

export function Sidebar({ onNewClient, mini = false }) {
  const customers      = useStore(s => s.customers)
  const todos          = useStore(s => s.todos)
  const chatMessages   = useStore(s => s.chatMessages)
  const emails         = useStore(s => s.emails)
  const selectedId     = useStore(s => s.selectedId)
  const selectCustomer = useStore(s => s.selectCustomer)
  const companyView    = useStore(s => s.companyView)
  const setCompanyView = useStore(s => s.setCompanyView)

  const [search,    setSearch]    = useState('')
  const [catFilter, setCatFilter] = useState('Alle')

  const isCrm      = companyView === 'crm-kunden' || companyView === 'crm-followups'
  const isMail     = companyView === 'mail'
  const isCompany  = companyView !== null && !isCrm && !isMail
  const isOverview = !isCrm && !isMail && !isCompany && selectedId === null

  const unreadMap = useMemo(() => {
    const map = {}
    for (const c of customers) {
      const counts = unreadCounts(c.id, { chatMessages, emails })
      if (counts.total > 0) map[c.id] = counts.total
    }
    return map
  }, [customers, chatMessages, emails])

  // Exclude Privat from the regular client list
  const publicCustomers = customers.filter(c => c.id !== PRIVAT_ID)
  const categories = ['Alle', ...new Set(publicCustomers.map(c => c.category).filter(Boolean))]
  const filtered   = publicCustomers.filter(c => {
    const q = search.toLowerCase()
    return (c.name.toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q))
      && (catFilter === 'Alle' || c.category === catFilter)
  })

  const privatCustomer  = customers.find(c => c.id === PRIVAT_ID)
  const privatTodos     = todos.filter(t => t.customerId === PRIVAT_ID && !t.completed && !t.archived).length
  const privatActive    = selectedId === PRIVAT_ID

  // ── Mini rail (CRM mode) ──────────────────────────────────────────────────
  if (mini) {
    return (
      <aside style={{
        width: 52, flexShrink: 0, height: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        background: 'var(--bg1)', borderRight: '1px solid var(--border)',
        padding: '16px 0',
      }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--p)', marginBottom: 'auto' }}>CF</span>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          {/* CRM (active in mini mode) */}
          <button
            onClick={() => { selectCustomer(null); setCompanyView('crm-kunden') }}
            title="CRM"
            style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid var(--p)', background: 'var(--p)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--p2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--p)'}
          >
            <CRMIcon />
          </button>

          {/* Mail */}
          <button
            onClick={() => { selectCustomer(null); setCompanyView('mail') }}
            title="Mail"
            style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${isMail ? 'var(--p)' : 'var(--border)'}`, background: isMail ? 'var(--p)' : 'var(--bg2)', color: isMail ? '#fff' : 'var(--text3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
            onMouseEnter={e => { if (!isMail) { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--p)'; e.currentTarget.style.borderColor = 'var(--border3)' } }}
            onMouseLeave={e => { if (!isMail) { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--text3)'; e.currentTarget.style.borderColor = 'var(--border)' } }}
          >
            <MailIcon />
          </button>

          {/* Overview */}
          <button
            onClick={() => { selectCustomer(null); setCompanyView(null) }}
            title="Overview"
            style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--p)'; e.currentTarget.style.borderColor = 'var(--border3)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--text3)'; e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <OverviewIcon />
          </button>

          {/* Settings */}
          <button
            onClick={() => { selectCustomer(null); setCompanyView('profil') }}
            title="Settings"
            style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--p)'; e.currentTarget.style.borderColor = 'var(--border3)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--text3)'; e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <CompanyIcon />
          </button>
        </div>
      </aside>
    )
  }

  // ── Full sidebar ──────────────────────────────────────────────────────────
  return (
    <aside style={{
      width: 264, flexShrink: 0, height: '100%',
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg1)', borderRight: '1px solid var(--border)',
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 16px 14px', flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text)' }}>CYNERA </span>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--p)' }}>FOCUS</span>
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 10px', flexShrink: 0 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search clients..."
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 'var(--r-md)',
            background: 'var(--bg2)', border: '1px solid var(--border)',
            color: 'var(--text)', fontSize: 12, fontFamily: 'inherit',
            outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s',
          }}
          onFocus={e => { e.target.style.borderColor = 'rgba(124,58,237,0.4)' }}
          onBlur={e => { e.target.style.borderColor = 'var(--border)' }}
        />
      </div>

      {/* Category filter */}
      <div style={{ padding: '0 12px 10px', flexShrink: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>
          Kategorie
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCatFilter(cat)}
              style={{
                padding: '3px 10px', borderRadius: 'var(--r-pill)',
                border: `1px solid ${catFilter === cat ? 'var(--border3)' : 'var(--border)'}`,
                background: catFilter === cat ? 'var(--p5)' : 'transparent',
                color: catFilter === cat ? 'var(--p)' : 'var(--text3)',
                fontSize: 11, fontWeight: catFilter === cat ? 600 : 400,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
              }}
            >{cat}</button>
          ))}
        </div>
      </div>

      {/* New Client */}
      <div style={{ padding: '0 12px 8px', flexShrink: 0 }}>
        <button
          onClick={onNewClient}
          style={{
            width: '100%', padding: '9px 0', borderRadius: 'var(--r-md)',
            background: 'var(--p)', border: 'none', color: '#fff',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
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

      {/* ── Privat entry ── */}
      {privatCustomer && (
        <div style={{ padding: '0 12px 10px', flexShrink: 0 }}>
          <div
            onClick={() => selectCustomer(PRIVAT_ID)}
            style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '8px 10px', borderRadius: 'var(--r-md)',
              cursor: 'pointer',
              background: privatActive ? 'rgba(100,116,139,0.15)' : 'var(--bg2)',
              border: `1px solid ${privatActive ? 'rgba(100,116,139,0.40)' : 'var(--border)'}`,
              transition: 'background 0.12s, border-color 0.12s',
            }}
            onMouseEnter={e => { if (!privatActive) e.currentTarget.style.background = 'var(--bg3)' }}
            onMouseLeave={e => { if (!privatActive) e.currentTarget.style.background = 'var(--bg2)' }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              background: privatActive ? 'rgba(100,116,139,0.25)' : 'var(--bg3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: privatActive ? '#475569' : 'var(--text3)',
            }}>
              <LockIcon />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: privatActive ? 'var(--text)' : 'var(--text2)', letterSpacing: '-0.01em' }}>
                Privat
              </div>
              <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 1 }}>Persönlicher Bereich</div>
            </div>
            {privatTodos > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--bg3)', color: 'var(--text3)', padding: '2px 7px', borderRadius: 99, flexShrink: 0 }}>
                {privatTodos}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Section label + client list */}
      <div style={{ padding: '0 20px 6px', fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text3)', flexShrink: 0 }}>
        Clients · {publicCustomers.length}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '2px 8px 8px', minHeight: 0 }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text3)', fontSize: 12 }}>
            Keine Kunden
          </div>
        )}
        {filtered.map(c => {
          const openTasks = todos.filter(t => t.customerId === c.id && !t.completed && !t.archived).length
          const unread    = unreadMap[c.id] ?? 0
          const active    = c.id === selectedId
          return (
            <div
              key={c.id}
              onClick={() => selectCustomer(c.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px', borderRadius: 'var(--r-md)',
                cursor: 'pointer', marginBottom: 1,
                background: active ? 'var(--p5)' : 'transparent',
                border: `1px solid ${active ? 'var(--border3)' : 'transparent'}`,
                transition: 'background 0.12s, border-color 0.12s',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg2)' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
            >
              <Avatar name={c.name} id={c.id} size={26} radius={8} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: active ? 600 : 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.name}
                </div>
                {c.category ? (
                  <div style={{ fontSize: 10, color: 'var(--p)', fontWeight: 500 }}>{c.category}</div>
                ) : c.company ? (
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>{c.company}</div>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {unread > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--p)', color: '#fff', padding: '2px 7px', borderRadius: 99 }}>
                    {unread}
                  </span>
                )}
                {openTasks > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, background: active ? 'var(--p6)' : 'var(--bg3)', color: active ? 'var(--p)' : 'var(--text3)', padding: '2px 7px', borderRadius: 99 }}>
                    {openTasks}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Navigation buttons ── */}
      <div style={{ padding: '8px 10px 10px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid var(--border)' }}>
        <NavButton
          label="CRM"
          icon={<CRMIcon />}
          active={isCrm}
          onClick={() => { selectCustomer(null); setCompanyView('crm-kunden') }}
        />
        <NavButton
          label="Mail"
          icon={<MailIcon />}
          active={isMail}
          onClick={() => { selectCustomer(null); setCompanyView('mail') }}
        />
        <NavButton
          label="Overview"
          icon={<OverviewIcon />}
          active={isOverview}
          onClick={() => { selectCustomer(null); setCompanyView(null) }}
        />
        <NavButton
          label="Settings"
          icon={<CompanyIcon />}
          active={isCompany}
          onClick={() => { selectCustomer(null); setCompanyView('profil') }}
        />
      </div>
    </aside>
  )
}
