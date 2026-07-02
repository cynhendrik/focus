import { describe, it, expect } from 'vitest'
import { buildTodayLine } from './briefing'

describe('buildTodayLine', () => {
  it('baut den Satz mit deutschen Pluralformen und Und-Verknuepfung', () => {
    expect(buildTodayLine({ overdueCount: 2, overdueSum: 2400, fusDue: 1, tasksDue: 0, eventsToday: 1 }))
      .toBe('Heute stehen an: 2 Rechnungen (2.400 €), 1 Follow-up und 1 Termin.')
  })
  it('Singular korrekt', () => {
    expect(buildTodayLine({ overdueCount: 1, overdueSum: 500, fusDue: 0, tasksDue: 1, eventsToday: 0 }))
      .toBe('Heute stehen an: 1 Rechnung (500 €) und 1 To-do.')
  })
  it('leerer Tag → leerer String (Stille ist die Belohnung)', () => {
    expect(buildTodayLine({ overdueCount: 0, overdueSum: 0, fusDue: 0, tasksDue: 0, eventsToday: 0 })).toBe('')
  })
})
