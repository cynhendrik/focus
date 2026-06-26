import { describe, it, expect, beforeEach } from 'vitest'
import { useMembersStore } from './members.store'

describe('members.store', () => {
  beforeEach(() => useMembersStore.setState({ profiles: {}, memberIds: [] }))

  it('nameOf returns displayName when known', () => {
    useMembersStore.setState({ profiles: { u1: { id: 'u1', displayName: 'Max', email: null } }, memberIds: ['u1'] })
    expect(useMembersStore.getState().nameOf('u1')).toBe('Max')
  })

  it('nameOf falls back to a short id when unknown', () => {
    expect(useMembersStore.getState().nameOf('abcdef12-3456')).toBe('Mitglied abcdef12')
  })

  it('members() lists known profiles in memberIds order', () => {
    useMembersStore.setState({
      profiles: { u1: { id: 'u1', displayName: 'Max', email: null }, u2: { id: 'u2', displayName: 'Lukas', email: null } },
      memberIds: ['u2', 'u1'],
    })
    expect(useMembersStore.getState().members().map(m => m.displayName)).toEqual(['Lukas', 'Max'])
  })
})
