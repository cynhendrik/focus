import { useEffect } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { Sidebar } from '@/components/layout/Sidebar'
import { CustomerRoute } from '@/routes/CustomerRoute'
import { OverviewRoute } from '@/routes/OverviewRoute'
import { CompanyRoute } from '@/routes/CompanyRoute'
import { MailRoute } from '@/routes/MailRoute'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { MigrationWizard } from '@/components/migration/MigrationWizard'
import { CommandPalette } from '@/components/CommandPalette'

export default function App() {
  const init = useCustomersStore(s => s.init)
  const selectedCustomerId = useUiStore(s => s.selectedCustomerId)
  const appView = useUiStore(s => s.appView)
  const cmdOpen = useUiStore(s => s.cmdPaletteOpen)
  const setCmdOpen = useUiStore(s => s.setCmdPaletteOpen)

  useEffect(() => {
    init()
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [init])

  const renderMain = () => {
    if (appView === 'company') return <CompanyRoute />
    if (appView === 'mail') return <MailRoute />
    if (selectedCustomerId) return <CustomerRoute customerId={selectedCustomerId} />
    return <OverviewRoute />
  }

  return (
    <AppShell>
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <ErrorBoundary>
            {renderMain()}
          </ErrorBoundary>
        </main>
      </div>
      <MigrationWizard />
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </AppShell>
  )
}
