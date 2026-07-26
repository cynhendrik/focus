import { describe, it, expect } from 'vitest'
import { projectRowToProject, projectToRow, projectPhaseRowToPhase } from './projects.mapper'

describe('projectRowToProject', () => {
  it('mappt Retainer-Spalten aus snake_case', () => {
    const row = {
      id: 'p1', workspace_id: 'ws-1', account_id: 'a1', title: 'Test', description: null,
      status: 'active', current_phase_id: null, created_at: '2026-01-01', updated_at: '2026-01-01',
      completed_at: null, retainer_monthly: 8500, retainer_hours: 60, retainer_months: 12,
    }
    const p = projectRowToProject(row)
    expect(p.retainerMonthly).toBe(8500)
    expect(p.retainerHours).toBe(60)
    expect(p.retainerMonths).toBe(12)
  })

  it('defaultet retainer_months auf null wenn nicht gesetzt', () => {
    const row = {
      id: 'p1', workspace_id: 'ws-1', account_id: 'a1', title: 'Test', description: null,
      status: 'active', current_phase_id: null, created_at: '2026-01-01', updated_at: '2026-01-01',
      completed_at: null, retainer_monthly: 0, retainer_hours: 0, retainer_months: null,
    }
    expect(projectRowToProject(row).retainerMonths).toBeNull()
  })
})

describe('projectToRow', () => {
  it('nimmt Retainer-Felder in die Row auf, auch bei Update', () => {
    const row = projectToRow(
      { workspaceId: 'ws-1', accountId: 'a1', title: 'Test', retainerMonthly: 4000, retainerHours: 20, retainerMonths: null },
      { id: 'p1', now: '2026-01-01', isNew: false },
    )
    expect(row.retainer_monthly).toBe(4000)
    expect(row.retainer_hours).toBe(20)
    expect(row.retainer_months).toBeNull()
  })
})

describe('projectPhaseRowToPhase', () => {
  it('mappt Zeitraum- und Gate-Spalten', () => {
    const row = {
      id: 'ph1', project_id: 'p1', name: 'Konzept', order_index: 0, created_at: '2026-01-01',
      start_date: '2026-04-27', end_date: '2026-05-11', gate_name: 'Freigabe',
      gate_state: 'pending', gate_date: '2026-05-11', gate_approved_by: null, progress_percent: 42,
    }
    const phase = projectPhaseRowToPhase(row)
    expect(phase.startDate).toBe('2026-04-27')
    expect(phase.gateState).toBe('pending')
    expect(phase.progressPercent).toBe(42)
  })
})
