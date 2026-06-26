import { describe, it, expect } from 'vitest'
import { buildMentionCandidates, markerFor, resolveComposed } from './mentions'

describe('buildMentionCandidates', () => {
  it('lists members first, then open tasks; skips done tasks', () => {
    const cands = buildMentionCandidates(
      [{ id: 'u1', displayName: 'Max Mustermann', email: null }],
      [{ id: 't1', title: 'Logo finalisieren', status: 'open' }, { id: 't2', title: 'Alt', status: 'done' }],
    )
    expect(cands.map(c => c.kind)).toEqual(['member', 'task'])
    expect(cands[0]).toMatchObject({ kind: 'member', id: 'u1', name: 'Max Mustermann' })
    expect(cands[1]).toMatchObject({ kind: 'task', id: 't1', name: 'Logo finalisieren' })
  })
})

describe('markerFor', () => {
  it('member marker = @firstname', () => {
    expect(markerFor({ kind: 'member', id: 'u1', name: 'Max Mustermann' })).toBe('@Max')
  })
  it('task marker = @slug (spaces → dashes, truncated)', () => {
    expect(markerFor({ kind: 'task', id: 't1', name: 'Logo finalisieren' })).toBe('@Logo-finalisieren')
  })
})

describe('resolveComposed', () => {
  it('collects member ids into mentions and first task into ref', () => {
    const out = resolveComposed([
      { kind: 'member', id: 'u1', marker: '@Max' },
      { kind: 'member', id: 'u2', marker: '@Lukas' },
      { kind: 'task', id: 't1', marker: '@Logo-finalisieren' },
    ])
    expect(out.mentions).toEqual(['u1', 'u2'])
    expect(out.ref).toEqual({ refType: 'task', refId: 't1' })
  })
  it('no task → ref null; dedupes member ids', () => {
    const out = resolveComposed([
      { kind: 'member', id: 'u1', marker: '@Max' },
      { kind: 'member', id: 'u1', marker: '@Max' },
    ])
    expect(out.mentions).toEqual(['u1'])
    expect(out.ref).toBeNull()
  })
})
