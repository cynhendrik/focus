import { supabase } from '@/lib/supabase'
import { PipelineService } from '@/services/pipeline.service'
import { useWorkspaceStore } from '@/store/workspace.store'
import { pipelineStageRowToStage, pipelineStageToRow } from './pipeline-stages.mapper'
import type { PipelineStage, UpsertPipelineStagePayload } from '@/types/pipeline.types'

function shared(): boolean { return useWorkspaceStore.getState().isActiveWorkspaceShared() }
function fail(error: { message?: string; code?: string } | null): never {
  const e = error ?? {}; throw new Error(e.code ? `${e.message ?? 'Supabase-Fehler'} (${e.code})` : (e.message ?? 'Supabase-Fehler'))
}

export const PipelineStagesGateway = {
  async getAll(workspaceId: string): Promise<PipelineStage[]> {
    if (!shared()) return PipelineService.getAll(workspaceId)
    const { data, error } = await supabase.from('pipeline_stages').select('*')
      .eq('workspace_id', workspaceId).order('order_index', { ascending: true })
    if (error) fail(error)
    let stages = (data ?? []).map(pipelineStageRowToStage)
    // Lazy-Migration: Cloud leer → lokal geseedete Stages einmalig hochschieben.
    if (stages.length === 0) {
      const local = await PipelineService.getAll(workspaceId).catch(() => [] as PipelineStage[])
      if (local.length > 0) {
        const up = await supabase.from('pipeline_stages')
          .upsert(local.map(pipelineStageToRow), { onConflict: 'id' }).select('*')
        if (!up.error) stages = (up.data ?? []).map(pipelineStageRowToStage).sort((a, b) => a.orderIndex - b.orderIndex)
      }
    }
    return stages
  },
  async upsert(payload: UpsertPipelineStagePayload): Promise<PipelineStage> {
    if (!shared()) return PipelineService.upsert(payload)
    const id = payload.id ?? crypto.randomUUID()
    const { data, error } = await supabase.from('pipeline_stages')
      .upsert(pipelineStageToRow({ ...payload, id }), { onConflict: 'id' }).select('*').single()
    if (error) fail(error)
    return pipelineStageRowToStage(data)
  },
  async delete(id: string, workspaceId: string): Promise<void> {
    if (!shared()) return PipelineService.delete(id, workspaceId)
    const { error } = await supabase.from('pipeline_stages').delete().eq('id', id)
    if (error) fail(error)
  },
  async reorder(workspaceId: string, orderedIds: string[]): Promise<void> {
    if (!shared()) return PipelineService.reorder(workspaceId, orderedIds)
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await supabase.from('pipeline_stages').update({ order_index: i }).eq('id', orderedIds[i])
      if (error) fail(error)
    }
  },
}
