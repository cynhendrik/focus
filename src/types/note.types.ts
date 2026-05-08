export interface Note {
  id: string
  customerId: string
  title: string
  content: string
  pinned: boolean
  createdAt: string
  updatedAt: string
}

export interface UpsertNotePayload {
  id?: string
  customerId: string
  title: string
  content?: string
  pinned?: boolean
}
