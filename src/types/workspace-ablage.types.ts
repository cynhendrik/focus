export interface WorkspaceFolder {
  id: string
  workspaceId: string
  name: string
  parentId: string | null
  createdAt: string
}

export interface WorkspaceFile {
  id: string
  workspaceId: string
  folderId: string | null
  name: string
  path: string
  size: number | null
  mimeType: string | null
  sourceType: 'manual' | 'invoice' | 'offer'
  sourceId: string | null
  createdAt: string
}

export interface SaveInvoiceToAblageParams {
  workspaceId: string
  invoiceId: string
  invoiceNumber: string
  accountName: string
  invoiceDate: string  // ISO "2026-05-27"
  pdfData: number[]   // Array.from(Uint8Array)
}
