import { describe, it, expect } from 'vitest'
import { isQuietTime, isWeekend, shouldFireBriefing } from './quiet-hours'

const CFG = { quietHoursEnabled: true, quietFrom: '18:00', quietUntil: '07:00', weekendQuiet: true }
// 2026-07-01 ist ein Mittwoch, 2026-07-04 ein Samstag.
const wed = (h: number, m = 0) => new Date(2026, 6, 1, h, m)
const sat = (h: number) => new Date(2026, 6, 4, h)

describe('isQuietTime', () => {
  it('Abend und frueher Morgen sind Ruhezeit (ueber Mitternacht)', () => {
    expect(isQuietTime(wed(19), CFG)).toBe(true)
    expect(isQuietTime(wed(6, 30), CFG)).toBe(true)
    expect(isQuietTime(wed(10), CFG)).toBe(false)
  })
  it('Wochenende ist Ruhezeit, wenn weekendQuiet an', () => {
    expect(isQuietTime(sat(10), CFG)).toBe(true)
    expect(isQuietTime(sat(10), { ...CFG, weekendQuiet: false })).toBe(false)
  })
  it('deaktivierte Ruhezeiten blocken nicht', () => {
    expect(isQuietTime(wed(19), { ...CFG, quietHoursEnabled: false, weekendQuiet: false })).toBe(false)
  })
})

describe('isWeekend', () => {
  it('Samstag/Sonntag true, Mittwoch false', () => {
    expect(isWeekend(sat(10))).toBe(true)
    expect(isWeekend(wed(10))).toBe(false)
    expect(isWeekend(new Date(2026, 6, 5, 10))).toBe(true) // Sonntag
  })
})

describe('minutesOf-Robustheit', () => {
  it('leere Zeitangabe macht das Fenster nicht faelschlich aktiv', () => {
    const cfg = { quietHoursEnabled: true, quietFrom: '', quietUntil: '', weekendQuiet: false }
    expect(isQuietTime(new Date(2026, 6, 1, 10), cfg)).toBe(false)
  })
})

describe('shouldFireBriefing', () => {
  const BCFG = { ...CFG, briefingEnabled: true, briefingTime: '08:30' }
  it('feuert werktags ab Briefing-Zeit genau einmal pro Tag', () => {
    expect(shouldFireBriefing(wed(8, 29), BCFG, '', '2026-07-01')).toBe(false)
    expect(shouldFireBriefing(wed(8, 31), BCFG, '', '2026-07-01')).toBe(true)
    expect(shouldFireBriefing(wed(9), BCFG, '2026-07-01', '2026-07-01')).toBe(false)
  })
  it('feuert nicht am Wochenende, nicht wenn deaktiviert, nicht in Ruhezeit', () => {
    expect(shouldFireBriefing(sat(9), BCFG, '', '2026-07-04')).toBe(false)
    expect(shouldFireBriefing(wed(9), { ...BCFG, briefingEnabled: false }, '', '2026-07-01')).toBe(false)
    expect(shouldFireBriefing(wed(19), BCFG, '', '2026-07-01')).toBe(false)
  })
})
