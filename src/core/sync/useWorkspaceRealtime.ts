import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useFinanceStore } from '@/store/finance.store'
import { useActivitiesStore } from '@/store/activities.store'
import { useNotesStore } from '@/store/notes.store'
import { useTodosStore } from '@/store/todos.store'
import { useDeadlinesStore } from '@/store/deadlines.store'
import { useCrmStore } from '@/store/crm.store'
import { useTimeStore } from '@/store/time.store'
import { useContactsStore } from '@/store/contacts.store'
import { useDealsStore } from '@/store/deals.store'
import { useCalendarStore } from '@/store/calendar.store'
import { useVertraege } from '@/store/vertraege.store'
import { useAuftraege } from '@/store/auftraege.store'
import { usePipelineStore } from '@/store/pipeline.store'
import { useLeadStagesStore } from '@/store/lead-stages.store'
import { useNotesModuleStore } from '@/store/notes-module.store'
import { useCompanyStore } from '@/store/company.store'
import { useMessagesStore } from '@/store/messages.store'
import { useNotificationsStore } from '@/store/notifications.store'
import { messageRowToMessage } from '@/data/messages.mapper'
import { notificationRowToNotification } from '@/data/notifications.mapper'
import { useAuthStore } from '@/store/auth.store'
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pipeline_stages', filter: `workspace_id=eq.${activeWorkspaceId}` },
        () => { usePipelineStore.getState().load(activeWorkspaceId) },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lead_stages', filter: `workspace_id=eq.${activeWorkspaceId}` },
        () => { useLeadStagesStore.getState().load(activeWorkspaceId) },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workspace_members', filter: `workspace_id=eq.${activeWorkspaceId}` },
        // Rollen-/Capability-Änderung (RBAC) live übernehmen — lädt role+capabilities neu.
        () => { useWorkspaceStore.getState().loadWorkspaces() },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'note_entries', filter: `workspace_id=eq.${activeWorkspaceId}` },
        () => { const ns = useNotesModuleStore.getState(); if (ns.activeAccountId) ns.loadForAccount(ns.activeAccountId) },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'note_folders', filter: `workspace_id=eq.${activeWorkspaceId}` },
        () => { const ns = useNotesModuleStore.getState(); if (ns.activeAccountId) ns.loadForAccount(ns.activeAccountId) },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'company_settings', filter: `workspace_id=eq.${activeWorkspaceId}` },
        () => { useCompanyStore.getState().load() },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `workspace_id=eq.${activeWorkspaceId}` },
        (payload) => { useMessagesStore.getState().appendRealtime(messageRowToMessage(payload.new as any)) },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${useAuthStore.getState().user?.id ?? ''}` },
        (payload) => {
          if (payload.eventType === 'DELETE') return
          useNotificationsStore.getState().upsertRealtime(notificationRowToNotification(payload.new as any))
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vertraege', filter: `workspace_id=eq.${activeWorkspaceId}` },
          () => { useVertraege.getState().loadVertraege(activeWorkspaceId) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auftraege', filter: `workspace_id=eq.${activeWorkspaceId}` },
          () => { useAuftraege.getState().loadAuftraege(activeWorkspaceId) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zeiteintraege', filter: `workspace_id=eq.${activeWorkspaceId}` },
          () => { useAuftraege.getState().loadAuftraege(activeWorkspaceId) })
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
            const timeState = useTimeStore.getState()
            if (timeState.currentCustomerId) timeState.loadForCustomer(timeState.currentCustomerId)
          })
      .subscribe()

    return () => { supabase.removeChannel(channel); supabase.removeChannel(finance) }
  }, [activeWorkspaceId, isShared])
}
