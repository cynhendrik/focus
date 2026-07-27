import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useProjectsStore } from './projects.store'
import { ProjectsGateway } from '@/data/projects.gateway'

vi.mock('@/data/projects.gateway', () => ({
  ProjectsGateway: {
    updatePhaseProgress: vi.fn(),
    requestGate: vi.fn(),
    approveGate: vi.fn(),
    updateDeliverables: vi.fn(),
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
    gateDate: null, gateApprovedBy: null, progressPercent: 0, deliverables: [],
  }

  beforeEach(() => {
    useProjectsStore.setState({ projects: [], phasesByProject: { p1: [basePhase] }, isLoading: false, error: null })
    vi.mocked(ProjectsGateway.requestGate).mockReset()
    vi.mocked(ProjectsGateway.approveGate).mockReset()
    vi.mocked(ProjectsGateway.updateDeliverables).mockReset()
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

  it('setzt error im Store, wenn approveGate wirft', async () => {
    vi.mocked(ProjectsGateway.approveGate).mockRejectedValue(new Error('boom'))
    await expect(useProjectsStore.getState().approveGate('ph1', 'p1', 'X')).rejects.toThrow('boom')
    expect(useProjectsStore.getState().error).not.toBeNull()
  })
})
