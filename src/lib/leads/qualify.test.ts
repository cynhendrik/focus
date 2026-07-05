import { describe, it, expect } from 'vitest'
import { appointmentFollowUp } from './qualify'

const base = {
  leadId: 'lead-1',
  leadName: 'Anna Beispiel',
  workspaceId: 'ws-1',
  userId: 'user-1',
}

describe('appointmentFollowUp', () => {
  it('ohne Termindatum entsteht kein Follow-up', () => {
    expect(appointmentFollowUp({ ...base })).toBeNull()
    expect(appointmentFollowUp({ ...base, appointmentDate: '' })).toBeNull()
  })

  it('mit Termindatum entsteht ein Follow-up am Termin (task + is_follow_up)', () => {
    const p = appointmentFollowUp({ ...base, appointmentDate: '2026-07-10' })
    expect(p).not.toBeNull()
    expect(p!.type).toBe('task')
    expect(p!.status).toBe('open')
    expect(p!.dueAt).toBe('2026-07-10')
    expect(p!.accountId).toBe('lead-1')
    expect(p!.workspaceId).toBe('ws-1')
    expect(p!.createdBy).toBe('user-1')
    expect(p!.title).toContain('Anna Beispiel')
    // Konvention der Follow-Up-Listen: type 'task' + is_follow_up im Payload.
    expect(JSON.parse(p!.payload!)).toEqual({ is_follow_up: true })
  })
})
