import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useProjectsStore } from './projects.store'
import { ProjectsGateway } from '@/data/projects.gateway'

vi.mock('@/data/projects.gateway', () => ({
  ProjectsGateway: {
    updatePhaseProgress: vi.fn(),
    requestGate: vi.fn(),
    approveGate: vi.fn(),
    updateDeliverables: vi.fn(),
    updateAssignees: vi.fn(),
    updateMoodboardItems: vi.fn(),
    uploadMoodboardImage: vi.fn(),
  },
}))

describe('useProjectsStore.updatePhaseProgress', () => {
  beforeEach(() => {
    useProjectsStore.setState({
      projects: [], phasesByProject: {
        'p1': [
          { id: 'ph1', projectId: 'p1', name: 'Konzept', orderIndex: 0, createdAt: '2026-01-01',
            startDate: '2026-04-27', endDate: '2026-05-11', gateName: 'Freigabe', gateState: 'open',
            gateDate: null, gateApprovedBy: null, progressPercent: 10 },
        ],
      }, isLoading: false, error: null,
    })
    vi.mocked(ProjectsGateway.updatePhaseProgress).mockReset()
  })

  it('aktualisiert progressPercent der betroffenen Phase im Store', async () => {
    vi.mocked(ProjectsGateway.updatePhaseProgress).mockResolvedValue({
      id: 'ph1', projectId: 'p1', name: 'Konzept', orderIndex: 0, createdAt: '2026-01-01',
      startDate: '2026-04-27', endDate: '2026-05-11', gateName: 'Freigabe', gateState: 'open',
      gateDate: null, gateApprovedBy: null, progressPercent: 78,
    })
    await useProjectsStore.getState().updatePhaseProgress('ph1', 'p1', 78)
    expect(useProjectsStore.getState().phasesByProject['p1'][0].progressPercent).toBe(78)
  })

  it('setzt error im Store, wenn das Gateway wirft', async () => {
    vi.mocked(ProjectsGateway.updatePhaseProgress).mockRejectedValue(new Error('boom'))
    await expect(useProjectsStore.getState().updatePhaseProgress('ph1', 'p1', 78)).rejects.toThrow('boom')
    expect(useProjectsStore.getState().error).not.toBeNull()
  })
})

describe('useProjectsStore gate/deliverables actions', () => {
  const basePhase = {
    id: 'ph1', projectId: 'p1', name: 'Konzept', orderIndex: 0, createdAt: '2026-01-01',
    startDate: '2026-04-27', endDate: '2026-05-11', gateName: 'Freigabe', gateState: 'open' as const,
    gateDate: null, gateApprovedBy: null, progressPercent: 0, deliverables: [], assigneeIds: [],
  }

  beforeEach(() => {
    useProjectsStore.setState({ projects: [], phasesByProject: { p1: [basePhase] }, isLoading: false, error: null })
    vi.mocked(ProjectsGateway.requestGate).mockReset()
    vi.mocked(ProjectsGateway.approveGate).mockReset()
    vi.mocked(ProjectsGateway.updateDeliverables).mockReset()
    vi.mocked(ProjectsGateway.updateAssignees).mockReset()
  })

  it('requestGate aktualisiert die Phase im Store', async () => {
    vi.mocked(ProjectsGateway.requestGate).mockResolvedValue({ ...basePhase, gateState: 'pending', gateDate: '2026-06-01' })
    await useProjectsStore.getState().requestGate('ph1', 'p1', '2026-06-01')
    expect(useProjectsStore.getState().phasesByProject['p1'][0].gateState).toBe('pending')
  })

  it('approveGate aktualisiert die Phase im Store', async () => {
    vi.mocked(ProjectsGateway.approveGate).mockResolvedValue({ ...basePhase, gateState: 'approved', gateApprovedBy: 'M. Weber' })
    await useProjectsStore.getState().approveGate('ph1', 'p1', 'M. Weber')
    expect(useProjectsStore.getState().phasesByProject['p1'][0].gateApprovedBy).toBe('M. Weber')
  })

  it('updateDeliverables aktualisiert die Phase im Store', async () => {
    const deliverables = [{ id: 'd1', name: 'Moodboard', status: 'open' as const }]
    vi.mocked(ProjectsGateway.updateDeliverables).mockResolvedValue({ ...basePhase, deliverables })
    await useProjectsStore.getState().updateDeliverables('ph1', 'p1', deliverables)
    expect(useProjectsStore.getState().phasesByProject['p1'][0].deliverables).toEqual(deliverables)
  })

  it('updateAssignees aktualisiert die Phase im Store', async () => {
    const assigneeIds = ['u-1']
    vi.mocked(ProjectsGateway.updateAssignees).mockResolvedValue({ ...basePhase, assigneeIds })
    await useProjectsStore.getState().updateAssignees('ph1', 'p1', assigneeIds)
    expect(useProjectsStore.getState().phasesByProject['p1'][0].assigneeIds).toEqual(assigneeIds)
  })

  it('setzt error im Store, wenn approveGate wirft', async () => {
    vi.mocked(ProjectsGateway.approveGate).mockRejectedValue(new Error('boom'))
    await expect(useProjectsStore.getState().approveGate('ph1', 'p1', 'X')).rejects.toThrow('boom')
    expect(useProjectsStore.getState().error).not.toBeNull()
  })
})

