import { describe, it, expect } from 'vitest'
import { profileRowToProfile } from './profiles.mapper'

describe('profileRowToProfile', () => {
  it('maps snake_case to camelCase', () => {
    const p = profileRowToProfile({ id: 'u1', display_name: 'Max Mustermann', email: 'max@x.de', updated_at: 'T1' })
    expect(p).toEqual({ id: 'u1', displayName: 'Max Mustermann', email: 'max@x.de' })
  })
  it('null-ish display_name / email default safely', () => {
    const p = profileRowToProfile({ id: 'u1', display_name: null, email: null })
    expect(p.displayName).toBe('')
    expect(p.email).toBeNull()
  })
})
