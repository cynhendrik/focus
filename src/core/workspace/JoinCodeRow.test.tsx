import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { JoinCodeRow } from './JoinCodeRow'
import { useWorkspaceStore } from '@/store/workspace.store'

afterEach(cleanup)
beforeEach(() => {
  useWorkspaceStore.setState({
    workspaces: [{ id: 'ws1', name: 'A', logo_url: null, role: 'owner', isShared: false, join_code: 'ABC234' }],
    activeWorkspaceId: 'ws1',
  })
})

describe('JoinCodeRow', () => {
  it('zeigt dem Owner den Code', () => {
    render(<JoinCodeRow />)
    expect(screen.getByText('ABC234')).toBeTruthy()
  })

  it('rendert nichts für Mitglieder (nicht-Owner)', () => {
    useWorkspaceStore.setState({
      workspaces: [{ id: 'ws1', name: 'A', logo_url: null, role: 'member', isShared: true, join_code: 'ABC234' }],
      activeWorkspaceId: 'ws1',
    })
    const { container } = render(<JoinCodeRow />)
    expect(container.firstChild).toBeNull()
  })

  it('„Neu generieren" ruft regenerateJoinCode mit der aktiven Workspace-Id', () => {
    const regenerate = vi.fn().mockResolvedValue('NEW234')
    useWorkspaceStore.setState({ regenerateJoinCode: regenerate })
    render(<JoinCodeRow />)
    fireEvent.click(screen.getByRole('button', { name: /neu generieren/i }))
    expect(regenerate).toHaveBeenCalledWith('ws1')
  })
})
