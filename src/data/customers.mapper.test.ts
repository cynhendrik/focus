import { describe, it, expect } from 'vitest'
import { accountToCustomer, customerPayloadToAccountPayload } from './customers.mapper'
import type { Account } from '@/types/account.types'

const account: Account = {
  id: 'a1', workspaceId: 'ws1', createdBy: 'u1', name: 'ACME AG',
  kind: 'company', status: 'prospect', priority: 'vip',
  tags: ['x'], goals: ['g'], isPrivate: false, socialLinks: '{}',
  leadScore: 75, scoreFactors: { qualified_meeting: 25 },
  email: 'a@b.de', phone: '123', vatId: 'DE123',
  archivedAt: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z',
}

describe('customers.mapper', () => {
  it('accountToCustomer übersetzt Status/Priority und Firma', () => {
    const c = accountToCustomer(account)
    expect(c.company).toBe('ACME AG')        // kind=company → company gesetzt
    expect(c.status).toBe('lead')            // prospect → lead
    expect(c.priority).toBe('high')          // vip → high
    expect(c.leadScore).toBe(75)
    expect(c.scoreFactors).toEqual({ qualified_meeting: 25 })
    expect(c.vatId).toBe('DE123')
    expect(c.archivedAt).toBeNull()
  })

  it('accountToCustomer mappt churned → lost', () => {
    expect(accountToCustomer({ ...account, status: 'churned' }).status).toBe('lost')
  })

  it('customerPayloadToAccountPayload übersetzt zurück', () => {
    const p = customerPayloadToAccountPayload({
      workspaceId: 'ws1', createdBy: 'u1', name: 'ACME AG',
      company: 'ACME AG', status: 'lead', priority: 'high', email: 'a@b.de',
    })
    expect(p.kind).toBe('company')           // company gesetzt → company
    expect(p.status).toBe('prospect')        // lead → prospect
    expect(p.priority).toBe('high')
    expect(p.name).toBe('ACME AG')
  })

  it('customerPayloadToAccountPayload ohne company → individual', () => {
    const p = customerPayloadToAccountPayload({ workspaceId: 'ws1', createdBy: 'u1', name: 'Max' })
    expect(p.kind).toBe('individual')
  })
})
