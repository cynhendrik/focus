import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/data/activities.gateway', () => ({
  ActivitiesGateway: { getByAccount: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}))
vi.mock('@/store/workspace.store', () => ({ useWorkspaceStore: { getState: () => ({ activeWorkspaceId: 'ws1' }) } }))
vi.mock('@/store/auth.store', () => ({ useAuthStore: { getState: () => ({ user: { id: 'u1' } }) } }))

import { ActivitiesGateway } from '@/data/activities.gateway'
import { useNotesStore } from './notes.store'
import type { Activity } from '@/types/pipeline.types'

const noteActivity = (over: Partial<Activity> = {}): Activity => ({
  id: 'n1', workspaceId: 'ws1', createdBy: 'u1', accountId: 'c1', type: 'note',
  title: 'T', body: 'B', payload: '{"note_type":"telefon","waiting_reply":false,"pinned":true}',
  status: 'open', createdAt: '2026-01-01', updatedAt: '2026-01-02', ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  useNotesStore.setState({ notes: [], isLoading: false, error: null })
})

describe('useNotesStore', () => {
  it('loadForCustomer: mappt nur type===note Activities zu Notes', async () => {
    vi.mocked(ActivitiesGateway.getByAccount).mockResolvedValueOnce([
      noteActivity(),
      noteActivity({ id: 'x1', type: 'call' }),
    ])
    await useNotesStore.getState().loadForCustomer('c1')
    expect(ActivitiesGateway.getByAccount).toHaveBeenCalledWith('c1')
    const notes = useNotesStore.getState().notes
    expect(notes).toHaveLength(1)
    expect(notes[0].id).toBe('n1')
    expect(notes[0].noteType).toBe('telefon')
    expect(notes[0].pinned).toBe(true)
  })

  it('upsert (neu): ruft create und fügt Note hinzu', async () => {
    vi.mocked(ActivitiesGateway.create).mockResolvedValueOnce(noteActivity({ id: 'new1' }))
    await useNotesStore.getState().upsert({ customerId: 'c1', title: 'T', content: 'B', noteType: 'meeting' })
    expect(ActivitiesGateway.create).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(ActivitiesGateway.create).mock.calls[0][0]
    expect(arg.type).toBe('note')
    expect(arg.accountId).toBe('c1')
    expect(useNotesStore.getState().notes.map(n => n.id)).toContain('new1')
  })

  it('upsert (bestehend): ruft update mit id', async () => {
    vi.mocked(ActivitiesGateway.update).mockResolvedValueOnce(noteActivity({ id: 'n1' }))
    await useNotesStore.getState().upsert({ id: 'n1', customerId: 'c1', title: 'T2', content: 'B2' })
    expect(ActivitiesGateway.update).toHaveBeenCalledTimes(1)
    expect(vi.mocked(ActivitiesGateway.update).mock.calls[0][0]).toBe('n1')
    expect(ActivitiesGateway.create).not.toHaveBeenCalled()
  })

  it('remove: ruft delete und entfernt Note', async () => {
    useNotesStore.setState({ notes: [{ id: 'n1', customerId: 'c1', title: 'T', content: 'B', pinned: false, noteType: 'gespraech', waitingReply: false, createdAt: '', updatedAt: '' }] })
    vi.mocked(ActivitiesGateway.delete).mockResolvedValueOnce()
    await useNotesStore.getState().remove('n1')
    expect(ActivitiesGateway.delete).toHaveBeenCalledWith('n1')
    expect(useNotesStore.getState().notes).toHaveLength(0)
  })
})
