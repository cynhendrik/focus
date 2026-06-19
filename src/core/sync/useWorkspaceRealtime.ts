import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useLeadsStore } from '@/store/leads.store'
import { useFinanceStore } from '@/store/finance.store'
import { accountRowToLead } from '@/data/accounts.mapper'
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
        (payload) => {
          const newRow: any = payload.new
          const oldRow: any = payload.old
          // Entfernen: gelöscht ODER kein Lead mehr (z. B. zu 'client' konvertiert).
          if (payload.eventType === 'DELETE' || (newRow && newRow.account_type !== 'lead')) {
            const goneId = newRow?.id ?? oldRow?.id
            if (goneId) useLeadsStore.setState(s => ({ leads: s.leads.filter(l => l.id !== goneId) }))
            return
          }
          if (newRow && newRow.account_type === 'lead') {
            const lead = accountRowToLead(newRow)
            useLeadsStore.setState(s => {
              const exists = s.leads.some(l => l.id === lead.id)
              return {
                leads: exists ? s.leads.map(l => l.id === lead.id ? lead : l) : [lead, ...s.leads],
              }
            })
          }
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
      .subscribe()

    return () => { supabase.removeChannel(channel); supabase.removeChannel(finance) }
  }, [activeWorkspaceId, isShared])
}
