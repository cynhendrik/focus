import { describe, it, expect } from 'vitest'
import { companyRowToSettings, emptyCompanySettings } from './company.mapper'

describe('company.mapper', () => {
  it('companyRowToSettings: jsonb-Objekte direkt, crm_config→crmConfig', () => {
    const s = companyRowToSettings({
      id: 'ws1', workspace_id: 'ws1',
      profile: { name: 'ACME GmbH', taxId: 'DE123' },
      modules: { crm: true, finanzen: true },
      crm_config: { foo: 'bar' },
      updated_at: '2026-06-22T10:00:00Z',
    })
    expect(s).toEqual({
      id: 'ws1',
      profile: { name: 'ACME GmbH', taxId: 'DE123' },
      modules: { crm: true, finanzen: true },
      crmConfig: { foo: 'bar' },
      updatedAt: '2026-06-22T10:00:00Z',
    })
  })

  it('companyRowToSettings: JSON-String-Spalten werden geparst, fehlende → {}', () => {
    const s = companyRowToSettings({
      id: 'ws1', profile: '{"name":"X"}', modules: null, crm_config: undefined, updated_at: null,
    })
    expect(s.profile).toEqual({ name: 'X' })
    expect(s.modules).toEqual({})
    expect(s.crmConfig).toEqual({})
    expect(s.updatedAt).toBe('')
  })

  it('emptyCompanySettings: leere Firma mit id', () => {
    expect(emptyCompanySettings('ws9')).toEqual({ id: 'ws9', profile: {}, modules: {}, crmConfig: {}, updatedAt: '' })
  })
})
