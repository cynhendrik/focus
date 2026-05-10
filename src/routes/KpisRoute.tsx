import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'

export function KpisRoute() {
  const customers = useCustomersStore(s => s.customers)
  const setSelected = useUiStore(s => s.setSelectedCustomer)
  const aktiv = customers.filter(c => c.status === 'aktiv')

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4 border-b border-[var(--border)]">
        <h1 className="text-lg font-semibold text-[var(--text)]">KPIs</h1>
        <p className="text-xs text-[var(--text2)] mt-1">Wähle einen Client für detaillierte KPIs</p>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-2 max-w-2xl">
          {aktiv.map(c => (
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
              <span className="text-xs text-[var(--text2)]">KPIs →</span>
            </button>
          ))}
          {aktiv.length === 0 && (
            <p className="text-sm text-[var(--text2)] text-center py-16">Keine aktiven Clients</p>
          )}
        </div>
      </div>
    </div>
  )
}
