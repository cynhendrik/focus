import { invoke } from '@tauri-apps/api/core'
import type { Folder, FileEntry, CreateFolderPayload, AddFilePayload } from '@/types/file.types'

export interface ImportFileParams {
  customerId: string
  folderId?: string | null
  name: string
  data: number[]
  mimeType?: string | null
}

export const FolderService = {
  getFolders(customerId: string): Promise<Folder[]> {
    return invoke<Folder[]>('cmd_get_folders', { customerId })
  },
  createFolder(payload: CreateFolderPayload): Promise<Folder> {
    return invoke<Folder>('cmd_create_folder', { payload })
  },
  deleteFolder(id: string): Promise<void> {
    return invoke<void>('cmd_delete_folder', { id })
  },
  getFiles(customerId: string, folderId?: string | null): Promise<FileEntry[]> {
    return invoke<FileEntry[]>('cmd_get_files', { customerId, folderId: folderId ?? null })
  },
  addFile(payload: AddFilePayload): Promise<FileEntry> {
    return invoke<FileEntry>('cmd_add_file', { payload })
  },
  deleteFile(id: string): Promise<void> {
    return invoke<void>('cmd_delete_file', { id })
  },
  importFile(params: ImportFileParams): Promise<FileEntry> {
    return invoke<FileEntry>('cmd_import_file', {
      customerId: params.customerId,
      folderId: params.folderId ?? null,
      name: params.name,
      data: params.data,
      mimeType: params.mimeType ?? null,
    })
  },
}
