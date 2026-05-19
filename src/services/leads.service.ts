import { invoke } from '@tauri-apps/api/core'
import { supabase } from '@/lib/supabase'
import type { Lead, UpsertLeadPayload, BulkUpdateLeadsPayload, PendingLead } from '@/types/lead.types'

function normalizePendingLead(row: PendingLead): UpsertLeadPayload {
  return {
    workspaceId: row.workspace_id,
    name: row.name ?? row.email,
    email: row.email,
    leadSource: row.source,
    leadSourceDetail: row.source_detail ?? undefined,
    leadStatus: 'new',
  }
}

export const LeadsService = {
  getAll(workspaceId: string): Promise<Lead[]> {
    return invoke('get_leads', { workspaceId })
  },

  upsert(payload: UpsertLeadPayload): Promise<Lead> {
    return invoke('upsert_lead', { payload })
  },

  bulkUpdate(payload: BulkUpdateLeadsPayload): Promise<void> {
    return invoke('bulk_update_leads', {
      ids: payload.ids,
      status: payload.status,
      reEngageDate: payload.reEngageDate ?? null,
    })
  },

  convertToClient(id: string): Promise<Lead> {
    return invoke('convert_lead_to_client', { id })
  },

  async syncPending(workspaceId: string): Promise<number> {
    const { data, error } = await supabase
      .from('pending_leads')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('synced', false)
    if (error || !data?.length) return 0
    const leads = data.map(normalizePendingLead)
    const count: number = await invoke('insert_synced_leads', { leads })
    const ids = data.map((r: PendingLead) => r.id)
    await supabase.from('pending_leads').update({ synced: true }).in('id', ids)
    return count
  },
}
