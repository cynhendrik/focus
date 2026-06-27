import { invoke } from '@tauri-apps/api/core'
import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { kpiRowToKpi, kpiPayloadToRow } from './kpis.mapper'
import type { Kpi, UpsertKpiPayload } from '@/types/kpi.types'

function shared(): boolean { return useWorkspaceStore.getState().isActiveWorkspaceShared() }
function fail(error: { message?: string; details?: string; hint?: string; code?: string } | null): never {
  const e = error ?? {}
  const msg = [e.message, e.details, e.hint].filter(Boolean).join(' — ') || 'Unbekannter Supabase-Fehler'
  throw new Error(e.code ? `${msg} (${e.code})` : msg)
}

export const KpisGateway = {
  async getByCustomer(accountId: string): Promise<Kpi[]> {
    if (!shared()) return invoke<Kpi[]>('get_kpis', { customerId: accountId })
    const { data, error } = await supabase.from('kpis').select('*').eq('account_id', accountId)
    if (error) fail(error)
    return (data ?? []).map(kpiRowToKpi)
  },

  async upsert(payload: UpsertKpiPayload): Promise<Kpi> {
    if (!shared()) return invoke<Kpi>('upsert_kpi', { payload })
    const id = payload.id ?? crypto.randomUUID()
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    const createdBy = useAuthStore.getState().user?.id ?? ''
    const row = kpiPayloadToRow(payload, { id, workspaceId, createdBy, now: new Date().toISOString() })
    const { data, error } = await supabase.from('kpis').upsert(row, { onConflict: 'id' }).select('*').single()
    if (error) fail(error)
    return kpiRowToKpi(data)
  },

  async delete(id: string): Promise<void> {
    if (!shared()) { await invoke<void>('delete_kpi', { id }); return }
    const { error } = await supabase.from('kpis').delete().eq('id', id)
    if (error) fail(error)
  },
}
