import { describe, it, expect } from 'vitest'
import { contactRowToContact, contactPayloadToRow } from './contacts.mapper'
import type { UpsertContactPayload } from '@/types/contact.types'

const fullRow = {
  id: 'c1', workspace_id: 'ws1', created_by: 'u1', account_id: 'a1',
  first_name: 'Anna', last_name: 'Müller', email: 'anna@test.de', phone: '+49 30 1',
  role: 'CEO', is_primary: true, avatar_url: 'http://a/x.png',
  linkedin_url: 'https://linkedin.com/in/anna', decision_power: 'high',
  preferred_channel: 'phone', notes: 'Mag Thai', birthday: '1985-03-12',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
}

describe('contacts.mapper', () => {
  it('contactRowToContact: mappt alle snake_case-Spalten', () => {
    const c = contactRowToContact(fullRow)
    expect(c).toEqual({
      id: 'c1', workspaceId: 'ws1', createdBy: 'u1', accountId: 'a1',
      firstName: 'Anna', lastName: 'Müller', email: 'anna@test.de', phone: '+49 30 1',
      role: 'CEO', isPrimary: true, avatarUrl: 'http://a/x.png',
      linkedinUrl: 'https://linkedin.com/in/anna', decisionPower: 'high',
      preferredChannel: 'phone', notes: 'Mag Thai', birthday: '1985-03-12',
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z',
    })
  })

  it('contactRowToContact: null/undefined-Spalten → undefined, is_primary defaultet false', () => {
    const c = contactRowToContact({
      id: 'c2', workspace_id: 'ws1', created_by: 'u1', account_id: null,
      first_name: 'Bob', last_name: null, email: null, phone: null, role: null,
      is_primary: null, avatar_url: null, linkedin_url: null, decision_power: null,
      preferred_channel: null, notes: null, birthday: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    })
    expect(c.accountId).toBeUndefined()
    expect(c.lastName).toBeUndefined()
    expect(c.isPrimary).toBe(false)
  })

  it('contactPayloadToRow: mappt camelCase→snake_case, lässt created_at weg (DB-Default), setzt updated_at', () => {
    const p: UpsertContactPayload = {
      id: 'c1', workspaceId: 'ws1', createdBy: 'u1', accountId: 'a1',
      firstName: 'Anna', lastName: 'Müller', email: 'anna@test.de', phone: '+49 30 1',
      role: 'CEO', isPrimary: true, avatarUrl: 'http://a/x.png',
      linkedinUrl: 'https://linkedin.com/in/anna', decisionPower: 'high',
      preferredChannel: 'phone', notes: 'Mag Thai', birthday: '1985-03-12',
    }
    const row = contactPayloadToRow(p, { id: 'c1', now: '2026-06-22T10:00:00Z' })
    expect(row).toEqual({
      id: 'c1', workspace_id: 'ws1', created_by: 'u1', account_id: 'a1',
      first_name: 'Anna', last_name: 'Müller', email: 'anna@test.de', phone: '+49 30 1',
      role: 'CEO', is_primary: 1, avatar_url: 'http://a/x.png',
      linkedin_url: 'https://linkedin.com/in/anna', decision_power: 'high',
      preferred_channel: 'phone', notes: 'Mag Thai', birthday: '1985-03-12',
      updated_at: '2026-06-22T10:00:00Z',
    })
    expect(row).not.toHaveProperty('created_at')
  })

  it('contactPayloadToRow: leerer accountId → null (FK-Sicherheit), is_primary defaultet false', () => {
    const p: UpsertContactPayload = {
      workspaceId: 'ws1', createdBy: 'u1', accountId: '', firstName: 'Bob',
    }
    const row = contactPayloadToRow(p, { id: 'c2', now: '2026-06-22T10:00:00Z' })
    expect(row.account_id).toBeNull()
    expect(row.is_primary).toBe(0)
    expect(row.last_name).toBeNull()
  })
})
