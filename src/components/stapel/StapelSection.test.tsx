import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/services/stapel-actions.service', () => ({ approvePreparedItem: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock('@/services/preparation.service', () => ({ runPreparation: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/ai/corra', () => ({ generateCorraDraft: vi.fn() }))
vi.mock('@/data/prepared-items.gateway', () => ({
  PreparedItemsGateway: {
    listActive: vi.fn().mockReturnValue(new Promise(() => {})),
    approvedSince: vi.fn().mockResolvedValue([]),
    insertIgnore: vi.fn(),
    updateStatus: vi.fn(),
    updatePayload: vi.fn(),
    setAssignee: vi.fn(),
  },
}))

import { StapelSection } from './StapelSection'
import { usePreparedItemsStore } from '@/store/prepared-items.store'
import { useWorkspaceStore } from '@/store/workspace.store'

const mk = (id: string, score: number, over: object = {}) => ({
  id, workspaceId: 'ws1', type: 'aufgabe', sourceKind: 'todo', sourceId: id,
  assignee: null, payload: { title: `Karte ${id}`, why: 'Grund' }, score,
  status: 'pending', snoozeUntil: null, ruleId: 'aufgabe-heute',
  createdAt: '', updatedAt: '', approvedAt: null, ...over,
}) as never

describe('StapelSection', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws1' } as never)
    usePreparedItemsStore.setState({
      items: [], weekApproved: [], loading: false, loadError: false,
      load: vi.fn().mockResolvedValue(undefined),
      loadWeekApproved: vi.fn().mockResolvedValue(undefined),
    } as never)
  })

  it('leerer Stapel zeigt Ruhe-Text und Wochensumme', () => {
    usePreparedItemsStore.setState({
      items: [],
      weekApproved: [mk('a', 0, { type: 'mahnung', payload: { title: '', why: '', amount: 1190 }, status: 'approved' })],
      loading: false, loadError: false,
    } as never)
    render(<StapelSection />)
    expect(screen.getByText(/Alles erledigt/)).toBeInTheDocument()
    expect(screen.getByText(/1.190/)).toBeInTheDocument()
  })

  it('hoechster Score ist die Fokus-Karte; Deckel bei 7 sichtbaren + Rest-Hinweis', () => {
    const items = Array.from({ length: 10 }, (_, i) => mk(`k${i}`, 100 - i))
    usePreparedItemsStore.setState({ items, loading: false, loadError: false } as never)
    render(<StapelSection />)
    expect(screen.getByRole('heading', { name: 'Karte k0' })).toBeInTheDocument()
    expect(screen.getByText('+ 3 weitere')).toBeInTheDocument()
  })

  it('gesnoozte Karten mit Frist in der Zukunft erscheinen nicht', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    usePreparedItemsStore.setState({ items: [mk('k1', 100, { status: 'snoozed', snoozeUntil: future })], loading: false, loadError: false } as never)
    render(<StapelSection />)
    expect(screen.getByText(/Alles erledigt/)).toBeInTheDocument()
  })
})
