export interface NoteFolder {
  id:          string
  workspaceId: string
  accountId:   string
  name:        string
  createdBy:   string
  createdAt:   string
  updatedAt:   string
}

export interface NoteEntry {
  id:          string
  workspaceId: string
  accountId:   string
  folderId:    string | null
  title:       string | null
  content:     string
  tags:        string[]       // parsed from JSON string returned by Rust
  stickies:    StickyNote[]    // parsed from JSON string
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
  folderId?:   string | null
  title?:      string
  content?:    string
  tags?:       string   // JSON string e.g. '["Follow-up"]'
  createdBy:   string
}

export interface UpdateNoteEntryPayload {
  folderId?:  string | null | undefined  // undefined = don't change, null = remove
  title?:     string | null
  content?:   string
  tags?:      string   // JSON string
  stickies?:  string   // JSON.stringify(StickyNote[])
  updatedBy?: string
}

export interface CreateNoteFolderPayload {
  workspaceId: string
  accountId:   string
  name:        string
  createdBy:   string
}

export interface UpdateNoteFolderPayload {
  name: string
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

export interface StickyCheck {
  id:    string
  label: string
  done:  boolean
}

export interface StickyNote {
  id:     string
  x:      number
  y:      number
  color:  string
  title:  string
  text:   string
  checks: StickyCheck[]
}
