// src/components/mail/FolderTree.tsx

import type { MailFolder } from '@/types/mail.types'

interface FolderTreeProps {
  folders: MailFolder[]
  selectedPath: string
  expandedPaths: Set<string>
  onSelect: (folder: MailFolder) => void
  onToggle: (path: string) => void
}

function folderIcon(folder: MailFolder): string {
  const path = folder.path.toUpperCase()
  const flags = folder.flags.map(f => f.toLowerCase())

  if (path === 'INBOX' || flags.some(f => f.includes('\\inbox'))) return '📥'
  if (flags.some(f => f.includes('\\sent'))) return '📤'
  if (flags.some(f => f.includes('\\drafts'))) return '📝'
  if (flags.some(f => f.includes('\\trash'))) return '🗑'
  if (flags.some(f => f.includes('\\junk') || f.includes('\\spam'))) return '⚠️'
  return '📁'
}

interface FolderNodeProps {
  folder: MailFolder
  depth: number
  selectedPath: string
  expandedPaths: Set<string>
  onSelect: (folder: MailFolder) => void
  onToggle: (path: string) => void
}

function FolderNode({
  folder, depth, selectedPath, expandedPaths, onSelect, onToggle,
}: FolderNodeProps) {
  const hasChildren = (folder.children?.length ?? 0) > 0
  const isExpanded = expandedPaths.has(folder.path)
  const isSelected = selectedPath === folder.path

  const handleClick = () => {
    if (hasChildren) {
      onToggle(folder.path)
    }
    if (folder.isSelectable) {
      onSelect(folder)
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          width: '100%',
          padding: '4px 8px',
          paddingLeft: 8 + depth * 12,
          borderRadius: 8,
          fontSize: 12,
          background: isSelected ? 'var(--accent)' : 'none',
          color: isSelected ? 'var(--accent-ink)' : 'var(--fg-dim)',
          border: 'none',
          cursor: folder.isSelectable || hasChildren ? 'pointer' : 'default',
          textAlign: 'left',
        }}
      >
        {hasChildren && (
          <span style={{ fontSize: 9, width: 10, textAlign: 'center', flexShrink: 0 }}>
            {isExpanded ? '▼' : '▶'}
          </span>
        )}
        {!hasChildren && <span style={{ width: 10, flexShrink: 0 }} />}
        <span>{folderIcon(folder)}</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {folder.displayName}
        </span>
      </button>

      {hasChildren && isExpanded && folder.children!.map(child => (
        <FolderNode
          key={child.path}
          folder={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          expandedPaths={expandedPaths}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      ))}
    </>
  )
}

export function FolderTree({
  folders, selectedPath, expandedPaths, onSelect, onToggle,
}: FolderTreeProps) {
  return (
    <>
      {folders.map(folder => (
        <FolderNode
          key={folder.path}
          folder={folder}
          depth={0}
          selectedPath={selectedPath}
          expandedPaths={expandedPaths}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      ))}
    </>
  )
}
