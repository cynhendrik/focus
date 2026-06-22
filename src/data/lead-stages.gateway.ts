import { supabase } from '@/lib/supabase'
import { LeadStagesService } from '@/services/lead-stages.service'
import { useWorkspaceStore } from '@/store/workspace.store'
import { leadStageRowToStage, leadStageToRow } from './lead-stages.mapper'
import type { LeadStage, UpsertLeadStagePayload } from '@/types/lead.types'

function shared(): boolean { return useWorkspaceStore.getState().isActiveWorkspaceShared() }
function fail(error: { message?: string; code?: string } | null): never {
  const e = error ?? {}; throw new Error(e.code ? `${e.message ?? 'Supabase-Fehler'} (${e.code})` : (e.message ?? 'Supabase-Fehler'))
}

export const LeadStagesGateway = {
  async getAll(workspaceId: string): Promise<LeadStage[]> {
    if (!shared()) return LeadStagesService.getAll(workspaceId)
    const { data, error } = await supabase.from('lead_stages').select('*')
      .eq('workspace_id', workspaceId).order('order_index', { ascending: true })
    if (error) fail(error)
    let stages = (data ?? []).map(leadStageRowToStage)
    // Lazy-Migration: Cloud leer → lokal geseedete Stages einmalig hochschieben.
    if (stages.length === 0) {
      const local = await LeadStagesService.getAll(workspaceId).catch(() => [] as LeadStage[])
      if (local.length > 0) {
        const up = await supabase.from('lead_stages')
          .upsert(local.map(leadStageToRow), { onConflict: 'id' }).select('*')
        if (!up.error) stages = (up.data ?? []).map(leadStageRowToStage).sort((a, b) => a.orderIndex - b.orderIndex)
      }
    }
    return stages
  },
  async upsert(payload: UpsertLeadStagePayload): Promise<LeadStage> {
    if (!shared()) return LeadStagesService.upsert(payload)
    const id = payload.id ?? crypto.randomUUID()
    const { data, error } = await supabase.from('lead_stages')
      .upsert(leadStageToRow({ ...payload, id }), { onConflict: 'id' }).select('*').single()
    if (error) fail(error)
    return leadStageRowToStage(data)
  },
  async delete(id: string, workspaceId: string): Promise<void> {
    if (!shared()) return LeadStagesService.delete(id, workspaceId)
    const { error } = await supabase.from('lead_stages').delete().eq('id', id)
    if (error) fail(error)
  },
  async reorder(workspaceId: string, orderedIds: string[]): Promise<void> {
    if (!shared()) return LeadStagesService.reorder(workspaceId, orderedIds)
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await supabase.from('lead_stages').update({ order_index: i }).eq('id', orderedIds[i])
      if (error) fail(error)
    }
  },
}
