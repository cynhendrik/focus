import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { CustomerModal } from '@/components/customer/CustomerModal'
import { useState } from 'react'

const STATUS_COLOR: Record<string, string> = {
  lead: 'bg-blue-500',
  aktiv: 'bg-green-500',
  inaktiv: 'bg-gray-400',
  lost: 'bg-red-400',
}

export function OverviewRoute() {
  const customers = useCustomersStore(s => s.customers)
  const setSelected = useUiStore(s => s.setSelectedCustomer)
  const [showModal, setShowModal] = useState(false)

  const aktiv = customers.filter(c => c.status === 'aktiv').length
  const leads = customers.filter(c => c.status === 'lead').length
  const highPrio = customers.filter(c => c.priority === 'high')

  if (customers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5">
        <div className="text-5xl">👋</div>
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-[var(--text)]">Willkommen bei Focus</h1>
          <p className="text-sm text-[var(--text2)] mt-2">Lege deinen ersten Kunden an um loszulegen.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-6 py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary-dark"
        >
          + Ersten Kunden anlegen
        </button>
        {showModal && <CustomerModal onClose={() => setShowModal(false)} />}
      </div>
    )
  }

  return (
    <div className="p-6 flex flex-col gap-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[var(--text)]">Übersicht</h1>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark"
        >
          + Neuer Kunde
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Kunden gesamt', value: customers.length },
          { label: 'Aktiv', value: aktiv },
          { label: 'Leads', value: leads },
        ].map(s => (
          <div key={s.label} className="p-4 rounded-xl bg-[var(--bg1)] border border-[var(--border)]">
            <p className="text-2xl font-bold text-primary">{s.value}</p>
            <p className="text-xs text-[var(--text2)] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* High priority */}
      {highPrio.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wider mb-3">
            🔴 Hohe Priorität
          </h2>
          <div className="flex flex-col gap-2">
            {highPrio.map(c => (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg1)] border border-[var(--border)] hover:border-primary/30 text-left transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary flex-shrink-0">
                  {c.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text)] truncate">{c.name}</p>
                  {c.company && <p className="text-xs text-[var(--text2)] truncate">{c.company}</p>}
                </div>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLOR[c.status] ?? 'bg-gray-400'}`} />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* All customers */}
      <section>
        <h2 className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wider mb-3">
          Alle Kunden
        </h2>
        <div className="flex flex-col gap-2">
          {customers.map(c => (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg1)] border border-[var(--border)] hover:border-primary/30 text-left transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary flex-shrink-0">
                {c.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text)] truncate">{c.name}</p>
                {c.company && <p className="text-xs text-[var(--text2)] truncate">{c.company}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {c.email && <span className="text-xs text-[var(--text2)]">{c.email}</span>}
                <span className={`w-2 h-2 rounded-full ${STATUS_COLOR[c.status] ?? 'bg-gray-400'}`} />
              </div>
            </button>
          ))}
        </div>
      </section>

      {showModal && <CustomerModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
