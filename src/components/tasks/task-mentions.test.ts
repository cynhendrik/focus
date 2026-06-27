import { describe, it, expect } from 'vitest'
import { buildTaskMentionCandidates, markerForTask } from './task-mentions'

const members = [{ id: 'u1', displayName: 'Mia Berg', email: 'mia@x.de' }] as any
const accounts = [
  { id: 'a1', name: 'Acme GmbH', industry: 'Bau', isPrivate: false },
  { id: 'a2', name: 'Privat', industry: null, isPrivate: true },
] as any

describe('buildTaskMentionCandidates', () => {
  it('lists members first, then non-private customers', () => {
    const c = buildTaskMentionCandidates(members, accounts)
    expect(c.map(x => x.kind)).toEqual(['member', 'customer'])
    expect(c[0]).toMatchObject({ kind: 'member', id: 'u1', name: 'Mia Berg' })
    expect(c[1]).toMatchObject({ kind: 'customer', id: 'a1', name: 'Acme GmbH' })
  })
})

describe('markerForTask', () => {
  it('uses @firstname for members and customers', () => {
    expect(markerForTask({ kind: 'member', id: 'u1', name: 'Mia Berg' })).toBe('@Mia')
    expect(markerForTask({ kind: 'customer', id: 'a1', name: 'Acme GmbH' })).toBe('@Acme')
  })
})