describe('useProjectsStore moodboard actions', () => {
  const baseProject = {
    id: 'p1', workspaceId: 'ws1', accountId: 'a1', title: 'Relaunch', description: null,
    status: 'active' as const, currentPhaseId: null, createdAt: '2026-01-01', updatedAt: '2026-01-01',
    completedAt: null, retainerMonthly: 0, retainerHours: 0, retainerMonths: null, moodboardItems: [],
  }

  beforeEach(() => {
    useProjectsStore.setState({ projects: [baseProject], phasesByProject: {}, isLoading: false, error: null })
    vi.mocked(ProjectsGateway.updateMoodboardItems).mockReset()
    vi.mocked(ProjectsGateway.uploadMoodboardImage).mockReset()
  })

  it('updateMoodboardItems aktualisiert das Projekt im Store', async () => {
    const items = [{ id: 'm1', kind: 'note' as const, x: 10, y: 10, w: 20, h: 15, cap: 'Notiz', text: 'Hallo' }]
    vi.mocked(ProjectsGateway.updateMoodboardItems).mockResolvedValue({ ...baseProject, moodboardItems: items })
    await useProjectsStore.getState().updateMoodboardItems('p1', items)
    expect(useProjectsStore.getState().projects[0].moodboardItems).toEqual(items)
  })

  it('uploadMoodboardImage setzt den storageKey des passenden Items und persistiert die Liste', async () => {
    const items = [{ id: 'm1', kind: 'image' as const, x: 10, y: 10, w: 24, h: 26, cap: 'Bild', storageKey: null }]
    useProjectsStore.setState({ projects: [{ ...baseProject, moodboardItems: items }], phasesByProject: {}, isLoading: false, error: null })
    vi.mocked(ProjectsGateway.uploadMoodboardImage).mockResolvedValue('storage-key-1')
    vi.mocked(ProjectsGateway.updateMoodboardItems).mockResolvedValue({
      ...baseProject, moodboardItems: [{ ...items[0], storageKey: 'storage-key-1' }],
    })
    const file = new File(['x'], 'bild.png', { type: 'image/png' })
    await useProjectsStore.getState().uploadMoodboardImage('ws1', 'p1', 'm1', file)
    expect(ProjectsGateway.uploadMoodboardImage).toHaveBeenCalledWith('ws1', 'p1', 'm1', file)
    expect(ProjectsGateway.updateMoodboardItems).toHaveBeenCalledWith('p1', [{ ...items[0], storageKey: 'storage-key-1' }])
    expect(useProjectsStore.getState().projects[0].moodboardItems[0].storageKey).toBe('storage-key-1')
  })

  it('setzt error im Store, wenn updateMoodboardItems wirft', async () => {
    vi.mocked(ProjectsGateway.updateMoodboardItems).mockRejectedValue(new Error('boom'))
    await expect(useProjectsStore.getState().updateMoodboardItems('p1', [])).rejects.toThrow('boom')
    expect(useProjectsStore.getState().error).not.toBeNull()
  })
})
