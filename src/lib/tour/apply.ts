import { useCustomersStore } from '@/store/customers.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useTodosStore } from '@/store/todos.store'
import { useFinanceStore } from '@/store/finance.store'
import { useLeadsStore } from '@/store/leads.store'
import { useCrmStore } from '@/store/crm.store'
import { useActivitiesStore } from '@/store/activities.store'
import {
  tourCustomers, tourAccounts, tourTodos, tourInvoices, tourKpis, tourLeads, tourFollowUps, tourActivities,
} from './fixtures'

/** Schau-Daten NUR im Speicher in die Stores setzen — kein Gateway, nichts persistiert. */
export function applyTourFixtures(): void {
  useCustomersStore.setState({ customers: tourCustomers } as any)
  useAccountsStore.setState({ accounts: tourAccounts } as any)
  useTodosStore.setState({ todos: tourTodos, allTodos: tourTodos } as any)
  useFinanceStore.setState({ invoices: tourInvoices, kpis: tourKpis } as any)
  useLeadsStore.setState({ leads: tourLeads } as any)
  useCrmStore.setState({ followUps: tourFollowUps, allFollowUps: tourFollowUps } as any)
  useActivitiesStore.setState({ activities: tourActivities } as any)
}

/** Tour-Daten verwerfen + echte (im frischen Workspace leere) Daten zurückladen. */
export function clearTourFixtures(workspaceId: string): void {
  useCustomersStore.setState({ customers: [] } as any)
  useAccountsStore.setState({ accounts: [] } as any)
  useTodosStore.setState({ todos: [], allTodos: [] } as any)
  useFinanceStore.setState({ invoices: [], kpis: null } as any)
  useLeadsStore.setState({ leads: [] } as any)
  useCrmStore.setState({ followUps: [], allFollowUps: [] } as any)
  useActivitiesStore.setState({ activities: [] } as any)
  // Echte Daten neu laden (mirror App.tsx Lade-Welle 1 + Finanzen).
  // Echte Loader-Namen aus stores/App.tsx verifiziert:
  //   useAccountsStore    → init()
  //   useCustomersStore   → init()
  //   useCrmStore         → loadAll(workspaceId)
  //   useTodosStore       → loadAll(workspaceId)
  //   useFinanceStore     → loadAll(workspaceId) + loadKpis(workspaceId)
  //   useLeadsStore       → load(workspaceId)  (nicht loadLeads)
  ;(useAccountsStore.getState() as any).init?.()
  ;(useCustomersStore.getState() as any).init?.()
  ;(useCrmStore.getState() as any).loadAll?.(workspaceId)
  ;(useTodosStore.getState() as any).loadAll?.(workspaceId)
  const fin = useFinanceStore.getState() as any
  fin.loadAll?.(workspaceId)
  fin.loadKpis?.(workspaceId)
  ;(useLeadsStore.getState() as any).load?.(workspaceId)
}
