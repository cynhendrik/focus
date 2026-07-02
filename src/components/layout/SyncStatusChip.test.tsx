import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SyncStatusChip } from './SyncStatusChip'
import { useWorkspaceStore } from '@/store/workspace.store'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue({ pending_count: 0, failed_count: 0, last_synced_at: '', is_online: true }) }))

describe('SyncStatusChip', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      failedCount: 0,
      activeWorkspaceId: 'ws1',
      workspaces: [{ id: 'ws1', name: 'Test', logo_url: null, role: 'owner', capabilities: [], isShared: true, join_code: null }],
      localWorkspaces: [],
    } as never)
  })

  it('rendert nichts ohne Fehler', () => {
    const { container } = render(<SyncStatusChip />)
    expect(container.firstChild).toBeNull()
  })

  it('zeigt Anzahl haengender Aenderungen', () => {
    useWorkspaceStore.setState({ failedCount: 3 } as never)
    render(<SyncStatusChip />)
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Sync-Fehler')).toBeInTheDocument()
  })

  it('rendert nichts im lokalen Workspace', () => {
    useWorkspaceStore.setState({
      failedCount: 3,
      workspaces: [],
      localWorkspaces: [{ id: 'ws1', name: 'Lokal', logo_url: null, role: 'owner', capabilities: [], isShared: false, join_code: null }],
    } as never)
    const { container } = render(<SyncStatusChip />)
    expect(container.firstChild).toBeNull()
  })
})
