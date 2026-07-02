import { describe, it, expect } from 'vitest'
import { followupSubject, followupBody } from './followup'

describe('followup templates', () => {
  it('Betreff traegt das Thema', () => {
    expect(followupSubject({ title: 'Angebot Website' })).toBe('Kurze Rückfrage: Angebot Website')
  })
  it('Body nennt Kontakt und Thema; ueberfaellig wird erwaehnt', () => {
    const b = followupBody({ contactName: 'Frau Meyer', title: 'Angebot Website', daysOverdue: 5 })
    expect(b).toContain('Frau Meyer')
    expect(b).toContain('Angebot Website')
    const fresh = followupBody({ contactName: 'Frau Meyer', title: 'Angebot Website', daysOverdue: 0 })
    expect(fresh).not.toContain('Tagen')
  })
})
