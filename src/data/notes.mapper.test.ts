import { describe, it, expect } from 'vitest'
import { activityToNote, notePayloadToActivityPayload } from './notes.mapper'
import type { Activity } from '@/types/pipeline.types'

const act: Activity = {
  id: 'n1', workspaceId: 'ws1', createdBy: 'u1', accountId: 'c1', type: 'note',
  title: 'Titel', body: 'Inhalt', payload: '{"note_type":"telefon","waiting_reply":true,"pinned":true}',
  status: 'open', createdAt: '2026-01-01', updatedAt: '2026-01-02',
}

describe('notes.mapper', () => {
  it('activityToNote: liest note_type/waiting_reply/pinned aus payload', () => {
    const n = activityToNote(act)
    expect(n.id).toBe('n1')
    expect(n.customerId).toBe('c1')
    expect(n.title).toBe('Titel')
    expect(n.content).toBe('Inhalt')
    expect(n.noteType).toBe('telefon')
    expect(n.waitingReply).toBe(true)
    expect(n.pinned).toBe(true)
  })
  it('activityToNote: defaults bei leerem/ungültigem payload', () => {
    const n = activityToNote({ ...act, payload: 'kaputt' })
    expect(n.noteType).toBe('gespraech'); expect(n.pinned).toBe(false); expect(n.waitingReply).toBe(false)
  })
  it('notePayloadToActivityPayload: type=note, body=content, payload-JSON, account_id aus customerId', () => {
    const p = notePayloadToActivityPayload(
      { customerId: 'c1', title: 'T', content: 'Inhalt', noteType: 'meeting', pinned: true, waitingReply: false },
      { workspaceId: 'ws1', createdBy: 'u1' },
    )
    expect(p.type).toBe('note')
    expect(p.accountId).toBe('c1')
    expect(p.title).toBe('T')
    expect(p.body).toBe('Inhalt')
    expect(JSON.parse(p.payload!)).toEqual({ note_type: 'meeting', waiting_reply: false, pinned: true })
  })
})
