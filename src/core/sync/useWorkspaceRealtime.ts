import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useFinanceStore } from '@/store/finance.store'
import { useActivitiesStore } from '@/store/activities.store'
import { useNotesStore } from '@/store/notes.store'
import { useTodosStore } from '@/store/todos.store'
import { useDeadlinesStore } from '@/store/deadlines.store'
import { useCrmStore } from '@/store/crm.store'
import { useContactsStore } from '@/store/contacts.store'
import { useDealsStore } from '@/store/deals.store'
import { useCalendarStore } from '@/store/calendar.store'
import { applyAccountsRealtimeChange } from './accountsRealtime'
import { log } from '@/lib/logger'

export function useWorkspaceRealtime() {
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId)
  const workspaces        = useWorkspaceStore(s => s.workspaces)
  const isShared = workspaces.find(w => w.id === activeWorkspaceId)?.isShared ?? false

  useEffect(() => {
    if (!activeWorkspaceId || !isShared) return

    const channel = supabase
      .channel(`ws-accounts-${activeWorkspaceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'accounts', filter: `workspace_id=eq.${activeWorkspaceId}` },
        (payload) => applyAccountsRealtimeChange(payload as any),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contacts', filter: `workspace_id=eq.${activeWorkspaceId}` },
        () => {
          const cs = useContactsStore.getState()
          if (cs.currentAccountId) cs.loadByAccount(cs.currentAccountId)
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deals', filter: `workspace_id=eq.${activeWorkspaceId}` },
        () => {
          const ds = useDealsStore.getState()
          ds.loadAll(activeWorkspaceId)
          if (ds.currentCustomerId) ds.loadForCustomer(ds.currentCustomerId)
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calendar_events', filter: `workspace_id=eq.${activeWorkspaceId}` },
        () => {
          const cal = useCalendarStore.getState()
          cal.load(activeWorkspaceId)
          cal.loadToday(activeWorkspaceId)
        },
      )
      .subscribe((status) => log.info('Realtime accounts channel', { status }))

    const finance = supabase
      .channel(`ws-finance-${activeWorkspaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices', filter: `workspace_id=eq.${activeWorkspaceId}` },
          () => { useFinanceStore.getState().loadAll(activeWorkspaceId); useFinanceStore.getState().loadKpis(activeWorkspaceId) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offers', filter: `workspace_id=eq.${activeWorkspaceId}` },
          () => { useFinanceStore.getState().loadAll(activeWorkspaceId) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `workspace_id=eq.${activeWorkspaceId}` },
          () => { useFinanceStore.getState().loadAll(activeWorkspaceId) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities', filter: `workspace_id=eq.${activeWorkspaceId}` },
          () => {
            const actState = useActivitiesStore.getState()
            actState.loadOpenFollowups(activeWorkspaceId)
            if (actState.currentCustomerId) actState.loadForCustomer(actState.currentCustomerId)
            const notesState = useNotesStore.getState()
            if (notesState.currentCustomerId) notesState.loadForCustomer(notesState.currentCustomerId)
            useTodosStore.getState().loadAll(activeWorkspaceId)
            const todoState = useTodosStore.getState()
            if (todoState.currentCustomerId) todoState.loadForCustomer(todoState.currentCustomerId)
            // Deadlines (= activities type='task') and per-customer follow-ups
            // (crmStore) are separate stores over the same table — keep them fresh too.
            const deadlinesState = useDeadlinesStore.getState()
            if (deadlinesState.currentCustomerId) deadlinesState.loadForCustomer(deadlinesState.currentCustomerId)
            const crmState = useCrmStore.getState()
            if (crmState.currentCustomerId) crmState.loadForCustomer(crmState.currentCustomerId)
          })
      .subscribe()

    return () => { supabase.removeChannel(channel); supabase.removeChannel(finance) }
  }, [activeWorkspaceId, isShared])
}
