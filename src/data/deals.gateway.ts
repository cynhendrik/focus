import { supabase } from '@/lib/supabase'
import { DealsService } from '@/services/deals.service'
import { useWorkspaceStore } from '@/store/workspace.store'
import { dealRowToDeal, dealPayloadToRow } from './deals.mapper'
import type { Deal, UpsertDealPayload } from '@/types/pipeline.types'

function shared(): boolean {
  return useWorkspaceStore.getState().isActiveWorkspaceShared()
}
function fail(error: { message?: string; details?: string; hint?: string; code?: string } | null): never {
  const e = error ?? {}
  const msg = [e.message, e.details, e.hint].filter(Boolean).join(' — ') || 'Unbekannter Supabase-Fehler'
  throw new Error(e.code ? `${msg} (${e.code})` : msg)
}

export const DealsGateway = {
  async getByWorkspace(workspaceId: string): Promise<Deal[]> {
    if (!shared()) return DealsService.getByWorkspace(workspaceId)
    const { data, error } = await supabase.from('deals').select('*')
      .eq('workspace_id', workspaceId).order('created_at', { ascending: false })
    if (error) fail(error)
    return (data ?? []).map(dealRowToDeal)
  },

  async getByCustomer(customerId: string): Promise<Deal[]> {
    if (!shared()) return DealsService.getByCustomer(customerId)
    const { data, error } = await supabase.from('deals').select('*')
      .eq('customer_id', customerId).order('created_at', { ascending: false })
    if (error) fail(error)
    return (data ?? []).map(dealRowToDeal)
  },

  async upsert(payload: UpsertDealPayload): Promise<Deal> {
    if (!shared()) return DealsService.upsert(payload)
    const id = payload.id ?? crypto.randomUUID()
    const now = new Date().toISOString()
    const row = dealPayloadToRow(payload, { id, now })
    const { data, error } = await supabase.from('deals').upsert(row, { onConflict: 'id' }).select('*').single()
    if (error) fail(error)
    return dealRowToDeal(data)
  },

  async updateStage(id: string, stage: string): Promise<Deal> {
    if (!shared()) return DealsService.updateStage(id, stage)
    const now = new Date().toISOString()
    const { data, error } = await supabase.from('deals')
      .update({ stage, updated_at: now }).eq('id', id).select('*').single()
    if (error) fail(error)
    return dealRowToDeal(data)
  },

  async delete(id: string): Promise<void> {
    if (!shared()) { await DealsService.delete(id); return }
    const { error } = await supabase.from('deals').delete().eq('id', id)
    if (error) fail(error)
  },
}
