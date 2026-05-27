import { invoke } from '@tauri-apps/api/core'
import type {
  WorkspaceFolder, WorkspaceFile, SaveInvoiceToAblageParams,
} from '@/types/workspace-ablage.types'

export const WorkspaceAblageService = {
  getFolders(workspaceId: string): Promise<WorkspaceFolder[]> {
    return invoke<WorkspaceFolder[]>('cmd_get_ws_folders', { workspaceId })
  },
  createFolder(workspaceId: string, name: string, parentId?: string | null): Promise<WorkspaceFolder> {
    return invoke<WorkspaceFolder>('cmd_create_ws_folder', { workspaceId, name, parentId: parentId ?? null })
  },
  deleteFolder(id: string): Promise<void> {
    return invoke<void>('cmd_delete_ws_folder', { id })
  },
  getFiles(workspaceId: string, folderId?: string | null): Promise<WorkspaceFile[]> {
    return invoke<WorkspaceFile[]>('cmd_get_ws_files', { workspaceId, folderId: folderId ?? null })
  },
  importFile(params: {
    workspaceId: string
    folderId?: string | null
    name: string
    data: number[]
    mimeType?: string | null
  }): Promise<WorkspaceFile> {
    return invoke<WorkspaceFile>('cmd_import_ws_file', {
      workspaceId: params.workspaceId,
      folderId: params.folderId ?? null,
      name: params.name,
      data: params.data,
      mimeType: params.mimeType ?? null,
    })
  },
  deleteFile(id: string): Promise<void> {
    return invoke<void>('cmd_delete_ws_file', { id })
  },
  readFile(id: string): Promise<number[]> {
    return invoke<number[]>('cmd_read_ws_file', { id })
  },
  saveInvoiceToAblage(params: SaveInvoiceToAblageParams): Promise<WorkspaceFile> {
    return invoke<WorkspaceFile>('cmd_save_invoice_to_ablage', {
      workspaceId: params.workspaceId,
      invoiceId: params.invoiceId,
      invoiceNumber: params.invoiceNumber,
      accountName: params.accountName,
      invoiceDate: params.invoiceDate,
      pdfData: params.pdfData,
    })
  },
}
