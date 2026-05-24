import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

// Mock MailService
vi.mock('@/services/mail.service', () => ({
  MailService: {
    getAccounts: vi.fn().mockResolvedValue([]),
    listFolders: vi.fn().mockResolvedValue([
      { id: 'acc1-INBOX', accountId: 'acc1', path: 'INBOX', delimiter: '.', displayName: 'INBOX', parentPath: null, flags: [], isSelectable: true },
      { id: 'acc1-INBOX.Projekte', accountId: 'acc1', path: 'INBOX.Projekte', delimiter: '.', displayName: 'Projekte', parentPath: 'INBOX', flags: [], isSelectable: true },
    ]),
    list: vi.fn().mockResolvedValue([]),
    sync: vi.fn().mockResolvedValue({ inserted: 0, skipped: 0 }),
  },
}))

import { useMailStore } from './mail.store'

describe('mail.store — folder tree', () => {
  beforeEach(() => {
    useMailStore.setState({
      folders: [],
      expandedFolders: new Set(),
      foldersLastFetched: 0,
      isFolderLoading: false,
      selectedAccountId: 'acc1',
    })
  })

  it('loadFolders builds tree from flat list', async () => {
    const { result } = renderHook(() => useMailStore())
    await act(async () => {
      await result.current.loadFolders('acc1')
    })
    const folders = result.current.folders
    expect(folders).toHaveLength(1) // nur INBOX als root
    expect(folders[0].path).toBe('INBOX')
    expect(folders[0].children).toHaveLength(1)
    expect(folders[0].children![0].path).toBe('INBOX.Projekte')
  })

  it('toggleFolder adds and removes from expandedFolders', () => {
    const { result } = renderHook(() => useMailStore())
    act(() => result.current.toggleFolder('INBOX'))
    expect(result.current.expandedFolders.has('INBOX')).toBe(true)
    act(() => result.current.toggleFolder('INBOX'))
    expect(result.current.expandedFolders.has('INBOX')).toBe(false)
  })

  it('foldersLastFetched is updated after loadFolders', async () => {
    const { result } = renderHook(() => useMailStore())
    const before = Date.now()
    await act(async () => {
      await result.current.loadFolders('acc1')
    })
    expect(result.current.foldersLastFetched).toBeGreaterThanOrEqual(before)
  })
})
