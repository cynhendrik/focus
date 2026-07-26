import { describe, it, expect } from 'vitest'
import { projectHealthZeit, projectHealthBudget, projectHealthStimmung, projectSignals } from './signals'
import type { ProjectPhase } from '@/types/project.types'

const today = new Date(2026, 4, 18) // Mo, 18.05.2026

function phase(overrides: Partial<ProjectPhase> = {}): ProjectPhase {
  return {
    id: 'ph1', projectId: 'p1', name: 'Konzept', orderIndex: 0, createdAt: '2026-01-01',
    startDate: '2026-04-27', endDate: '2026-05-11', gateName: 'Konzeptfreigabe',
    gateState: 'open', gateDate: null, gateApprovedBy: null, progressPercent: 50,
    ...overrides,
  }
}

describe('projectHealthZeit', () => {
  it('ist ok ohne pending Gates', () => {
    expect(projectHealthZeit([phase({ gateState: 'open' })], today)).toBe('ok')
  })
  it('ist ok, wenn das pending Gate erst in 6 Tagen fällig ist', () => {
    expect(projectHealthZeit([phase({ gateState: 'pending', gateDate: '2026-05-24' })], today)).toBe('ok')
  })
  it('ist warn, wenn das pending Gate in genau 5 Tagen fällig ist', () => {
    expect(projectHealthZeit([phase({ gateState: 'pending', gateDate: '2026-05-23' })], today)).toBe('warn')
  })
  it('ist warn, wenn das pending Gate heute fällig ist', () => {
    expect(projectHealthZeit([phase({ gateState: 'pending', gateDate: '2026-05-18' })], today)).toBe('warn')
  })
  it('ist bad, wenn das pending Gate bereits überfällig ist', () => {
    expect(projectHealthZeit([phase({ gateState: 'pending', gateDate: '2026-05-12' })], today)).toBe('bad')
  })
  it('ignoriert pending Gates ohne Termin', () => {
    expect(projectHealthZeit([phase({ gateState: 'pending', gateDate: null })], today)).toBe('ok')
  })
})

describe('projectHealthBudget / projectHealthStimmung', () => {
  it('sind in dieser Etappe fix ok', () => {
    expect(projectHealthBudget()).toBe('ok')
    expect(projectHealthStimmung()).toBe('ok')
  })
})

describe('projectSignals', () => {
  it('liefert nur pending Gates', () => {
    const signals = projectSignals([phase({ gateState: 'open' }), phase({ id: 'ph2', gateState: 'pending', gateDate: '2026-05-22' })], today)
    expect(signals).toHaveLength(1)
    expect(signals[0].phaseId).toBe('ph2')
  })
  it('markiert überfällige Gates als bad, sonst warn', () => {
    const overdue = projectSignals([phase({ gateState: 'pending', gateDate: '2026-05-01' })], today)
    expect(overdue[0].tone).toBe('bad')
    const upcoming = projectSignals([phase({ gateState: 'pending', gateDate: '2026-05-22' })], today)
    expect(upcoming[0].tone).toBe('warn')
  })
  it('formatiert das Datum als TT.MM.JJJJ im detail-Text', () => {
    const signals = projectSignals([phase({ gateState: 'pending', gateDate: '2026-05-22' })], today)
    expect(signals[0].detail).toContain('22.05.2026')
  })
})
