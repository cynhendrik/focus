export interface Folder {
  id: string
  customerId: string
  name: string
  parentId: string | null
  createdAt: string
}

export interface FileEntry {
  id: string
  customerId: string
  folderId: string | null
  name: string
  path: string
  size: number | null
  mimeType: string | null
  createdAt: string
}

export interface CreateFolderPayload {
  customerId: string
  name: string
  parentId?: string | null
}

export interface AddFilePayload {
  customerId: string
  folderId?: string | null
  name: string
  path: string
  size?: number | null
  mimeType?: string | null
}
