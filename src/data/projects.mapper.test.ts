import { describe, it, expect } from 'vitest'
import { projectRowToProject, projectToRow, projectPhaseRowToPhase } from './projects.mapper'

describe('projectRowToProject', () => {
  it('maps a full row', () => {
    const row = {
      id: 'p1', workspace_id: 'ws1', account_id: 'a1', title: 'Relaunch',
      description: 'Kurzbeschreibung', status: 'paused', current_phase_id: 'ph1',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z', completed_at: null,
      retainer_monthly: 8500, retainer_hours: 60, retainer_months: 12,
    }
    expect(projectRowToProject(row)).toEqual({
      id: 'p1', workspaceId: 'ws1', accountId: 'a1', title: 'Relaunch',
      description: 'Kurzbeschreibung', status: 'paused', currentPhaseId: 'ph1',
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', completedAt: null,
      retainerMonthly: 8500, retainerHours: 60, retainerMonths: 12,
    })
  })

  it('defaults nullable fields when absent', () => {
    const row = {
      id: 'p1', workspace_id: 'ws1', account_id: 'a1', title: 'Relaunch',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    }
    const project = projectRowToProject(row)
    expect(project.description).toBeNull()
    expect(project.status).toBe('active')
    expect(project.currentPhaseId).toBeNull()
    expect(project.completedAt).toBeNull()
    expect(project.retainerMonthly).toBe(0)
    expect(project.retainerHours).toBe(0)
    expect(project.retainerMonths).toBeNull()
  })
})

describe('projectToRow', () => {
  it('maps camelCase to snake_case, description optional, writes updated_at from ctx.now', () => {
    const row = projectToRow(
      { workspaceId: 'ws1', accountId: 'a1', title: 'Relaunch', retainerMonthly: 4000, retainerHours: 20, retainerMonths: null },
      { id: 'p1', now: '2026-01-03T00:00:00Z', isNew: false },
    )
    expect(row).toEqual({
      id: 'p1', workspace_id: 'ws1', account_id: 'a1', title: 'Relaunch', description: null,
      updated_at: '2026-01-03T00:00:00Z', retainer_monthly: 4000, retainer_hours: 20, retainer_months: null,
    })
  })

  it('sets created_at and status=active only when isNew is true', () => {
    const row = projectToRow(
      { workspaceId: 'ws1', accountId: 'a1', title: 'Relaunch', retainerMonthly: 0, retainerHours: 0, retainerMonths: null },
      { id: 'p1', now: '2026-01-03T00:00:00Z', isNew: true },
    )
    expect(row).toEqual({
      id: 'p1', workspace_id: 'ws1', account_id: 'a1', title: 'Relaunch', description: null,
      updated_at: '2026-01-03T00:00:00Z', created_at: '2026-01-03T00:00:00Z', status: 'active',
      retainer_monthly: 0, retainer_hours: 0, retainer_months: null,
    })
  })

  it('does not overwrite status when isNew is false (editing an existing cloud project)', () => {
    const row = projectToRow(
      { workspaceId: 'ws1', accountId: 'a1', title: 'Relaunch (renamed)', retainerMonthly: 0, retainerHours: 0, retainerMonths: null },
      { id: 'p1', now: '2026-01-04T00:00:00Z', isNew: false },
    )
    expect(row.status).toBeUndefined()
    expect(row.created_at).toBeUndefined()
  })

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
  it('maps a phase row', () => {
    const row = { id: 'ph1', project_id: 'p1', name: 'Konzept', order_index: 0, created_at: '2026-01-01T00:00:00Z',
      start_date: '2026-04-27', end_date: '2026-05-11', gate_name: 'Freigabe', gate_state: 'open',
      gate_date: null, gate_approved_by: null, progress_percent: 0 }
    expect(projectPhaseRowToPhase(row)).toEqual({
      id: 'ph1', projectId: 'p1', name: 'Konzept', orderIndex: 0, createdAt: '2026-01-01T00:00:00Z',
      startDate: '2026-04-27', endDate: '2026-05-11', gateName: 'Freigabe', gateState: 'open',
      gateDate: null, gateApprovedBy: null, progressPercent: 0,
    })
  })

  it('mappt Zeitraum- und Gate-Spalten mit pending-Status', () => {
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
