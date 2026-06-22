import { describe, it, expect } from 'vitest'
import { hasCapability, type Membership } from './capabilities'

const m = (role: Membership['role'], capabilities: Membership['capabilities'] = []): Membership => ({ role, capabilities })

describe('hasCapability', () => {
  it('lokal/solo (nicht shared): immer true, auch ohne Membership', () => {
    expect(hasCapability(null, 'finances', false)).toBe(true)
    expect(hasCapability(m('member'), 'contracts', false)).toBe(true)
  })
  it('shared ohne Membership: false', () => {
    expect(hasCapability(null, 'finances', true)).toBe(false)
  })
  it('owner: alle Capabilities inkl. manage_members', () => {
    expect(hasCapability(m('owner'), 'finances', true)).toBe(true)
    expect(hasCapability(m('owner'), 'manage_members', true)).toBe(true)
  })
  it('admin: alles außer manage_members', () => {
    expect(hasCapability(m('admin'), 'finances', true)).toBe(true)
    expect(hasCapability(m('admin'), 'contracts', true)).toBe(true)
    expect(hasCapability(m('admin'), 'manage_members', true)).toBe(false)
  })
  it('member: nur explizit freigeschaltete Capabilities', () => {
    expect(hasCapability(m('member', ['contracts']), 'contracts', true)).toBe(true)
    expect(hasCapability(m('member', ['contracts']), 'finances', true)).toBe(false)
    expect(hasCapability(m('member'), 'manage_members', true)).toBe(false)
  })
})
