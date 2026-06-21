import { supabase } from '@/lib/supabase'
import { LeadsService } from '@/services/leads.service'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { invoke } from '@tauri-apps/api/core'
import { accountRowToLead, leadPayloadToAccountRow, accountRowToAccount, accountPayloadToRow } from './accounts.mapper'
import type { Lead, UpsertLeadPayload, PipelineStage, BulkUpdateLeadsPayload } from '@/types/lead.types'
import type { Account, UpsertAccountPayload } from '@/types/account.types'

function shared(): boolean {
  return useWorkspaceStore.getState().isActiveWorkspaceShared()
}
function uid(): string {
  return useAuthStore.getState().user?.id ?? ''
}

export const AccountsGateway = {
  async getLeads(workspaceId: string): Promise<Lead[]> {
    if (!shared()) return LeadsService.getAll(workspaceId)
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('account_type', 'lead')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(accountRowToLead)
  },

  async upsertLead(payload: UpsertLeadPayload): Promise<Lead> {
    if (!shared()) return LeadsService.upsert(payload)
    const id = payload.id ?? crypto.randomUUID()
    const now = new Date().toISOString()
    const row = leadPayloadToAccountRow(payload, { id, createdBy: uid(), now })
    const { data, error } = await supabase
      .from('accounts')
      .upsert(row, { onConflict: 'id' })
      .select('*')
      .single()
    if (error) throw error
    return accountRowToLead(data)
  },

  async convertToClient(id: string): Promise<void> {
    if (!shared()) { await LeadsService.convertToClient(id); return }
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('accounts')
      .update({ account_type: 'client', lead_status: null, converted_at: now, updated_at: now })
      .eq('id', id)
    if (error) throw error
  },

  async deleteAccount(id: string, workspaceId: string): Promise<void> {
    if (!shared()) { await LeadsService.deleteLead(id, workspaceId); return }
    const { error } = await supabase.from('accounts').delete().eq('id', id)
    if (error) throw error
  },

  async updateStage(id: string, stage: PipelineStage): Promise<Lead> {
    if (!shared()) return LeadsService.updateStage(id, stage)
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('accounts')
      .update({ pipeline_stage: stage, updated_at: now })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return accountRowToLead(data)
  },

  async bulkUpdate(payload: BulkUpdateLeadsPayload): Promise<void> {
    if (!shared()) { await LeadsService.bulkUpdate(payload); return }
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('accounts')
      .update({
        lead_status: payload.status,
        re_engage_date: payload.reEngageDate ?? null,
        updated_at: now,
      })
      .in('id', payload.ids)
      .eq('account_type', 'lead')
    if (error) throw error
  },

  async getAccounts(workspaceId: string): Promise<Account[]> {
    if (!shared()) return invoke<Account[]>('get_accounts', { workspaceId })
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .or('account_type.is.null,account_type.neq.lead')
      .order('name', { ascending: true })
    if (error) throw new Error(error.message)
    return (data ?? []).map(accountRowToAccount).filter(a => !a.isPrivate)
  },

  async upsertAccount(payload: UpsertAccountPayload): Promise<Account> {
    if (!shared()) return invoke<Account>('upsert_account', { payload })
    const id = payload.id ?? crypto.randomUUID()
    const now = new Date().toISOString()
    const row = accountPayloadToRow(payload, { id, now })
    const { data, error } = await supabase
      .from('accounts')
      .upsert(row, { onConflict: 'id' })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return accountRowToAccount(data)
  },

  async setArchived(id: string, archived: boolean): Promise<Account> {
    if (!shared()) return invoke<Account>('cmd_set_account_archived', { id, archived })
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('accounts')
      .update({ archived_at: archived ? now : null, updated_at: now })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return accountRowToAccount(data)
  },

  async setPrimaryDeal(accountId: string, dealId: string | null): Promise<Account> {
    if (!shared()) return invoke<Account>('cmd_set_primary_deal', { accountId, dealId })
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('accounts')
      .update({ primary_deal_id: dealId, updated_at: now })
      .eq('id', accountId)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return accountRowToAccount(data)
  },
}
