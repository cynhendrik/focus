import { useState } from 'react'
import { useSmartListsStore } from '@/store/smart-lists.store'
import { SmartListItem } from './SmartListItem'
import { SmartListModal } from './SmartListModal'
import type { SmartList } from '@/types/smart-list.types'

export function SmartListsSection() {
  const lists        = useSmartListsStore(s => s.lists)
  const activeListId = useSmartListsStore(s => s.activeListId)
  const setActive    = useSmartListsStore(s => s.setActive)
  const remove       = useSmartListsStore(s => s.remove)
  const [collapsed, setCollapsed] = useState(false)
  const [editing, setEditing]     = useState<SmartList | 'new' | null>(null)

  if (lists.length === 0) return null

  return (
    <div style={{ marginBottom: 4 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '5px 12px 3px', cursor: 'pointer', userSelect: 'none',
        }}
        onClick={() => setCollapsed(c => !c)}
      >
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
          color: 'var(--fg-dim)', textTransform: 'uppercase',
        }}>Smart Lists</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={e => { e.stopPropagation(); setEditing('new') }}
            title="Neue Liste"
            style={{ fontSize: 15, lineHeight: 1, color: 'var(--fg-muted)', background: 'none', padding: 0 }}
          >+</button>
          <span style={{ fontSize: 9, color: 'var(--fg-dim)' }}>{collapsed ? '▸' : '▾'}</span>
        </div>
      </div>

      {!collapsed && (
        <div style={{ marginBottom: 6 }}>
          {lists.map(list => (
            <SmartListItem
              key={list.id}
              list={list}
              active={activeListId === list.id}
              onClick={() => setActive(list.id)}
              onEdit={() => setEditing(list)}
              onDelete={list.isSystem ? undefined : () => remove(list.id)}
            />
          ))}
        </div>
      )}

      {editing && (
        <SmartListModal
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
