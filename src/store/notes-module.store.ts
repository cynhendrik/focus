import { create } from 'zustand'
import { log } from '@/lib/logger'
import { NotesModuleGateway } from '@/data/notes-module.gateway'
import type {
  NoteEntry, NoteFolder,
  CreateNoteEntryPayload, UpdateNoteEntryPayload,
  CreateNoteFolderPayload, UpdateNoteFolderPayload,
} from '@/types/notes-module.types'

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

export const useNotesModuleStore = create<NotesModuleState>()((set) => ({
  entries:         [],
  folders:         [],
  loadingEntries:  false,
  activeAccountId: null,

  loadForAccount: async (accountId) => {
    set({ loadingEntries: true, activeAccountId: accountId })
    try {
      const [entries, folders] = await Promise.all([
        NotesModuleGateway.getEntries(accountId),
        NotesModuleGateway.getFolders(accountId),
      ])
      set({ entries, folders, loadingEntries: false })
    } catch (err) {
      log.error('Failed to load notes for account', { accountId, err })
      set({ loadingEntries: false })
    }
  },

  createEntry: async (payload) => {
    const entry = await NotesModuleGateway.createEntry(payload)
    set(s => ({ entries: [entry, ...s.entries] }))
    return entry
  },

  updateEntry: async (id, patch) => {
    const updated = await NotesModuleGateway.updateEntry(id, patch)
    set(s => ({ entries: s.entries.map(e => e.id === id ? updated : e) }))
  },

  deleteEntry: async (id) => {
    await NotesModuleGateway.deleteEntry(id)
    set(s => ({ entries: s.entries.filter(e => e.id !== id) }))
  },

  createFolder: async (payload) => {
    const folder = await NotesModuleGateway.createFolder(payload)
    set(s => ({ folders: [...s.folders, folder].sort((a, b) => a.name.localeCompare(b.name)) }))
    return folder
  },

  updateFolder: async (id, patch) => {
    const updated = await NotesModuleGateway.updateFolder(id, patch)
    set(s => ({ folders: s.folders.map(f => f.id === id ? updated : f) }))
  },

  deleteFolder: async (id) => {
    await NotesModuleGateway.deleteFolder(id)
    set(s => ({
      folders: s.folders.filter(f => f.id !== id),
      entries: s.entries.map(e => e.folderId === id ? { ...e, folderId: null } : e),
    }))
  },
}))
