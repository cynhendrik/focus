import { create } from 'zustand'
import { WorkspaceAblageService } from '@/services/workspace-ablage.service'
import { log } from '@/lib/logger'
import type { WorkspaceFolder, WorkspaceFile } from '@/types/workspace-ablage.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface WorkspaceAblageState {
  folders: WorkspaceFolder[]
  files: WorkspaceFile[]
  activeFolderId: string | null
  isLoading: boolean
  error: AppError | null

  load: (workspaceId: string) => Promise<void>
  selectFolder: (workspaceId: string, folderId: string | null) => Promise<void>
  createFolder: (workspaceId: string, name: string, parentId?: string | null) => Promise<void>
  removeFolder: (id: string) => Promise<void>
  importFile: (params: {
    workspaceId: string
    folderId?: string | null
    name: string
    data: number[]
    mimeType?: string | null
  }) => Promise<void>
  removeFile: (id: string) => Promise<void>
  readFile: (id: string) => Promise<Uint8Array>
}

export const useWorkspaceAblageStore = create<WorkspaceAblageState>()((set, get) => ({
  folders: [],
  files: [],
  activeFolderId: null,
  isLoading: false,
  error: null,

  load: async (workspaceId) => {
    set({ isLoading: true, error: null })
    try {
      const [folders, files] = await Promise.all([
        WorkspaceAblageService.getFolders(workspaceId),
        WorkspaceAblageService.getFiles(workspaceId, null),
      ])
      set({ folders, files, activeFolderId: null, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load workspace ablage', { error })
    }
  },

  selectFolder: async (workspaceId, folderId) => {
    set({ activeFolderId: folderId, isLoading: true, error: null })
    try {
      const files = await WorkspaceAblageService.getFiles(workspaceId, folderId)
      set({ files, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
    }
  },

  createFolder: async (workspaceId, name, parentId) => {
    try {
      const folder = await WorkspaceAblageService.createFolder(workspaceId, name, parentId)
      set(s => ({ folders: [...s.folders, folder] }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  removeFolder: async (id) => {
    try {
      await WorkspaceAblageService.deleteFolder(id)
      set(s => {
        // Collect all descendant folder IDs recursively (DB cascades, store must follow)
        const allFolders = s.folders
        const toRemove = new Set<string>()
        const collect = (fid: string) => {
          toRemove.add(fid)
          allFolders.filter(f => f.parentId === fid).forEach(c => collect(c.id))
        }
        collect(id)
        return {
          folders: s.folders.filter(f => !toRemove.has(f.id)),
          files: s.files.filter(f => f.folderId === null || !toRemove.has(f.folderId)),
          activeFolderId: s.activeFolderId !== null && toRemove.has(s.activeFolderId) ? null : s.activeFolderId,
        }
      })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  importFile: async (params) => {
    try {
      const file = await WorkspaceAblageService.importFile(params)
      if (file.folderId === get().activeFolderId || get().activeFolderId === null) {
        set(s => ({ files: [file, ...s.files] }))
      }
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  removeFile: async (id) => {
    try {
      await WorkspaceAblageService.deleteFile(id)
      set(s => ({ files: s.files.filter(f => f.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  readFile: async (id) => {
    const arr = await WorkspaceAblageService.readFile(id)
    return new Uint8Array(arr)
  },
}))
