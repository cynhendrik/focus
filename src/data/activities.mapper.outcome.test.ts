import { describe, it, expect } from 'vitest'
import { activityPayloadToRow } from './activities.mapper'

const base = {
  workspaceId: 'ws-1', createdBy: 'u-1', accountId: 'acc-1',
  type: 'call' as const, title: 'Anruf',
}

describe('activityPayloadToRow — outcome', () => {
  it('legt das Outcome im payload-JSONB ab (Cloud hat keine outcome-Spalte)', () => {
    const row = activityPayloadToRow(
      { ...base, outcome: 'strong_interest' },
      { id: 'a-1', now: '2026-07-04T10:00:00Z' },
    )
    expect((row.payload as Record<string, unknown>).outcome).toBe('strong_interest')
  })

  it('ohne Outcome bleibt das payload-Objekt unverändert', () => {
    const row = activityPayloadToRow(
      { ...base, payload: '{"is_follow_up":true}' },
      { id: 'a-1', now: '2026-07-04T10:00:00Z' },
    )
    expect(row.payload).toEqual({ is_follow_up: true })
  })
})
