import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useProjectsStore } from './projects.store'
import { ProjectsGateway } from '@/data/projects.gateway'

vi.mock('@/data/projects.gateway', () => ({
  ProjectsGateway: {
    updatePhaseProgress: vi.fn(),
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
