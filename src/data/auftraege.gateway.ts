import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import {
  auftragRowToAuftrag, auftragToRow, zeiteintragRowToZeiteintrag, zeiteintragToRow,
} from './auftraege.mapper'
import type { Auftrag, Zeiteintrag } from '@/types/auftrag.types'

export const KEY_AUFTRAEGE     = 'cynera-auftraege-v1'
export const KEY_ZEITEINTRAEGE = 'cynera-zeiteintraege-v1'

function shared(): boolean {
  return useWorkspaceStore.getState().isActiveWorkspaceShared()
}
function ctx() {
  return {
    workspaceId: useWorkspaceStore.getState().activeWorkspaceId ?? '',
    createdBy: useAuthStore.getState().user?.id ?? '',
  }
}
function fail(error: { message?: string; code?: string } | null): never {
  const e = error ?? {}
  throw new Error(e.code ? `${e.message ?? 'Supabase-Fehler'} (${e.code})` : (e.message ?? 'Supabase-Fehler'))
}

// ── localStorage-Helfer (Solo/lokal) ────────────────────────────────────────
function lsGet<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') } catch { return [] }
}
function lsSet<T>(key: string, data: T[]) { localStorage.setItem(key, JSON.stringify(data)) }
function lsUpsert<T extends { id: string }>(key: string, item: T) {
  const list = lsGet<T>(key)
  const idx = list.findIndex(x => x.id === item.id)
  if (idx >= 0) list[idx] = item; else list.unshift(item)
  lsSet(key, list)
}

export interface AuftraegeData { auftraege: Auftrag[]; zeiteintraege: Zeiteintrag[] }

export const AuftraegeGateway = {
  async loadAll(workspaceId: string): Promise<AuftraegeData> {
    if (!shared()) {
      return { auftraege: lsGet<Auftrag>(KEY_AUFTRAEGE), zeiteintraege: lsGet<Zeiteintrag>(KEY_ZEITEINTRAEGE) }
    }
    const [a, z] = await Promise.all([
      supabase.from('auftraege').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
      supabase.from('zeiteintraege').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
    ])
    if (a.error) fail(a.error)
    if (z.error) fail(z.error)
    return {
      auftraege: (a.data ?? []).map(auftragRowToAuftrag),
      zeiteintraege: (z.data ?? []).map(zeiteintragRowToZeiteintrag),
    }
  },

  async upsertAuftrag(a: Auftrag): Promise<void> {
    if (!shared()) { lsUpsert(KEY_AUFTRAEGE, a); return }
    const { error } = await supabase.from('auftraege').upsert(auftragToRow(a, ctx()), { onConflict: 'id' })
    if (error) fail(error)
  },

  async deleteAuftrag(id: string): Promise<void> {
    if (!shared()) {
      lsSet(KEY_AUFTRAEGE, lsGet<Auftrag>(KEY_AUFTRAEGE).filter(x => x.id !== id))
      lsSet(KEY_ZEITEINTRAEGE, lsGet<Zeiteintrag>(KEY_ZEITEINTRAEGE).map(z => z.auftragId === id ? { ...z, auftragId: null } : z))
      return
    }
    const del = await supabase.from('auftraege').delete().eq('id', id)
    if (del.error) fail(del.error)
    // verwaiste Zeiteinträge entkoppeln
    const upd = await supabase.from('zeiteintraege').update({ auftrag_id: null }).eq('auftrag_id', id)
    if (upd.error) fail(upd.error)
  },

  async upsertZeiteintrag(z: Zeiteintrag): Promise<void> {
    if (!shared()) { lsUpsert(KEY_ZEITEINTRAEGE, z); return }
    const { error } = await supabase.from('zeiteintraege').upsert(zeiteintragToRow(z, ctx()), { onConflict: 'id' })
    if (error) fail(error)
  },

  async deleteZeiteintrag(id: string): Promise<void> {
    if (!shared()) {
      lsSet(KEY_ZEITEINTRAEGE, lsGet<Zeiteintrag>(KEY_ZEITEINTRAEGE).filter(x => x.id !== id))
      return
    }
    const { error } = await supabase.from('zeiteintraege').delete().eq('id', id)
    if (error) fail(error)
  },

  async markBilled(entryIds: string[], invoiceId: string): Promise<void> {
    if (entryIds.length === 0) return
    if (!shared()) {
      const set = new Set(entryIds)
      lsSet(KEY_ZEITEINTRAEGE, lsGet<Zeiteintrag>(KEY_ZEITEINTRAEGE).map(z => set.has(z.id) ? { ...z, billed: true, invoiceId } : z))
      return
    }
    const { error } = await supabase.from('zeiteintraege').update({ billed: true, invoice_id: invoiceId }).in('id', entryIds)
    if (error) fail(error)
  },

  async markBilledForAccount(accountId: string, invoiceId: string): Promise<void> {
    if (!shared()) {
      lsSet(KEY_ZEITEINTRAEGE, lsGet<Zeiteintrag>(KEY_ZEITEINTRAEGE).map(z => z.accountId === accountId && !z.billed ? { ...z, billed: true, invoiceId } : z))
      return
    }
    const { error } = await supabase.from('zeiteintraege').update({ billed: true, invoice_id: invoiceId })
      .eq('account_id', accountId).eq('billed', false)
    if (error) fail(error)
  },
}
