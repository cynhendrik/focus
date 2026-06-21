import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useFinanceStore } from '@/store/finance.store'
import { useActivitiesStore } from '@/store/activities.store'
import { useNotesStore } from '@/store/notes.store'
import { useTodosStore } from '@/store/todos.store'
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
          })
      .subscribe()

    return () => { supabase.removeChannel(channel); supabase.removeChannel(finance) }
  }, [activeWorkspaceId, isShared])
}
