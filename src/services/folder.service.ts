import { invoke } from '@tauri-apps/api/core'
import type { Folder, FileEntry, CreateFolderPayload, AddFilePayload } from '@/types/file.types'

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
}
