export type NoteType = 'gespraech' | 'meeting' | 'telefon' | 'zusammenfassung' | 'nachricht'

export interface Note {
  id: string
  customerId: string
  title: string
  content: string
  pinned: boolean
  noteType: NoteType
  waitingReply: boolean
  createdAt: string
  updatedAt: string
}

export interface UpsertNotePayload {
  id?: string
  customerId: string
  title: string
  content?: string
  pinned?: boolean
  noteType?: NoteType
  waitingReply?: boolean
}
