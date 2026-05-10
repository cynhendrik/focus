import { useState } from 'react'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { CustomerModal } from '@/components/customer/CustomerModal'

const STATUS_COLOR: Record<string, string> = {
  lead: 'bg-blue-500/10 text-blue-400',
  aktiv: 'bg-green-500/10 text-green-400',
  inaktiv: 'bg-gray-400/10 text-gray-400',
  lost: 'bg-red-500/10 text-red-400',
}
const STATUS_LABEL: Record<string, string> = {
  lead: 'Lead', aktiv: 'Aktiv', inaktiv: 'Inaktiv', lost: 'Lost',
}

export function ClientsRoute() {
  const customers = useCustomersStore(s => s.customers)
  const isLoading = useCustomersStore(s => s.isLoading)
  const setSelected = useUiStore(s => s.setSelectedCustomer)
  const focusMode = useUiStore(s => s.focusMode)

  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)

  const filtered = customers
    .filter(c => focusMode ? c.priority === 'high' : true)
    .filter(c =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.company ?? '').toLowerCase().includes(search.toLowerCase())
    )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-[var(--border)] flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-[var(--text)]">Clients</h1>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors"
        >
          + Neuer Client
        </button>
      </div>

      {/* Search */}
      <div className="px-6 py-3 border-b border-[var(--border)]">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Clients suchen…"
          className="w-full text-sm px-4 py-2 rounded-xl bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <p className="text-sm text-[var(--text2)]">Lädt…</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-[var(--text2)] text-sm">
              {customers.length === 0 ? 'Noch keine Clients' : 'Keine Treffer'}
            </p>
            {customers.length === 0 && (
              <button
                onClick={() => setShowModal(true)}
                className="mt-4 px-5 py-2 rounded-xl bg-primary text-white text-sm hover:bg-primary-dark"
              >
                + Ersten Client anlegen
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-w-2xl">
            {filtered.map(c => (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className="flex items-center gap-4 p-4 rounded-xl bg-[var(--bg1)] border border-[var(--border)] hover:border-primary/30 text-left transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
                  {c.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text)] truncate">{c.name}</p>
                  {c.company && <p className="text-xs text-[var(--text2)] truncate">{c.company}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[c.status] ?? ''}`}>
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                  {c.priority === 'high' && (
                    <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {showModal && <CustomerModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
