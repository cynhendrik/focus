import { useCustomersStore } from '@/store/customers.store'

export function OverviewRoute() {
  const upsert = useCustomersStore(s => s.upsert)

  const addTestCustomer = () => upsert({
    name: 'Muster GmbH',
    company: 'Muster AG',
    status: 'aktiv',
    priority: 'high',
    tags: ['vip'],
  })

  return (
    <div className="flex-1 flex flex-col items-center justify-center h-full gap-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-[var(--text)]">Focus</h1>
        <p className="mt-2 text-[var(--text2)]">Wähle einen Kunden aus der Sidebar</p>
      </div>
      <button
        onClick={addTestCustomer}
        className="px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark transition-colors"
      >
        Test-Kunde anlegen
      </button>
    </div>
  )
}
