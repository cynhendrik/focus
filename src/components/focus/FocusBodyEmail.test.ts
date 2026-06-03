import { describe, it, expect } from 'vitest'
import { parseNotes } from './FocusBodyEmail'

describe('parseNotes', () => {
  it('extracts fromAddr, sentAt, and fromLine from structured notes', () => {
    const notes = [
      'Von: John Doe <john@example.com>',
      'fromAddr: john@example.com',
      'sentAt: 2026-06-01T10:00:00Z',
    ].join('\n')

    const result = parseNotes(notes)

    expect(result.fromAddr).toBe('john@example.com')
    expect(result.sentAt).toBe('2026-06-01T10:00:00Z')
    expect(result.fromLine).toBe('John Doe <john@example.com>')
  })

  it('returns empty strings when notes are undefined', () => {
    const result = parseNotes(undefined)
    expect(result.fromAddr).toBe('')
    expect(result.sentAt).toBe('')
    expect(result.fromLine).toBe('')
  })

  it('handles old-format notes without fromAddr/sentAt lines', () => {
    const result = parseNotes('Von: someone@example.com')
    expect(result.fromAddr).toBe('')
    expect(result.sentAt).toBe('')
    expect(result.fromLine).toBe('someone@example.com')
  })
})
