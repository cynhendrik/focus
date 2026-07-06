import { describe, it, expect } from 'vitest'
import { projectRowToProject, projectToRow, projectPhaseRowToPhase } from './projects.mapper'

describe('projectRowToProject', () => {
  it('maps a full row', () => {
    const row = {
      id: 'p1', workspace_id: 'ws1', account_id: 'a1', title: 'Relaunch',
      description: 'Kurzbeschreibung', status: 'paused', current_phase_id: 'ph1',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z', completed_at: null,
    }
    expect(projectRowToProject(row)).toEqual({
      id: 'p1', workspaceId: 'ws1', accountId: 'a1', title: 'Relaunch',
      description: 'Kurzbeschreibung', status: 'paused', currentPhaseId: 'ph1',
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', completedAt: null,
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
  })
})

describe('projectToRow', () => {
  it('maps camelCase to snake_case, description optional, writes updated_at from ctx.now', () => {
    const row = projectToRow(
      { workspaceId: 'ws1', accountId: 'a1', title: 'Relaunch' },
      { id: 'p1', now: '2026-01-03T00:00:00Z', isNew: false },
    )
    expect(row).toEqual({
      id: 'p1', workspace_id: 'ws1', account_id: 'a1', title: 'Relaunch', description: null,
      updated_at: '2026-01-03T00:00:00Z',
    })
  })

  it('sets created_at and status=active only when isNew is true', () => {
    const row = projectToRow(
      { workspaceId: 'ws1', accountId: 'a1', title: 'Relaunch' },
      { id: 'p1', now: '2026-01-03T00:00:00Z', isNew: true },
    )
    expect(row).toEqual({
      id: 'p1', workspace_id: 'ws1', account_id: 'a1', title: 'Relaunch', description: null,
      updated_at: '2026-01-03T00:00:00Z', created_at: '2026-01-03T00:00:00Z', status: 'active',
    })
  })

  it('does not overwrite status when isNew is false (editing an existing cloud project)', () => {
    const row = projectToRow(
      { workspaceId: 'ws1', accountId: 'a1', title: 'Relaunch (renamed)' },
      { id: 'p1', now: '2026-01-04T00:00:00Z', isNew: false },
    )
    expect(row.status).toBeUndefined()
    expect(row.created_at).toBeUndefined()
  })
})

describe('projectPhaseRowToPhase', () => {
  it('maps a phase row', () => {
    const row = { id: 'ph1', project_id: 'p1', name: 'Konzept', order_index: 0, created_at: '2026-01-01T00:00:00Z' }
    expect(projectPhaseRowToPhase(row)).toEqual({
      id: 'ph1', projectId: 'p1', name: 'Konzept', orderIndex: 0, createdAt: '2026-01-01T00:00:00Z',
    })
  })
})
