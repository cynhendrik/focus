import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/store/workspace.store', () => ({
  useWorkspaceStore: { getState: () => ({ isActiveWorkspaceShared: () => false }) },
}))
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

import { invoke } from '@tauri-apps/api/core'
import { ProjectsGateway } from './projects.gateway'

// Regression test fuer den lokalen Pfad: der Rust-Command liefert
// moodboardItems/deliverables/assigneeIds als rohen JSON-String (die
// SQLite-Spalten sind TEXT, die Rust-Struct-Felder String statt Vec<...>).
// Ohne Parsing im Gateway wuerde jeder Aufrufer, der z.B. .map() auf
// diesen Feldern erwartet, mit "X.map is not a function" crashen.
describe('ProjectsGateway lokaler Pfad -- JSON-in-TEXT-Parsing', () => {
  beforeEach(() => vi.clearAllMocks())

  const baseProject = {
    id: 'p1', workspaceId: 'ws1', accountId: 'a1', title: 'X', description: null,
    status: 'active', currentPhaseId: null, createdAt: '', updatedAt: '', completedAt: null,
    retainerMonthly: 0, retainerHours: 0, retainerMonths: null,
  }
  const basePhase = {
    id: 'ph1', projectId: 'p1', name: 'Konzept', orderIndex: 0, createdAt: '',
    startDate: '', endDate: '', gateName: 'Freigabe', gateState: 'open',
    gateDate: null, gateApprovedBy: null, progressPercent: 0,
  }

  it('getAll parst moodboardItems aus einem JSON-String zu einem echten Array', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([
      { ...baseProject, moodboardItems: '[{"id":"m1","kind":"note"}]' },
    ])
    const [project] = await ProjectsGateway.getAll('ws1')
    expect(Array.isArray(project.moodboardItems)).toBe(true)
    expect(project.moodboardItems).toEqual([{ id: 'm1', kind: 'note' }])
  })

  it('getById laesst ein bereits echtes Array unveraendert', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ ...baseProject, moodboardItems: [{ id: 'm1', kind: 'note' }] })
    const project = await ProjectsGateway.getById('p1')
    expect(project.moodboardItems).toEqual([{ id: 'm1', kind: 'note' }])
  })

  it('getById faellt bei ungueltigem/fehlendem moodboardItems auf ein leeres Array zurueck', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ ...baseProject, moodboardItems: 'not json' })
    const project = await ProjectsGateway.getById('p1')
    expect(project.moodboardItems).toEqual([])
  })

  it('updateMoodboardItems (der vom Schnappschuss-Fluss genutzte Pfad) parst die Server-Antwort', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ ...baseProject, moodboardItems: '[{"id":"m2","kind":"image"}]' })
    const project = await ProjectsGateway.updateMoodboardItems('p1', [])
    expect(project.moodboardItems).toEqual([{ id: 'm2', kind: 'image' }])
  })

  it('getPhases parst deliverables und assigneeIds aus JSON-Strings zu echten Arrays', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([
      { ...basePhase, deliverables: '[{"id":"d1","name":"Moodboard","status":"open"}]', assigneeIds: '["u-1"]' },
    ])
    const [phase] = await ProjectsGateway.getPhases('p1')
    expect(phase.deliverables).toEqual([{ id: 'd1', name: 'Moodboard', status: 'open' }])
    expect(phase.assigneeIds).toEqual(['u-1'])
  })

  it('updateAssignees parst die Server-Antwort (Phasen-Tab-Pfad)', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ ...basePhase, deliverables: '[]', assigneeIds: '["u-2"]' })
    const phase = await ProjectsGateway.updateAssignees('ph1', 'p1', ['u-2'])
    expect(phase.assigneeIds).toEqual(['u-2'])
  })
})
