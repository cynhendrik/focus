import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { FolderTree } from './FolderTree'
import type { MailFolder } from '@/types/mail.types'

const mockFolders: MailFolder[] = [
  {
    id: 'acc1-INBOX', accountId: 'acc1', path: 'INBOX',
    delimiter: '.', displayName: 'INBOX', parentPath: null,
    flags: [], isSelectable: true,
    children: [
      {
        id: 'acc1-INBOX.Projekte', accountId: 'acc1', path: 'INBOX.Projekte',
        delimiter: '.', displayName: 'Projekte', parentPath: 'INBOX',
        flags: [], isSelectable: true, children: [],
      },
    ],
  },
  {
    id: 'acc1-Sent', accountId: 'acc1', path: 'Sent',
    delimiter: '.', displayName: 'Sent', parentPath: null,
    flags: ['\\Sent'], isSelectable: true, children: [],
  },
]

describe('FolderTree', () => {
  it('renders root folders', () => {
    render(
      <FolderTree
        folders={mockFolders}
        selectedPath="INBOX"
        expandedPaths={new Set()}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
      />
    )
    expect(screen.getByText('INBOX')).toBeInTheDocument()
    expect(screen.getByText('Sent')).toBeInTheDocument()
  })

  it('shows child folders when parent is expanded', () => {
    render(
      <FolderTree
        folders={mockFolders}
        selectedPath="INBOX"
        expandedPaths={new Set(['INBOX'])}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
      />
    )
    // Projekte is visible when INBOX is expanded
    expect(screen.getByText('Projekte')).toBeInTheDocument()
  })

  it('calls onSelect when selectable folder clicked', () => {
    const onSelect = vi.fn()
    render(
      <FolderTree
        folders={mockFolders}
        selectedPath=""
        expandedPaths={new Set()}
        onSelect={onSelect}
        onToggle={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Sent'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ path: 'Sent' }))
  })

  it('calls onToggle for folder with children', () => {
    const onToggle = vi.fn()
    render(
      <FolderTree
        folders={mockFolders}
        selectedPath=""
        expandedPaths={new Set()}
        onSelect={vi.fn()}
        onToggle={onToggle}
      />
    )
    fireEvent.click(screen.getByText('INBOX'))
    expect(onToggle).toHaveBeenCalledWith('INBOX')
  })
})
