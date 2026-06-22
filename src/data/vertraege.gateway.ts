import { supabase } from '@/lib/supabase'
import { VertraegeService, type ContractRow } from '@/services/vertraege.service'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { vertragRowToContract, vertragPayloadToRow } from './vertraege.mapper'

function shared(): boolean {
  return useWorkspaceStore.getState().isActiveWorkspaceShared()
}
function fail(error: { message?: string; details?: string; hint?: string; code?: string } | null): never {
  const e = error ?? {}
  const msg = [e.message, e.details, e.hint].filter(Boolean).join(' — ') || 'Unbekannter Supabase-Fehler'
  throw new Error(e.code ? `${msg} (${e.code})` : msg)
}

export const VertraegeGateway = {
  async getAll(workspaceId: string): Promise<ContractRow[]> {
    if (!shared()) return VertraegeService.getAll(workspaceId)
    const { data, error } = await supabase.from('vertraege').select('*')
      .eq('workspace_id', workspaceId).order('created_at', { ascending: false })
    if (error) fail(error)
    return (data ?? []).map(vertragRowToContract)
  },

  async upsert(payload: ContractRow): Promise<ContractRow> {
    if (!shared()) return VertraegeService.upsert(payload)
    const createdBy = useAuthStore.getState().user?.id ?? ''
    const row = vertragPayloadToRow(payload, { createdBy })
    const { data, error } = await supabase.from('vertraege').upsert(row, { onConflict: 'id' }).select('*').single()
    if (error) fail(error)
    return vertragRowToContract(data)
  },

  async delete(id: string): Promise<void> {
    if (!shared()) { await VertraegeService.delete(id); return }
    const { error } = await supabase.from('vertraege').delete().eq('id', id)
    if (error) fail(error)
  },
}
