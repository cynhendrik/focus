import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { CustomerCard } from '@/components/customer/CustomerCard'

export function Sidebar() {
  const customers = useCustomersStore(s => s.customers)
  const isLoading = useCustomersStore(s => s.isLoading)
  const selectedId = useUiStore(s => s.selectedCustomerId)
  const setSelected = useUiStore(s => s.setSelectedCustomer)

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col border-r border-[var(--border)] bg-[var(--bg)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <h2 className="text-sm font-semibold text-[var(--text2)] uppercase tracking-wider">
          Kunden
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="px-3 py-2 text-sm text-[var(--text2)]">Lädt…</div>
        ) : customers.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-[var(--text2)]">
            Noch keine Kunden
          </div>
        ) : (
          customers.map(customer => (
            <CustomerCard
              key={customer.id}
              customer={customer}
              isSelected={selectedId === customer.id}
              onClick={setSelected}
            />
          ))
        )}
      </div>
    </aside>
  )
}
