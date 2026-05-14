import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuthStore } from './auth.store'

beforeEach(() => {
  useAuthStore.setState({ user: null, session: null, loading: false })
  vi.clearAllMocks()
})

describe('useAuthStore', () => {
  it('starts with null user and loading false after setState', () => {
    const { user, loading } = useAuthStore.getState()
    expect(user).toBeNull()
    expect(loading).toBe(false)
  })

  it('signIn calls supabase.auth.signInWithPassword', async () => {
    const { supabase } = await import('@/lib/supabase')
    await useAuthStore.getState().signIn('test@example.com', 'pass')
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'pass',
    })
  })

  it('signIn throws when supabase returns error', async () => {
    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: {} as any,
      error: { message: 'Invalid credentials', status: 400, code: 'invalid_credentials', name: 'AuthApiError' } as any,
    })
    await expect(useAuthStore.getState().signIn('bad@email.com', 'wrong')).rejects.toThrow()
  })

  it('signOut clears user and session', async () => {
    useAuthStore.setState({ user: { id: 'u1' } as any, session: {} as any })
    await useAuthStore.getState().signOut()
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().session).toBeNull()
  })
})
