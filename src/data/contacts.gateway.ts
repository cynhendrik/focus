import { invoke } from '@tauri-apps/api/core'
import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspace.store'
import { contactRowToContact, contactPayloadToRow } from './contacts.mapper'
import type { Contact, UpsertContactPayload } from '@/types/contact.types'

function shared(): boolean {
  return useWorkspaceStore.getState().isActiveWorkspaceShared()
}
function fail(error: { message?: string; details?: string; hint?: string; code?: string } | null): never {
  const e = error ?? {}
  const msg = [e.message, e.details, e.hint].filter(Boolean).join(' — ') || 'Unbekannter Supabase-Fehler'
  throw new Error(e.code ? `${msg} (${e.code})` : msg)
}

export const ContactsGateway = {
  async getByAccount(accountId: string): Promise<Contact[]> {
    if (!shared()) return invoke<Contact[]>('get_contacts', { accountId })
    const { data, error } = await supabase.from('contacts').select('*')
      .eq('account_id', accountId)
      .order('is_primary', { ascending: false })
      .order('first_name', { ascending: true })
    if (error) fail(error)
    return (data ?? []).map(contactRowToContact)
  },

  async upsert(payload: UpsertContactPayload): Promise<Contact> {
    if (!shared()) return invoke<Contact>('upsert_contact', { payload })
    const id = payload.id ?? crypto.randomUUID()
    const now = new Date().toISOString()
    const row = contactPayloadToRow(payload, { id, now })
    const { data, error } = await supabase.from('contacts').upsert(row, { onConflict: 'id' }).select('*').single()
    if (error) fail(error)
    return contactRowToContact(data)
  },

  async delete(id: string): Promise<void> {
    if (!shared()) { await invoke<void>('delete_contact', { id }); return }
    const { error } = await supabase.from('contacts').delete().eq('id', id)
    if (error) fail(error)
  },
}
