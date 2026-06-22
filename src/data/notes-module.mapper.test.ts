import { describe, it, expect } from 'vitest'
import { parseEntry, noteEntryRowToEntry, noteFolderRowToFolder } from './notes-module.mapper'
import type { StickyNote } from '@/types/notes-module.types'

const baseRow = {
  id: 'entry-1',
  workspace_id: 'ws-abc',
  account_id: 'acc-123',
  folder_id: 'folder-1',
  title: 'Besprechungsnotizen',
  content: 'Inhalte der Besprechung',
  tags: ['wichtig', 'follow-up'],
  stickies: [],
  created_by: 'user-1',
  updated_by: 'user-2',
  created_at: '2026-06-01T10:00:00Z',
  updated_at: '2026-06-02T11:00:00Z',
}

const stickyNote: StickyNote = {
  id: 'sticky-1', x: 100, y: 200, color: '#ffff88',
  title: 'Erinnerung', text: 'Rechnung senden',
  checks: [{ id: 'c1', label: 'Erledigt', done: false }],
}

describe('notes-module.mapper', () => {
  describe('noteEntryRowToEntry', () => {
    it('maps snake_case to camelCase', () => {
      const entry = noteEntryRowToEntry(baseRow)
      expect(entry.id).toBe('entry-1')
      expect(entry.workspaceId).toBe('ws-abc')
      expect(entry.accountId).toBe('acc-123')
      expect(entry.folderId).toBe('folder-1')
      expect(entry.title).toBe('Besprechungsnotizen')
      expect(entry.content).toBe('Inhalte der Besprechung')
      expect(entry.createdBy).toBe('user-1')
      expect(entry.updatedBy).toBe('user-2')
      expect(entry.createdAt).toBe('2026-06-01T10:00:00Z')
      expect(entry.updatedAt).toBe('2026-06-02T11:00:00Z')
    })

    it('tags as jsonb array stays array', () => {
      const entry = noteEntryRowToEntry({ ...baseRow, tags: ['crm', 'wichtig'] })
      expect(entry.tags).toEqual(['crm', 'wichtig'])
    })

    it('tags as JSON string parses to array', () => {
      const entry = noteEntryRowToEntry({ ...baseRow, tags: '["crm","wichtig"]' })
      expect(entry.tags).toEqual(['crm', 'wichtig'])
    })

    it('tags as invalid JSON string returns empty array', () => {
      const entry = noteEntryRowToEntry({ ...baseRow, tags: 'kaputt' })
      expect(entry.tags).toEqual([])
    })

    it('tags null/undefined returns empty array', () => {
      expect(noteEntryRowToEntry({ ...baseRow, tags: null }).tags).toEqual([])
      expect(noteEntryRowToEntry({ ...baseRow, tags: undefined }).tags).toEqual([])
    })

    it('folder_id null maps to null (not undefined)', () => {
      const entry = noteEntryRowToEntry({ ...baseRow, folder_id: null })
      expect(entry.folderId).toBeNull()
    })

    it('stickies as jsonb array stays array', () => {
      const entry = noteEntryRowToEntry({ ...baseRow, stickies: [stickyNote] })
      expect(entry.stickies).toEqual([stickyNote])
    })

    it('stickies as JSON string parses to StickyNote[]', () => {
      const entry = noteEntryRowToEntry({ ...baseRow, stickies: JSON.stringify([stickyNote]) })
      expect(entry.stickies).toEqual([stickyNote])
    })

    it('stickies null returns empty array', () => {
      expect(noteEntryRowToEntry({ ...baseRow, stickies: null }).stickies).toEqual([])
    })

    it('updated_by null maps to null', () => {
      const entry = noteEntryRowToEntry({ ...baseRow, updated_by: null })
      expect(entry.updatedBy).toBeNull()
    })

    it('title null maps to null', () => {
      const entry = noteEntryRowToEntry({ ...baseRow, title: null })
      expect(entry.title).toBeNull()
    })

    it('content undefined defaults to empty string', () => {
      const entry = noteEntryRowToEntry({ ...baseRow, content: undefined })
      expect(entry.content).toBe('')
    })
  })

  describe('parseEntry (Rust local path)', () => {
    it('parses JSON-string tags to string[]', () => {
      const raw = { ...baseRow, tags: '["meeting","q3"]', stickies: '[]' }
      const entry = parseEntry(raw)
      expect(entry.tags).toEqual(['meeting', 'q3'])
      expect(entry.stickies).toEqual([])
    })

    it('parses JSON-string stickies to StickyNote[]', () => {
      const raw = { ...baseRow, tags: '[]', stickies: JSON.stringify([stickyNote]) }
      const entry = parseEntry(raw)
      expect(entry.stickies).toEqual([stickyNote])
    })

    it('handles empty JSON arrays', () => {
      const raw = { ...baseRow, tags: '[]', stickies: '[]' }
      const entry = parseEntry(raw)
      expect(entry.tags).toEqual([])
      expect(entry.stickies).toEqual([])
    })

    it('handles invalid JSON strings gracefully', () => {
      const raw = { ...baseRow, tags: 'ungueltig', stickies: '{nicht-array}' }
      const entry = parseEntry(raw)
      expect(entry.tags).toEqual([])
      expect(entry.stickies).toEqual([])
    })

    it('preserves all other fields unchanged', () => {
      const raw = { ...baseRow, tags: '["x"]', stickies: '[]' }
      const entry = parseEntry(raw)
      expect(entry.id).toBe('entry-1')
      expect(entry.title).toBe('Besprechungsnotizen')
      expect(entry.content).toBe('Inhalte der Besprechung')
    })
  })

  describe('noteFolderRowToFolder', () => {
    const folderRow = {
      id: 'folder-1',
      workspace_id: 'ws-abc',
      account_id: 'acc-123',
      name: 'Projektordner',
      created_by: 'user-1',
      created_at: '2026-06-01T10:00:00Z',
      updated_at: '2026-06-02T11:00:00Z',
    }

    it('maps snake_case fields to camelCase', () => {
      const folder = noteFolderRowToFolder(folderRow)
      expect(folder.id).toBe('folder-1')
      expect(folder.workspaceId).toBe('ws-abc')
      expect(folder.accountId).toBe('acc-123')
      expect(folder.name).toBe('Projektordner')
      expect(folder.createdBy).toBe('user-1')
      expect(folder.createdAt).toBe('2026-06-01T10:00:00Z')
      expect(folder.updatedAt).toBe('2026-06-02T11:00:00Z')
    })

    it('returns all seven required fields', () => {
      const folder = noteFolderRowToFolder(folderRow)
      expect(Object.keys(folder)).toEqual(
        expect.arrayContaining(['id', 'workspaceId', 'accountId', 'name', 'createdBy', 'createdAt', 'updatedAt'])
      )
    })
  })
})
