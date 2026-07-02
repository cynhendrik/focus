import { describe, it, expect } from 'vitest'
import { shouldNotify } from './notify.service'

const BASE = {
  briefingEnabled: true, briefingTime: '08:30',
  moneyEventsEnabled: true, teamEventsEnabled: true,
  quietHoursEnabled: true, quietFrom: '18:00', quietUntil: '07:00', weekendQuiet: true,
}
const wed10 = new Date(2026, 6, 1, 10) // Mittwoch 10:00
const wed19 = new Date(2026, 6, 1, 19) // Mittwoch 19:00 (Ruhezeit)

describe('shouldNotify', () => {
  it('respektiert die Kind-Schalter', () => {
    expect(shouldNotify('money', wed10, { ...BASE, moneyEventsEnabled: false })).toBe(false)
    expect(shouldNotify('team', wed10, { ...BASE, teamEventsEnabled: false })).toBe(false)
    expect(shouldNotify('briefing', wed10, { ...BASE, briefingEnabled: false })).toBe(false)
  })
  it('money/team schweigen in der Ruhezeit, briefing prueft Ruhezeit separat', () => {
    expect(shouldNotify('money', wed19, BASE)).toBe(false)
    expect(shouldNotify('team', wed19, BASE)).toBe(false)
    expect(shouldNotify('money', wed10, BASE)).toBe(true)
  })
})
