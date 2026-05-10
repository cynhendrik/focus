import { CrmPane } from '@/components/crm/CrmPane'
import { useCustomersStore } from '@/store/customers.store'

export function CrmRoute() {
  const customers = useCustomersStore(s => s.customers)
  const first = customers[0]

  if (!first) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-[var(--text2)]">Keine Clients vorhanden</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4 border-b border-[var(--border)]">
        <h1 className="text-lg font-semibold text-[var(--text)]">CRM</h1>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <CrmPane customerId={first.id} />
      </div>
    </div>
  )
}
