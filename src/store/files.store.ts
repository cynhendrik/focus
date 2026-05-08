import { create } from 'zustand'
import { FolderService } from '@/services/folder.service'
import { log } from '@/lib/logger'
import type { Folder, FileEntry, CreateFolderPayload, AddFilePayload } from '@/types/file.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface FilesState {
  folders: Folder[]
  files: FileEntry[]
  activeFolderId: string | null
  isLoading: boolean
  error: AppError | null
  loadForCustomer: (customerId: string) => Promise<void>
  loadFiles: (customerId: string, folderId: string | null) => Promise<void>
  setActiveFolder: (folderId: string | null) => void
  createFolder: (payload: CreateFolderPayload) => Promise<void>
  removeFolder: (id: string) => Promise<void>
  addFile: (payload: AddFilePayload) => Promise<void>
  removeFile: (id: string) => Promise<void>
}

export const useFilesStore = create<FilesState>()((set, get) => ({
  folders: [],
  files: [],
  activeFolderId: null,
  isLoading: false,
  error: null,

  loadForCustomer: async (customerId) => {
    set({ isLoading: true, error: null })
    try {
      const folders = await FolderService.getFolders(customerId)
      set({ folders, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load folders', { error })
    }
  },

  loadFiles: async (customerId, folderId) => {
    set({ isLoading: true, error: null })
    try {
      const files = await FolderService.getFiles(customerId, folderId)
      set({ files, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load files', { error })
    }
  },

  setActiveFolder: (folderId) => set({ activeFolderId: folderId }),

  createFolder: async (payload) => {
    try {
      const folder = await FolderService.createFolder(payload)
      set(s => ({ folders: [...s.folders, folder] }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  removeFolder: async (id) => {
    try {
      await FolderService.deleteFolder(id)
      set(s => ({
        folders: s.folders.filter(f => f.id !== id),
        files: s.files.filter(f => f.folderId !== id),
        activeFolderId: s.activeFolderId === id ? null : s.activeFolderId,
      }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  addFile: async (payload) => {
    try {
      const file = await FolderService.addFile(payload)
      if (file.folderId === get().activeFolderId) {
        set(s => ({ files: [...s.files, file] }))
      }
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  removeFile: async (id) => {
    try {
      await FolderService.deleteFile(id)
      set(s => ({ files: s.files.filter(f => f.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },
}))
