import { useEffect } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { NavSidebar } from '@/components/layout/NavSidebar'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { CommandPalette } from '@/components/CommandPalette'

import { DashboardRoute }  from '@/routes/DashboardRoute'
import { ClientsRoute }    from '@/routes/ClientsRoute'
import { CustomerRoute }   from '@/routes/CustomerRoute'
import { InvoicesRoute }   from '@/routes/InvoicesRoute'
import { TasksRoute }      from '@/routes/TasksRoute'
import { KpisRoute }       from '@/routes/KpisRoute'
import { InsightsRoute }   from '@/routes/InsightsRoute'
import { CalendarRoute }   from '@/routes/CalendarRoute'
import { MailRoute }       from '@/routes/MailRoute'
import { CrmRoute }        from '@/routes/CrmRoute'
import { SettingsRoute }   from '@/routes/SettingsRoute'
import { ProfileRoute }    from '@/routes/ProfileRoute'

export default function App() {
  const init = useCustomersStore(s => s.init)
  const selectedCustomerId = useUiStore(s => s.selectedCustomerId)
  const appView = useUiStore(s => s.appView)
  const cmdOpen = useUiStore(s => s.cmdPaletteOpen)
  const setCmdPaletteOpen = useUiStore(s => s.setCmdPaletteOpen)

  useEffect(() => { init() }, [init])

  const renderMain = () => {
    if (selectedCustomerId && appView === 'clients') return <CustomerRoute customerId={selectedCustomerId} />
    switch (appView) {
      case 'dashboard':  return <DashboardRoute />
      case 'profile':    return <ProfileRoute />
      case 'clients':    return <ClientsRoute />
      case 'invoices':   return <InvoicesRoute />
      case 'tasks':      return <TasksRoute />
      case 'kpis':       return <KpisRoute />
      case 'insights':   return <InsightsRoute />
      case 'calendar':   return <CalendarRoute />
      case 'mail':       return <MailRoute />
      case 'crm':        return <CrmRoute />
      case 'settings':   return <SettingsRoute />
      default:           return <DashboardRoute />
    }
  }

  return (
    <AppShell>
      <div className="flex flex-1 overflow-hidden">
        <NavSidebar />
        <main className="flex-1 overflow-auto">
          <ErrorBoundary>
            {renderMain()}
          </ErrorBoundary>
        </main>
      </div>
      {cmdOpen && <CommandPalette open={cmdOpen} onClose={() => setCmdPaletteOpen(false)} />}
    </AppShell>
  )
}
