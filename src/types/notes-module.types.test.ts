import { describe, it, expect } from 'vitest'
import type { StickyNote, StickyCheck } from './notes-module.types'

describe('StickyNote type', () => {
  it('accepts a full sticky note object', () => {
    const check: StickyCheck = { id: 'c1', label: 'Erledigen', done: false }
    const note: StickyNote = {
      id: 's1', x: 100, y: 200, color: '#FFF176',
      title: 'Mein Zettel', text: 'Inhalt', checks: [check],
    }
    expect(note.id).toBe('s1')
    expect(note.checks[0].done).toBe(false)
  })
})
