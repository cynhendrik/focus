import { invoke } from '@tauri-apps/api/core'
import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspace.store'
import { parseEntry, noteEntryRowToEntry, noteFolderRowToFolder, asJsonArray } from './notes-module.mapper'
import type {
  NoteEntry, NoteFolder, CreateNoteEntryPayload, UpdateNoteEntryPayload,
  CreateNoteFolderPayload, UpdateNoteFolderPayload,
} from '@/types/notes-module.types'

type RawEntry = any
function shared(): boolean { return useWorkspaceStore.getState().isActiveWorkspaceShared() }
function fail(error: { message?: string; code?: string } | null): never {
  const e = error ?? {}; throw new Error(e.code ? `${e.message ?? 'Supabase-Fehler'} (${e.code})` : (e.message ?? 'Supabase-Fehler'))
}
function nowIso() { return new Date().toISOString() }

export const NotesModuleGateway = {
  async getEntries(accountId: string): Promise<NoteEntry[]> {
    if (!shared()) return (await invoke<RawEntry[]>('get_note_entries', { accountId })).map(parseEntry)
    const { data, error } = await supabase.from('note_entries').select('*').eq('account_id', accountId).order('created_at', { ascending: false })
    if (error) fail(error)
    return (data ?? []).map(noteEntryRowToEntry)
  },

  async getFolders(accountId: string): Promise<NoteFolder[]> {
    if (!shared()) return invoke<NoteFolder[]>('get_note_folders', { accountId })
    const { data, error } = await supabase.from('note_folders').select('*').eq('account_id', accountId).order('name', { ascending: true })
    if (error) fail(error)
    return (data ?? []).map(noteFolderRowToFolder)
  },

  async createEntry(payload: CreateNoteEntryPayload): Promise<NoteEntry> {
    if (!shared()) return parseEntry(await invoke<RawEntry>('create_note_entry', { payload }))
    const now = nowIso()
    const row = {
      id: crypto.randomUUID(), workspace_id: payload.workspaceId, created_by: payload.createdBy,
      account_id: payload.accountId, folder_id: payload.folderId ?? null,
      title: payload.title ?? null, content: payload.content ?? '',
      tags: asJsonArray(payload.tags), stickies: [], updated_by: null,
      created_at: now, updated_at: now,
    }
    const { data, error } = await supabase.from('note_entries').insert(row).select('*').single()
    if (error) fail(error)
    return noteEntryRowToEntry(data)
  },

  async updateEntry(id: string, patch: UpdateNoteEntryPayload): Promise<NoteEntry> {
    if (!shared()) return parseEntry(await invoke<RawEntry>('update_note_entry', { id, payload: patch }))
    const upd: Record<string, unknown> = { updated_at: nowIso() }
    if (patch.folderId !== undefined) upd.folder_id = patch.folderId
    if (patch.title !== undefined) upd.title = patch.title
    if (patch.content !== undefined) upd.content = patch.content
    if (patch.tags !== undefined) upd.tags = asJsonArray(patch.tags)
    if (patch.stickies !== undefined) upd.stickies = asJsonArray(patch.stickies)
    if (patch.updatedBy !== undefined) upd.updated_by = patch.updatedBy
    const { data, error } = await supabase.from('note_entries').update(upd).eq('id', id).select('*').single()
    if (error) fail(error)
    return noteEntryRowToEntry(data)
  },

  async deleteEntry(id: string): Promise<void> {
    if (!shared()) { await invoke<void>('delete_note_entry', { id }); return }
    const { error } = await supabase.from('note_entries').delete().eq('id', id)
    if (error) fail(error)
  },

  async createFolder(payload: CreateNoteFolderPayload): Promise<NoteFolder> {
    if (!shared()) return invoke<NoteFolder>('create_note_folder', { payload })
    const now = nowIso()
    const row = {
      id: crypto.randomUUID(), workspace_id: payload.workspaceId, created_by: payload.createdBy,
      account_id: payload.accountId, name: payload.name, created_at: now, updated_at: now,
    }
    const { data, error } = await supabase.from('note_folders').insert(row).select('*').single()
    if (error) fail(error)
    return noteFolderRowToFolder(data)
  },

  async updateFolder(id: string, patch: UpdateNoteFolderPayload): Promise<NoteFolder> {
    if (!shared()) return invoke<NoteFolder>('update_note_folder', { id, payload: patch })
    const { data, error } = await supabase.from('note_folders').update({ name: patch.name, updated_at: nowIso() }).eq('id', id).select('*').single()
    if (error) fail(error)
    return noteFolderRowToFolder(data)
  },

  async deleteFolder(id: string): Promise<void> {
    if (!shared()) { await invoke<void>('delete_note_folder', { id }); return }
    const { error } = await supabase.from('note_folders').delete().eq('id', id)
    if (error) fail(error)
  },
}
