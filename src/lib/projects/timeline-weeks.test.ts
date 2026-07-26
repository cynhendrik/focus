import { describe, it, expect } from 'vitest'
import { rollingWeeks, dateToTimelineOffset, kwOf } from './timeline-weeks'

describe('kwOf', () => {
  it('berechnet KW 18 für den 27.04.2026 (bekannter Referenzwert)', () => {
    expect(kwOf(new Date(2026, 3, 27))).toBe(18)
  })
  it('berechnet KW 1 für den 1.1.2026', () => {
    expect(kwOf(new Date(2026, 0, 1))).toBe(1)
  })
})

describe('rollingWeeks', () => {
  const today = new Date(2026, 4, 18) // Mo, 18.05.2026 -> KW 21

  it('liefert weeksBack + weeksForward Einträge', () => {
    expect(rollingWeeks(today, 4, 10)).toHaveLength(14)
  })

  it('erste Woche beginnt weeksBack Wochen vor dem Montag von heute', () => {
    const weeks = rollingWeeks(today, 4, 10)
    expect(weeks[0].kw).toBe(18)
  })

  it('setzt monthLabel nur bei der ersten Woche und bei Monatswechseln', () => {
    const weeks = rollingWeeks(today, 4, 10)
    expect(weeks[0].monthLabel).toBe('Apr')
    const juneStartIdx = weeks.findIndex(w => w.start.getMonth() === 5)
    expect(weeks[juneStartIdx].monthLabel).toBe('Jun')
    expect(weeks[juneStartIdx - 1].monthLabel).toBeNull()
  })
})

describe('dateToTimelineOffset', () => {
  const weeks = rollingWeeks(new Date(2026, 4, 18), 4, 10)

  it('gibt 0 für den Start der ersten Woche zurück (27.04.2026)', () => {
    expect(dateToTimelineOffset('2026-04-27', weeks)).toBe(0)
  })

  it('gibt 1 für den Start der zweiten Woche zurück (04.05.2026)', () => {
    expect(dateToTimelineOffset('2026-05-04', weeks)).toBe(1)
  })

  it('gibt null für ein Datum vor dem Fenster zurück', () => {
    expect(dateToTimelineOffset('2020-01-01', weeks)).toBeNull()
  })

  it('gibt null für ein Datum weit nach dem Fenster zurück', () => {
    expect(dateToTimelineOffset('2030-01-01', weeks)).toBeNull()
  })
})
