import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

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

import { StapelQueue } from './StapelQueue'
import { usePreparedItemsStore } from '@/store/prepared-items.store'
import { useAuthStore } from '@/store/auth.store'

const mk = (id: string, score: number, over: object = {}) => ({
  id, workspaceId: 'ws1', type: 'aufgabe', sourceKind: 'todo', sourceId: id,
  assignee: null, payload: { title: `Karte ${id}`, why: 'Grund' }, score,
  status: 'pending', snoozeUntil: null, ruleId: 'aufgabe-heute',
  createdAt: '', updatedAt: '', approvedAt: null, ...over,
}) as never

describe('StapelQueue', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { id: 'u1' } } as never)
    usePreparedItemsStore.setState({
      items: [], focusId: null, loading: false, loadError: false, weekApproved: [],
      load: vi.fn().mockResolvedValue(undefined),
      loadWeekApproved: vi.fn().mockResolvedValue(undefined),
    } as never)
  })

  it('rendert nichts bei weniger als 2 sichtbaren Karten', () => {
    usePreparedItemsStore.setState({ items: [mk('k1', 100)], focusId: null } as never)
    const { container } = render(<StapelQueue />)
    expect(container).toBeEmptyDOMElement()
  })

  it('3 Karten: Fokus-Karte (hoechster Score) fehlt in der Liste, die 2 anderen stehen drin', () => {
    const items = [mk('k1', 100), mk('k2', 90), mk('k3', 80)]
    usePreparedItemsStore.setState({ items, focusId: null } as never)
    render(<StapelQueue />)
    expect(screen.queryByText('Karte k1')).not.toBeInTheDocument()
    expect(screen.getByText('Karte k2')).toBeInTheDocument()
    expect(screen.getByText('Karte k3')).toBeInTheDocument()
  })

  it('Klick auf Eintrag setzt focusId im Store', () => {
    const items = [mk('k1', 100), mk('k2', 90), mk('k3', 80)]
    usePreparedItemsStore.setState({ items, focusId: null } as never)
    render(<StapelQueue />)
    fireEvent.click(screen.getByText('Karte k2'))
    expect(usePreparedItemsStore.getState().focusId).toBe('k2')
  })

  it('10 Karten → 7 Eintraege + "+ 2 weitere"', () => {
    const items = Array.from({ length: 10 }, (_, i) => mk(`k${i}`, 100 - i))
    usePreparedItemsStore.setState({ items, focusId: null } as never)
    render(<StapelQueue />)
    // 10 total - 1 focus (k0) = 9 queued; show max 7 → "+ 2 weitere"
    expect(screen.getByText('+ 2 weitere')).toBeInTheDocument()
  })
})
