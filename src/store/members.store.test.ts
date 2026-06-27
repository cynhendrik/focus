import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useMembersStore } from './members.store'
import { ProfilesGateway } from '@/data/profiles.gateway'
import { useAuthStore } from '@/store/auth.store'

vi.mock('@/data/profiles.gateway', () => ({
  ProfilesGateway: { ensureSelf: vi.fn().mockResolvedValue(undefined), listByIds: vi.fn().mockResolvedValue([]) },
}))

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

  it('setMyDisplayName writes the profile and updates the local store immediately', async () => {
    vi.mocked(ProfilesGateway.ensureSelf).mockClear()
    useAuthStore.setState({ user: { id: 'me', email: 'team@cultera.de' } as any })
    await useMembersStore.getState().setMyDisplayName('Hendrik Wehe')
    expect(ProfilesGateway.ensureSelf).toHaveBeenCalledWith({ id: 'me', displayName: 'Hendrik Wehe', email: 'team@cultera.de' })
    expect(useMembersStore.getState().nameOf('me')).toBe('Hendrik Wehe')
  })

  it('setMyDisplayName falls back to the email local-part when name is blank', async () => {
    useAuthStore.setState({ user: { id: 'me', email: 'team@cultera.de' } as any })
    await useMembersStore.getState().setMyDisplayName('   ')
    expect(useMembersStore.getState().nameOf('me')).toBe('team')
  })
})
