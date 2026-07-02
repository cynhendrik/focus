import { invoke } from '@tauri-apps/api/core'
import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspace.store'
import { rawToPreparedItem, rowToPreparedItem } from './prepared-items.mapper'
import type { CreatePreparedItem, PreparedItem, PreparedItemPayload, PreparedItemStatus } from '@/types/prepared-item.types'

function shared(): boolean {
  return useWorkspaceStore.getState().isActiveWorkspaceShared()
}

function fail(error: { message?: string; details?: string; hint?: string; code?: string } | null): never {
  const e = error ?? {}
  const msg = [e.message, e.details, e.hint].filter(Boolean).join(' — ') || 'Unbekannter Supabase-Fehler'
  throw new Error(e.code ? `${msg} (${e.code})` : msg)
}

type RawItem = Omit<PreparedItem, 'payload'> & { payload: string }

export const PreparedItemsGateway = {
  async listActive(workspaceId: string): Promise<PreparedItem[]> {
    if (!shared()) {
      const rows = await invoke<RawItem[]>('cmd_get_active_prepared_items', { workspaceId })
      return rows.map(rawToPreparedItem)
    }
    const { data, error } = await supabase.from('prepared_items')
      .select('*').eq('workspace_id', workspaceId).in('status', ['pending', 'snoozed'])
      .order('score', { ascending: false })
    if (error) fail(error)
    return (data ?? []).map(rowToPreparedItem)
  },

  /** Idempotent: genau eine Karte pro Quelle; verworfene Karten werden nie wiederbelebt. */
  async insertIgnore(item: CreatePreparedItem): Promise<boolean> {
    if (!shared()) {
      return invoke<boolean>('cmd_insert_prepared_item_ignore', {
        payload: { ...item, assignee: item.assignee ?? null, payload: JSON.stringify(item.payload) },
      })
    }
    const now = new Date().toISOString()
    const { error } = await supabase.from('prepared_items').insert({
      id: crypto.randomUUID(), workspace_id: item.workspaceId, type: item.type,
      source_kind: item.sourceKind, source_id: item.sourceId, assignee: item.assignee ?? null,
      payload: item.payload, score: item.score, status: 'pending', rule_id: item.ruleId,
      created_at: now, updated_at: now,
    })
    if (error) {
      if (error.code === '23505') return false // UNIQUE-Verletzung = Duplikat, kein Fehler
      fail(error)
    }
    return true
  },

  async updateStatus(id: string, status: PreparedItemStatus, opts?: { snoozeUntil?: string | null; approvedAt?: string | null }): Promise<PreparedItem> {
    if (!shared()) {
      return rawToPreparedItem(await invoke<RawItem>('cmd_update_prepared_item_status', {
        id, status, snoozeUntil: opts?.snoozeUntil ?? null, approvedAt: opts?.approvedAt ?? null,
      }))
    }
    const { data, error } = await supabase.from('prepared_items')
      .update({ status, snooze_until: opts?.snoozeUntil ?? null, approved_at: opts?.approvedAt ?? null, updated_at: new Date().toISOString() })
      .eq('id', id).select('*').single()
    if (error) fail(error)
    return rowToPreparedItem(data)
  },

  async updatePayload(id: string, payload: PreparedItemPayload): Promise<PreparedItem> {
    if (!shared()) {
      return rawToPreparedItem(await invoke<RawItem>('cmd_update_prepared_item_payload', { id, payload: JSON.stringify(payload) }))
    }
    const { data, error } = await supabase.from('prepared_items')
      .update({ payload, updated_at: new Date().toISOString() }).eq('id', id).select('*').single()
    if (error) fail(error)
    return rowToPreparedItem(data)
  },

  async setAssignee(id: string, assignee: string | null): Promise<PreparedItem> {
    if (!shared()) {
      return rawToPreparedItem(await invoke<RawItem>('cmd_set_prepared_item_assignee', { id, assignee }))
    }
    const { data, error } = await supabase.from('prepared_items')
      .update({ assignee, updated_at: new Date().toISOString() }).eq('id', id).select('*').single()
    if (error) fail(error)
    return rowToPreparedItem(data)
  },

  async approvedSince(workspaceId: string, sinceIso: string): Promise<PreparedItem[]> {
    if (!shared()) {
      const rows = await invoke<RawItem[]>('cmd_get_approved_prepared_items_since', { workspaceId, since: sinceIso })
      return rows.map(rawToPreparedItem)
    }
    const { data, error } = await supabase.from('prepared_items')
      .select('*').eq('workspace_id', workspaceId).eq('status', 'approved').gte('approved_at', sinceIso)
      .order('approved_at', { ascending: false })
    if (error) fail(error)
    return (data ?? []).map(rowToPreparedItem)
  },
}
