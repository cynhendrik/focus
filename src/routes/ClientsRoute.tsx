import { useState } from 'react'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { CustomerModal } from '@/components/customer/CustomerModal'
import { CustomerRoute } from './CustomerRoute'
import type { Customer } from '@/types/customer.types'

function avatarBg(name: string): string {
  const palette = ['bg-blue-600', 'bg-violet-600', 'bg-emerald-700', 'bg-orange-600', 'bg-pink-600', 'bg-teal-600']
  let h = 0
  for (const c of name) h += c.charCodeAt(0)
  return palette[h % palette.length]
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

function scoreColor(score: number): string {
  if (score >= 70) return '#D0FC69'
  if (score >= 40) return '#f59e0b'
  return '#ef4444'
}

function StatCard({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="flex-1 p-5 rounded-2xl bg-[var(--bg1)] border border-[var(--border)] flex flex-col gap-1 min-w-0">
      <p className="text-xs text-[var(--text2)]">{label}</p>
      <p className="text-4xl font-bold text-[var(--text)]">{value}</p>
      <p className="text-xs text-[var(--text2)]">{sub}</p>
    </div>
  )
}

function ClientOverview({ customers }: { customers: Customer[] }) {
  const setSelected = useUiStore(s => s.setSelectedCustomer)
  const needAttention = customers.filter(c => c.priority === 'high' || c.status === 'inaktiv')
  const highPrio      = customers.filter(c => c.priority === 'high')
  const aktiv         = customers.filter(c => c.status === 'aktiv')

  return (
    <div className="h-full overflow-y-auto p-8 flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--text)]">Client Overview</h1>
        <p className="text-sm text-[var(--text2)] mt-1">Deine wichtigsten Prioritäten auf einen Blick</p>
      </div>

      {/* Stats */}
      <div className="flex gap-4">
        <StatCard label="Gesamt Clients"           value={customers.length}      sub="Clients" />
        <StatCard label="Benötigen Aufmerksamkeit" value={needAttention.length}  sub="Kunden" />
        <StatCard label="High Priority"            value={highPrio.length}       sub="Kunden" />
        <StatCard label="Aktive Clients"           value={aktiv.length}          sub="Aktiv" />
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Heute wichtig */}
        <div className="p-5 rounded-2xl bg-[var(--bg1)] border border-[var(--border)]">
          <div className="flex items-center gap-2 mb-4">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text2)]">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
            </svg>
            <h2 className="text-sm font-semibold text-[var(--text)]">Heute wichtig</h2>
          </div>
          {highPrio.length === 0 ? (
            <p className="text-sm text-[var(--text2)]">Keine dringenden Einträge</p>
          ) : (
            <div className="flex flex-col gap-2">
              {highPrio.slice(0, 4).map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelected(c.id)}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--bg)] transition-colors text-left w-full border-l-2 border-primary/40"
                >
                  <span className="text-sm font-medium text-[var(--text)] truncate">{c.name}</span>
                  <span className="text-xs text-[var(--text2)] ml-auto flex-shrink-0">{c.company ?? c.status}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Clients benötigen Aufmerksamkeit */}
        <div className="p-5 rounded-2xl bg-[var(--bg1)] border border-[var(--border)]">
          <div className="flex items-center gap-2 mb-4">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text2)]">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
            </svg>
            <h2 className="text-sm font-semibold text-[var(--text)]">Clients benötigen Aufmerksamkeit</h2>
          </div>
          {needAttention.length === 0 ? (
            <p className="text-sm text-[var(--text2)]">Alles im grünen Bereich 🎉</p>
          ) : (
            <div className="flex flex-col gap-3">
              {needAttention.slice(0, 4).map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelected(c.id)}
                  className="flex items-center gap-3 w-full text-left hover:bg-[var(--bg)] rounded-xl p-1 -mx-1 transition-colors"
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${avatarBg(c.name)}`}>
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text)] truncate">{c.name}</p>
                    {c.company && <p className="text-xs text-[var(--text2)] truncate">{c.company}</p>}
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 flex-shrink-0">
                    {c.priority === 'high' ? 'urgent' : c.status}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function ClientsRoute() {
  const customers          = useCustomersStore(s => s.customers)
  const isLoading          = useCustomersStore(s => s.isLoading)
  const selectedCustomerId = useUiStore(s => s.selectedCustomerId)
  const setSelected        = useUiStore(s => s.setSelectedCustomer)

  const [search, setSearch]   = useState('')
  const [showModal, setShowModal] = useState(false)

  const filtered = customers.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.company ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex h-full">
      {/* Client list sidebar */}
      <div className="w-60 flex-shrink-0 border-r border-[var(--border)] flex flex-col bg-[var(--bg)]">
        {/* Header */}
        <div className="px-4 pt-5 pb-3 flex items-center justify-between flex-shrink-0">
          <h2 className="text-base font-semibold text-[var(--text)]">Clients</h2>
          <button
            onClick={() => setShowModal(true)}
            className="w-6 h-6 rounded-lg bg-primary text-black text-sm font-bold flex items-center justify-center hover:bg-primary-dark leading-none"
          >
            +
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pb-2 flex-shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--bg1)] border border-[var(--border)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text2)] flex-shrink-0">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search clients..."
              className="flex-1 text-sm bg-transparent text-[var(--text)] focus:outline-none placeholder:text-[var(--text2)]"
            />
          </div>
        </div>

        {/* Overview Dashboard item */}
        <div className="px-3 pb-2 flex-shrink-0">
          <button
            onClick={() => setSelected(null)}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors
              ${!selectedCustomerId
                ? 'bg-primary text-black'
                : 'text-[var(--text2)] hover:bg-[var(--bg1)]'
              }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 20V10M12 20V4M6 20v-6" />
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">Overview Dashboard</p>
              <p className={`text-xs truncate ${!selectedCustomerId ? 'opacity-70' : 'text-[var(--text2)]'}`}>
                Alle Clients im Überblick
              </p>
            </div>
          </button>
        </div>

        {/* Client list */}
        <div className="flex-1 overflow-y-auto px-3 pb-3 flex flex-col gap-0.5">
          {isLoading ? (
            <p className="text-xs text-[var(--text2)] px-2 pt-1">Lädt…</p>
          ) : filtered.map(c => (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors
                ${selectedCustomerId === c.id
                  ? 'bg-[var(--bg1)] border border-[var(--border)]'
                  : 'hover:bg-[var(--bg1)]'
                }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 ${avatarBg(c.name)}`}>
                {c.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--text)] truncate">{c.name}</p>
                <div className="flex items-center justify-between gap-1">
                  <p className="text-xs text-[var(--text2)] truncate">{relativeTime(c.updatedAt)}</p>
                  {c.leadScore > 0 && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                      style={{
                        background: scoreColor(c.leadScore) + '22',
                        color: scoreColor(c.leadScore),
                      }}
                    >
                      {c.leadScore}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
          {!isLoading && filtered.length === 0 && customers.length === 0 && (
            <button
              onClick={() => setShowModal(true)}
              className="mt-2 w-full text-xs text-primary hover:underline text-left px-2"
            >
              + Ersten Client anlegen
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {selectedCustomerId
          ? <CustomerRoute customerId={selectedCustomerId} />
          : <ClientOverview customers={customers} />
        }
      </div>

      {showModal && <CustomerModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
