import { describe, it, expect } from 'vitest'
import { outcomeOptionsFor, autoFollowUpForOutcome } from './outcomes'

const base = {
  accountId: 'acc-1',
  workspaceId: 'ws-1',
  userId: 'user-1',
  leadName: 'Anna Beispiel',
  now: new Date('2026-07-04T10:00:00Z'),
}

describe('outcomeOptionsFor', () => {
  it('Call/Meeting bieten die Gesprächs-Ergebnisse an', () => {
    const values = outcomeOptionsFor('call').map(o => o.value)
    expect(values).toContain('strong_interest')
    expect(values).toContain('interest_follow_up')
    expect(values).toContain('proposal_requested')
    expect(values).toContain('no_reply')          // „Nicht erreicht"
    expect(values).toContain('no_show')
    expect(outcomeOptionsFor('meeting').length).toBeGreaterThan(0)
  })

  it('E-Mail bietet Antwort-Ergebnisse an', () => {
    const values = outcomeOptionsFor('email').map(o => o.value)
    expect(values).toContain('reply_received')
    expect(values).toContain('no_reply')
    expect(values).not.toContain('no_show')
  })

  it('Notizen und Follow-ups haben keine Ergebnis-Auswahl', () => {
    expect(outcomeOptionsFor('note')).toEqual([])
    expect(outcomeOptionsFor('followup')).toEqual([])
  })

  it('jede Option hat ein deutsches Label', () => {
    for (const o of outcomeOptionsFor('call')) {
      expect(o.label.length).toBeGreaterThan(0)
    }
  })
})

describe('autoFollowUpForOutcome', () => {
  it('„Nicht erreicht" erzeugt ein Follow-up in 3 Tagen', () => {
    const p = autoFollowUpForOutcome({ ...base, outcome: 'no_reply' })
    expect(p).not.toBeNull()
    expect(p!.type).toBe('task')
    expect(p!.status).toBe('open')
    expect(p!.dueAt).toBe('2026-07-07')
    expect(p!.accountId).toBe('acc-1')
    expect(p!.title).toContain('Anna Beispiel')
    expect(JSON.parse(p!.payload!).is_follow_up).toBe(true)
  })

  it('No-Show erzeugt ebenfalls ein Follow-up in 3 Tagen', () => {
    const p = autoFollowUpForOutcome({ ...base, outcome: 'no_show' })
    expect(p).not.toBeNull()
    expect(p!.dueAt).toBe('2026-07-07')
  })

  it('positive Ergebnisse erzeugen kein automatisches Follow-up', () => {
    expect(autoFollowUpForOutcome({ ...base, outcome: 'strong_interest' })).toBeNull()
    expect(autoFollowUpForOutcome({ ...base, outcome: 'reply_received' })).toBeNull()
    expect(autoFollowUpForOutcome({ ...base, outcome: undefined })).toBeNull()
  })

  it('Monatswechsel wird korrekt gerechnet', () => {
    const p = autoFollowUpForOutcome({ ...base, outcome: 'no_reply', now: new Date('2026-07-30T10:00:00Z') })
    expect(p!.dueAt).toBe('2026-08-02')
  })
})
