export interface NoteEntry {
  id:          string
  workspaceId: string
  accountId:   string
  title:       string | null
  content:     string
  tags:        string[]   // parsed from JSON string returned by Rust
  createdBy:   string
  updatedBy:   string | null
  createdAt:   string
  updatedAt:   string
}

export interface NoteDoc {
  id:          string
  workspaceId: string
  accountId:   string
  title:       string
  content:     string
  createdBy:   string
  updatedBy:   string | null
  createdAt:   string
  updatedAt:   string
}

export interface CreateNoteEntryPayload {
  workspaceId: string
  accountId:   string
  title?:      string
  content?:    string
  tags?:       string   // JSON string e.g. '["Follow-up"]'
  createdBy:   string
}

export interface UpdateNoteEntryPayload {
  title?:     string | null
  content?:   string
  tags?:      string   // JSON string
  updatedBy?: string
}

export interface CreateNoteDocPayload {
  workspaceId: string
  accountId:   string
  title?:      string
  content?:    string
  createdBy:   string
}

export interface UpdateNoteDocPayload {
  title?:     string
  content?:   string
  updatedBy?: string
}
