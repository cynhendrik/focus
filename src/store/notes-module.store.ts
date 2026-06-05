import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { log } from '@/lib/logger'
import type {
  NoteEntry, NoteDoc,
  CreateNoteEntryPayload, UpdateNoteEntryPayload,
  CreateNoteDocPayload, UpdateNoteDocPayload,
} from '@/types/notes-module.types'

// Rust returns tags as a JSON string — parse it to string[]
function parseEntry(raw: Omit<NoteEntry, 'tags'> & { tags: string }): NoteEntry {
  let tags: string[] = []
  try { tags = JSON.parse(raw.tags) } catch {}
  return { ...raw, tags }
}

interface NotesModuleState {
  entries:         NoteEntry[]
  docs:            NoteDoc[]
  loadingEntries:  boolean
  loadingDocs:     boolean
  activeAccountId: string | null

  loadForAccount: (accountId: string) => Promise<void>

  createEntry: (payload: CreateNoteEntryPayload) => Promise<NoteEntry>
  updateEntry: (id: string, patch: UpdateNoteEntryPayload) => Promise<void>
  deleteEntry: (id: string) => Promise<void>

  createDoc:   (payload: CreateNoteDocPayload) => Promise<NoteDoc>
  updateDoc:   (id: string, patch: UpdateNoteDocPayload) => Promise<void>
  deleteDoc:   (id: string) => Promise<void>
}

export const useNotesModuleStore = create<NotesModuleState>()((set, get) => ({
  entries:         [],
  docs:            [],
  loadingEntries:  false,
  loadingDocs:     false,
  activeAccountId: null,

  loadForAccount: async (accountId) => {
    if (get().activeAccountId === accountId) return
    set({ loadingEntries: true, loadingDocs: true, activeAccountId: accountId })
    try {
      const [rawEntries, docs] = await Promise.all([
        invoke<(Omit<NoteEntry, 'tags'> & { tags: string })[]>('get_note_entries', { accountId }),
        invoke<NoteDoc[]>('get_note_docs', { accountId }),
      ])
      set({ entries: rawEntries.map(parseEntry), docs, loadingEntries: false, loadingDocs: false })
    } catch (err) {
      log.error('Failed to load notes for account', { accountId, err })
      set({ loadingEntries: false, loadingDocs: false })
    }
  },

  createEntry: async (payload) => {
    const raw = await invoke<Omit<NoteEntry, 'tags'> & { tags: string }>('create_note_entry', { payload })
    const entry = parseEntry(raw)
    set(s => ({ entries: [entry, ...s.entries] }))
    return entry
  },

  updateEntry: async (id, patch) => {
    const raw = await invoke<Omit<NoteEntry, 'tags'> & { tags: string }>('update_note_entry', { id, payload: patch })
    const updated = parseEntry(raw)
    set(s => ({ entries: s.entries.map(e => e.id === id ? updated : e) }))
  },

  deleteEntry: async (id) => {
    await invoke<void>('delete_note_entry', { id })
    set(s => ({ entries: s.entries.filter(e => e.id !== id) }))
  },

  createDoc: async (payload) => {
    const doc = await invoke<NoteDoc>('create_note_doc', { payload })
    set(s => ({ docs: [doc, ...s.docs] }))
    return doc
  },

  updateDoc: async (id, patch) => {
    const updated = await invoke<NoteDoc>('update_note_doc', { id, payload: patch })
    set(s => ({ docs: s.docs.map(d => d.id === id ? updated : d) }))
  },

  deleteDoc: async (id) => {
    await invoke<void>('delete_note_doc', { id })
    set(s => ({ docs: s.docs.filter(d => d.id !== id) }))
  },
}))
