import { useState } from 'react'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { CustomerModal } from '@/components/customer/CustomerModal'
import { CustomerRoute } from './CustomerRoute'
import type { Customer } from '@/types/customer.types'
import { Search } from 'lucide-react'

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Heute'
  if (days === 1) return 'Gestern'
  return `vor ${days} Tagen`
}

function attentionScore(c: Customer): number {
  let score = 75
  if (c.priority === 'high')   score -= 30
  if (c.status  === 'inaktiv') score -= 20
  if (c.status  === 'lead')    score -= 10
  if (c.status  === 'lost')    score -= 40
  return Math.max(10, Math.min(99, score))
}

function ClientOverviewContent({ customers, onOpen }: { customers: Customer[]; onOpen: (id: string) => void }) {
  const highPrio    = customers.filter(c => c.priority === 'high')
  const needAttn    = customers.filter(c => c.priority === 'high' || c.status === 'inaktiv')
  const aktiv       = customers.filter(c => c.status === 'aktiv')
  const attnSorted  = [...needAttn].sort((a, b) => attentionScore(a) - attentionScore(b)).slice(0, 4)

  const deadlines = [
    { pill: 'Heute',     tone: 'today',   title: 'Brand Guidelines Review',  meta: 'TechCorp · 10:00'  },
    { pill: 'Heute',     tone: 'today',   title: 'Website Deployment',       meta: 'PixelStudio · 14:00' },
    { pill: 'Überfällig', tone: 'overdue', title: 'Budget Discussion',       meta: 'Sunrise Coffee · ASAP' },
  ]

  return (
    <>
      <div className="client-overview-head">
        <h1>Client Overview</h1>
        <div className="sub">Deine wichtigsten Prioritäten auf einen Blick</div>
      </div>

      <div className="stat-grid">
        {[
          { label: 'Gesamt Clients',             value: customers.length,   tone: ''     },
          { label: 'Benötigen Aufmerksamkeit',   value: needAttn.length,    tone: 'warn' },
          { label: 'Urgent Follow-Ups',           value: highPrio.length,    tone: 'warn' },
          { label: 'Aktive Clients',              value: aktiv.length,       tone: ''     },
        ].map(s => (
          <div key={s.label} className="stat-tile" data-tone={s.tone}>
            <span className="label">{s.label}</span>
            <span className="value">{s.value}</span>
          </div>
        ))}
      </div>

      <div className="overview-split">
        <div className="overview-block">
          <h3>Heute wichtig</h3>
          {highPrio.slice(0, 4).map(c => (
            <div key={c.id} className="heute-item" onClick={() => onOpen(c.id)}>
              <div className="top">
                <strong>{c.name}</strong>
                <span className="time-pill" data-tone="">Aufmerksamkeit</span>
              </div>
              <div className="desc">{c.company ?? c.status}</div>
            </div>
          ))}
        </div>
        <div className="overview-block">
          <h3>Clients benötigen Aufmerksamkeit</h3>
          {attnSorted.map(c => (
            <div key={c.id} className="attn-item" onClick={() => onOpen(c.id)}>
              <div className="attn-score" data-tone={attentionScore(c) > 50 ? 'warn' : 'bad'}>
                {attentionScore(c)}
              </div>
              <div className="attn-body">
                <strong>{c.name}</strong>
                <span>{c.company ?? c.status}</span>
              </div>
              <span className="chip" data-tone="bad">urgent</span>
            </div>
          ))}
        </div>
      </div>

      <div className="deadlines-block">
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          Upcoming Deadlines
        </h3>
        <div className="deadlines-grid">
          {deadlines.map((d, i) => (
            <div key={i} className="deadline-card">
              <span className="pill" data-tone={d.tone}>{d.pill}</span>
              <h4>{d.title}</h4>
              <span className="meta">{d.meta}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

export function ClientsRoute() {
  const customers          = useCustomersStore(s => s.customers)
  const isLoading          = useCustomersStore(s => s.isLoading)
  const selectedCustomerId = useUiStore(s => s.selectedCustomerId)
  const setSelected        = useUiStore(s => s.setSelectedCustomer)

  const [search, setSearch]     = useState('')
  const [showModal, setShowModal] = useState(false)

  const filtered = customers.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.company ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="clients-layout">
      {/* Left panel — sticky list */}
      <aside className="clients-panel">
        <div className="clients-panel-head">
          <h2>Clients</h2>
          <div className="client-search">
            <Search size={14} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search clients…"
            />
          </div>
        </div>

        <div
          className="client-tile-overview"
          data-active={String(!selectedCustomerId)}
          onClick={() => setSelected(null)}
        >
          <div className="client-tile-overview-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="9" rx="1.5"/>
              <rect x="14" y="3" width="7" height="5" rx="1.5"/>
              <rect x="14" y="12" width="7" height="9" rx="1.5"/>
              <rect x="3" y="16" width="7" height="5" rx="1.5"/>
            </svg>
          </div>
          <div className="client-tile-overview-text">
            <strong>Overview Dashboard</strong>
            <span>Alle Clients im Überblick</span>
          </div>
        </div>

        <div className="clients-list">
          {isLoading ? (
            <p style={{ fontSize: 12, color: 'var(--fg-dim)', padding: '8px 4px' }}>Lädt…</p>
          ) : (
            filtered.map(c => (
              <div
                key={c.id}
                className="client-tile"
                data-active={String(selectedCustomerId === c.id)}
                onClick={() => setSelected(c.id)}
              >
                <div className="client-tile-avatar">
                  {c.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="client-tile-body">
                  <strong>{c.name}</strong>
                  <span>{relativeTime(c.updatedAt)}</span>
                </div>
                {c.leadScore > 0 && (
                  <span className="client-tile-meta">
                    <span className="chip">{c.leadScore}</span>
                  </span>
                )}
              </div>
            ))
          )}
          {!isLoading && filtered.length === 0 && customers.length === 0 && (
            <button
              className="btn-ghost"
              style={{ fontSize: 12, marginTop: 8, justifyContent: 'center' }}
              onClick={() => setShowModal(true)}
            >
              + Ersten Client anlegen
            </button>
          )}
        </div>
      </aside>

      {/* Right content */}
      <div className="client-content">
        {selectedCustomerId
          ? <CustomerRoute customerId={selectedCustomerId} />
          : <ClientOverviewContent customers={customers} onOpen={setSelected} />
        }
      </div>

      {showModal && <CustomerModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
