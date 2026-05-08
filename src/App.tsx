import { useEffect } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { Sidebar } from '@/components/layout/Sidebar'
import { CustomerRoute } from '@/routes/CustomerRoute'
import { OverviewRoute } from '@/routes/OverviewRoute'

export default function App() {
  const init = useCustomersStore(s => s.init)
  const selectedCustomerId = useUiStore(s => s.selectedCustomerId)

  useEffect(() => {
    init()
  }, [init])

  return (
    <AppShell>
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          {selectedCustomerId ? (
            <CustomerRoute customerId={selectedCustomerId} />
          ) : (
            <OverviewRoute />
          )}
        </main>
      </div>
    </AppShell>
  )
}
