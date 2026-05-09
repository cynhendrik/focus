import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { CustomerCard } from '@/components/customer/CustomerCard'

export function Sidebar() {
  const customers = useCustomersStore(s => s.customers)
  const isLoading = useCustomersStore(s => s.isLoading)
  const selectedId = useUiStore(s => s.selectedCustomerId)
  const appView = useUiStore(s => s.appView)
  const focusMode = useUiStore(s => s.focusMode)
  const setSelected = useUiStore(s => s.setSelectedCustomer)
  const setAppView = useUiStore(s => s.setAppView)
  const toggleFocusMode = useUiStore(s => s.toggleFocusMode)

  const visibleCustomers = focusMode
    ? customers.filter(c => c.priority === 'high')
    : customers

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col border-r border-[var(--border)] bg-[var(--bg)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--text2)] uppercase tracking-wider">
          {focusMode ? '🎯 Fokus' : 'Kunden'}
        </h2>
        <button
          onClick={toggleFocusMode}
          title={focusMode ? 'Fokus-Modus beenden' : 'Fokus-Modus aktivieren'}
          className={`text-xs px-2 py-0.5 rounded-full transition-colors
            ${focusMode ? 'bg-primary text-white' : 'text-[var(--text2)] hover:text-primary'}`}
        >
          {focusMode ? 'Beenden' : 'Fokus'}
        </button>
      </div>

      {focusMode && (
        <div className="px-3 py-2 bg-primary/10 border-b border-[var(--border)]">
          <p className="text-xs text-primary">Nur Kunden mit hoher Priorität</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="px-3 py-2 text-sm text-[var(--text2)]">Lädt…</div>
        ) : visibleCustomers.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-[var(--text2)]">
            {focusMode ? 'Keine Kunden mit hoher Priorität' : 'Noch keine Kunden'}
          </div>
        ) : (
          visibleCustomers.map(customer => (
            <CustomerCard
              key={customer.id}
              customer={customer}
              isSelected={selectedId === customer.id}
              onClick={setSelected}
            />
          ))
        )}
      </div>

      <div className="p-2 border-t border-[var(--border)] flex flex-col gap-1">
        <button
          onClick={() => setAppView('mail')}
          className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors
            ${appView === 'mail' ? 'bg-primary text-white' : 'text-[var(--text2)] hover:bg-[var(--bg1)]'}`}
        >
          E-Mails
        </button>
        <button
          onClick={() => setAppView('company')}
          className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors
            ${appView === 'company' ? 'bg-primary text-white' : 'text-[var(--text2)] hover:bg-[var(--bg1)]'}`}
        >
          Mein Unternehmen
        </button>
      </div>
    </aside>
  )
}
