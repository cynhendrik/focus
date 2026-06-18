import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { log } from '@/lib/logger'
import type {
  NoteEntry, NoteFolder,
  StickyNote,
  CreateNoteEntryPayload, UpdateNoteEntryPayload,
  CreateNoteFolderPayload, UpdateNoteFolderPayload,
} from '@/types/notes-module.types'

// Rust returns tags and stickies as JSON strings — parse them to string[] and StickyNote[]
function parseEntry(raw: Omit<NoteEntry, 'tags' | 'stickies'> & { tags: string; stickies: string }): NoteEntry {
  let tags: string[] = []
  let stickies: StickyNote[] = []
  try { tags = JSON.parse(raw.tags) } catch {}
  try { stickies = JSON.parse(raw.stickies) } catch {}
  return { ...raw, tags, stickies }
}

interface NotesModuleState {
  entries:         NoteEntry[]
  folders:         NoteFolder[]
  loadingEntries:  boolean
  activeAccountId: string | null

  loadForAccount: (accountId: string) => Promise<void>

  createEntry: (payload: CreateNoteEntryPayload) => Promise<NoteEntry>
  updateEntry: (id: string, patch: UpdateNoteEntryPayload) => Promise<void>
  deleteEntry: (id: string) => Promise<void>

  createFolder: (payload: CreateNoteFolderPayload) => Promise<NoteFolder>
  updateFolder: (id: string, patch: UpdateNoteFolderPayload) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
}

export const useNotesModuleStore = create<NotesModuleState>()((set, get) => ({
  entries:         [],
  folders:         [],
  loadingEntries:  false,
  activeAccountId: null,

  loadForAccount: async (accountId) => {
    set({ loadingEntries: true, activeAccountId: accountId })
    try {
      const [rawEntries, folders] = await Promise.all([
        invoke<(Omit<NoteEntry, 'tags' | 'stickies'> & { tags: string; stickies: string })[]>('get_note_entries', { accountId }),
        invoke<NoteFolder[]>('get_note_folders', { accountId }),
      ])
      set({ entries: rawEntries.map(parseEntry), folders, loadingEntries: false })
    } catch (err) {
      log.error('Failed to load notes for account', { accountId, err })
      set({ loadingEntries: false })
    }
  },

  createEntry: async (payload) => {
    const raw = await invoke<Omit<NoteEntry, 'tags' | 'stickies'> & { tags: string; stickies: string }>('create_note_entry', { payload })
    const entry = parseEntry(raw)
    set(s => ({ entries: [entry, ...s.entries] }))
    return entry
  },

  updateEntry: async (id, patch) => {
    const raw = await invoke<Omit<NoteEntry, 'tags' | 'stickies'> & { tags: string; stickies: string }>('update_note_entry', { id, payload: patch })
    const updated = parseEntry(raw)
    set(s => ({ entries: s.entries.map(e => e.id === id ? updated : e) }))
  },

  deleteEntry: async (id) => {
    await invoke<void>('delete_note_entry', { id })
    set(s => ({ entries: s.entries.filter(e => e.id !== id) }))
  },

  createFolder: async (payload) => {
    const folder = await invoke<NoteFolder>('create_note_folder', { payload })
    set(s => ({ folders: [...s.folders, folder].sort((a, b) => a.name.localeCompare(b.name)) }))
    return folder
  },

  updateFolder: async (id, patch) => {
    const updated = await invoke<NoteFolder>('update_note_folder', { id, payload: patch })
    set(s => ({ folders: s.folders.map(f => f.id === id ? updated : f) }))
  },

  deleteFolder: async (id) => {
    await invoke<void>('delete_note_folder', { id })
    set(s => ({
      folders: s.folders.filter(f => f.id !== id),
      entries: s.entries.map(e => e.folderId === id ? { ...e, folderId: null } : e),
    }))
  },
}))
