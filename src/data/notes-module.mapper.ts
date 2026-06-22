import type { NoteEntry, NoteFolder, StickyNote } from '@/types/notes-module.types'

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[]
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] } }
  return []
}
function asStickies(v: unknown): StickyNote[] {
  if (Array.isArray(v)) return v as StickyNote[]
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] } }
  return []
}
function asJsonArray(v: unknown): unknown[] {
  // String (JSON) → Array für jsonb-Spalten; Array bleibt Array.
  if (Array.isArray(v)) return v
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] } }
  return []
}

/** Lokale Rust-Zeile (tags/stickies = JSON-Strings) → NoteEntry. */
export function parseEntry(raw: any): NoteEntry {
  return { ...raw, tags: asStringArray(raw.tags), stickies: asStickies(raw.stickies) }
}

/** Supabase-`note_entries`-Zeile (tags/stickies = jsonb) → NoteEntry. */
export function noteEntryRowToEntry(r: any): NoteEntry {
  return {
    id: r.id, workspaceId: r.workspace_id, accountId: r.account_id,
    folderId: r.folder_id ?? null, title: r.title ?? null, content: r.content ?? '',
    tags: asStringArray(r.tags), stickies: asStickies(r.stickies),
    createdBy: r.created_by, updatedBy: r.updated_by ?? null,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

export function noteFolderRowToFolder(r: any): NoteFolder {
  return {
    id: r.id, workspaceId: r.workspace_id, accountId: r.account_id, name: r.name,
    createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

export { asJsonArray }
