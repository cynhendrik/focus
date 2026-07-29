import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SyncStatusChip } from './SyncStatusChip'
import { useWorkspaceStore } from '@/store/workspace.store'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue({ pending_count: 0, failed_count: 0, last_synced_at: '', is_online: true }) }))

describe('SyncStatusChip', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      failedCount: 0,
      pendingCount: 0,
      isOnline: true,
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

  it('zeigt einen ruhigen Zustand fuer wartende, noch nicht fehlgeschlagene Aenderungen', () => {
    useWorkspaceStore.setState({ failedCount: 0, pendingCount: 4 } as never)
    render(<SyncStatusChip />)
    expect(screen.getByText('Synchronisiert …')).toBeInTheDocument()
    expect(screen.queryByText('Sync-Fehler')).not.toBeInTheDocument()
  })

  it('rendert nichts wenn weder Fehler noch wartende Aenderungen vorliegen', () => {
    useWorkspaceStore.setState({ failedCount: 0, pendingCount: 0 } as never)
    const { container } = render(<SyncStatusChip />)
    expect(container.firstChild).toBeNull()
  })

  it('zeigt "wartet auf Verbindung" statt Fortschritt wenn offline', () => {
    useWorkspaceStore.setState({ failedCount: 0, pendingCount: 4, isOnline: false } as never)
    render(<SyncStatusChip />)
    expect(screen.getByText('Wartet auf Verbindung')).toBeInTheDocument()
  })
})
