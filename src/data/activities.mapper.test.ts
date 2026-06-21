import { describe, it, expect } from 'vitest'
import { activityRowToActivity, activityPayloadToRow, activityUpdateToPatch } from './activities.mapper'

const row = {
  id: 'a1', workspace_id: 'ws1', created_by: 'u1', account_id: 'acc1', customer_id: 'acc1',
  type: 'note', title: 'T', body: 'B', payload: { note_type: 'gespraech', pinned: true },
  status: 'open', due_at: null, created_at: '2026-01-01', updated_at: '2026-01-02',
}

describe('activities.mapper', () => {
  it('activityRowToActivity: snake→camel, payload jsonb→String', () => {
    const a = activityRowToActivity(row)
    expect(a.workspaceId).toBe('ws1')
    expect(a.accountId).toBe('acc1')
    expect(a.customerId).toBe('acc1')
    expect(a.type).toBe('note')
    expect(typeof a.payload).toBe('string')
    expect(JSON.parse(a.payload!)).toEqual({ note_type: 'gespraech', pinned: true })
    expect(a.createdAt).toBe('2026-01-01')
  })
  it('activityRowToActivity: payload als String wird durchgereicht', () => {
    const a = activityRowToActivity({ ...row, payload: '{"x":1}' })
    expect(a.payload).toBe('{"x":1}')
  })
  it('activityPayloadToRow: payload String→Objekt, created_at+updated_at gesetzt, beide ID-Spalten', () => {
    const r = activityPayloadToRow(
      { workspaceId: 'ws1', createdBy: 'u1', accountId: 'acc1', type: 'note', title: 'T', body: 'B', payload: '{"pinned":true}' },
      { id: 'a1', now: '2026-06-01T00:00:00Z' },
    )
    expect(r.id).toBe('a1')
    expect(r.account_id).toBe('acc1')
    expect(r.customer_id).toBeNull()           // kein customerId im Payload → null (mirror local)
    expect(r.payload).toEqual({ pinned: true }) // Objekt für jsonb
    expect(r.status).toBe('open')              // default
    expect(r.created_at).toBe('2026-06-01T00:00:00Z')
    expect(r.updated_at).toBe('2026-06-01T00:00:00Z')
  })
  it('activityPayloadToRow: customerId wird übernommen wenn vorhanden', () => {
    const r = activityPayloadToRow(
      { workspaceId: 'ws1', createdBy: 'u1', accountId: 'acc1', customerId: 'cust1', type: 'call' },
      { id: 'a1', now: '2026-06-01T00:00:00Z' },
    )
    expect(r.customer_id).toBe('cust1')
  })
  it('activityUpdateToPatch: nur gesetzte Felder + updated_at', () => {
    const p = activityUpdateToPatch({ status: 'done' }, '2026-06-02T00:00:00Z')
    expect(p).toEqual({ status: 'done', updated_at: '2026-06-02T00:00:00Z' })
  })
})

describe('activities.mapper — assignee', () => {
  it('activityPayloadToRow schreibt assignee', () => {
    const r = activityPayloadToRow(
      { workspaceId: 'ws1', createdBy: 'u1', accountId: 'a1', type: 'task', assignee: 'u2' } as any,
      { id: 'a1', now: '2026-06-01T00:00:00Z' },
    )
    expect(r.assignee).toBe('u2')
  })
  it('activityPayloadToRow ohne assignee → null', () => {
    const r = activityPayloadToRow(
      { workspaceId: 'ws1', createdBy: 'u1', accountId: 'a1', type: 'task' } as any,
      { id: 'a1', now: '2026-06-01T00:00:00Z' },
    )
    expect(r.assignee).toBeNull()
  })
  it('activityUpdateToPatch nimmt assignee nur wenn gesetzt', () => {
    expect(activityUpdateToPatch({ assignee: 'u2' } as any, 'NOW').assignee).toBe('u2')
    expect('assignee' in activityUpdateToPatch({ title: 'x' } as any, 'NOW')).toBe(false)
  })
  it('activityRowToActivity liest assignee', () => {
    const a = activityRowToActivity({ id: 'a1', workspace_id: 'ws1', created_by: 'u1', account_id: 'a1', type: 'task', payload: {}, status: 'open', assignee: 'u2', created_at: '', updated_at: '' })
    expect((a as any).assignee).toBe('u2')
  })
})

describe('activities.mapper — account_id empty→null (FK safety)', () => {
  it('leerer accountId wird zu null (FK activities_account_id_fkey)', () => {
    const r = activityPayloadToRow(
      { workspaceId: 'ws1', createdBy: 'u1', accountId: '', type: 'task' } as any,
      { id: 'a1', now: '2026-06-01T00:00:00Z' },
    )
    expect(r.account_id).toBeNull()
  })
  it('echter accountId bleibt erhalten', () => {
    const r = activityPayloadToRow(
      { workspaceId: 'ws1', createdBy: 'u1', accountId: 'acc1', type: 'task' } as any,
      { id: 'a1', now: '2026-06-01T00:00:00Z' },
    )
    expect(r.account_id).toBe('acc1')
  })
})
