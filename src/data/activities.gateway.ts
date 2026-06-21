import { invoke } from '@tauri-apps/api/core'
import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspace.store'
import { activityRowToActivity, activityPayloadToRow, activityUpdateToPatch } from './activities.mapper'
import type { Activity, CreateActivityPayload, UpdateActivityPayload } from '@/types/pipeline.types'

function shared(): boolean {
  return useWorkspaceStore.getState().isActiveWorkspaceShared()
}
function fail(error: { message?: string; details?: string; hint?: string; code?: string } | null): never {
  const e = error ?? {}
  const msg = [e.message, e.details, e.hint].filter(Boolean).join(' — ') || 'Unbekannter Supabase-Fehler'
  throw new Error(e.code ? `${msg} (${e.code})` : msg)
}

export const ActivitiesGateway = {
  async getByAccount(accountId: string): Promise<Activity[]> {
    if (!shared()) return invoke<Activity[]>('get_activities_by_account', { accountId })
    const { data, error } = await supabase.from('activities').select('*')
      .eq('account_id', accountId).order('created_at', { ascending: false })
    if (error) fail(error)
    return (data ?? []).map(activityRowToActivity)
  },

  async getByCustomer(customerId: string): Promise<Activity[]> {
    if (!shared()) return invoke<Activity[]>('get_activities_by_customer', { customerId })
    const { data, error } = await supabase.from('activities').select('*')
      .eq('customer_id', customerId).order('created_at', { ascending: false })
    if (error) fail(error)
    return (data ?? []).map(activityRowToActivity)
  },

  async getOpenFollowups(workspaceId: string): Promise<Activity[]> {
    if (!shared()) return invoke<Activity[]>('get_open_followups', { workspaceId })
    const { data, error } = await supabase.from('activities').select('*')
      .eq('workspace_id', workspaceId).eq('type', 'followup').eq('status', 'open')
      .order('due_at', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true })
    if (error) fail(error)
    return (data ?? []).map(activityRowToActivity)
  },

  async create(payload: CreateActivityPayload): Promise<Activity> {
    if (!shared()) return invoke<Activity>('create_activity', { payload })
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const row = activityPayloadToRow(payload, { id, now })
    const { data, error } = await supabase.from('activities').insert(row).select('*').single()
    if (error) fail(error)
    return activityRowToActivity(data)
  },

  async update(id: string, payload: UpdateActivityPayload & { payload?: string }): Promise<Activity> {
    if (!shared()) return invoke<Activity>('update_activity', { id, payload })
    const now = new Date().toISOString()
    const patch = activityUpdateToPatch(payload, now)
    const { data, error } = await supabase.from('activities').update(patch).eq('id', id).select('*').single()
    if (error) fail(error)
    return activityRowToActivity(data)
  },

  async delete(id: string): Promise<void> {
    if (!shared()) { await invoke<void>('delete_activity', { id }); return }
    const { error } = await supabase.from('activities').delete().eq('id', id)
    if (error) fail(error)
  },
}
