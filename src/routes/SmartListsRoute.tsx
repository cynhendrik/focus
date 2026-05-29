// src/routes/SmartListsRoute.tsx
import { useEffect, useMemo, useState } from 'react'
import { Plus, ListFilter } from 'lucide-react'
import { useSmartListsStore } from '@/store/smart-lists.store'
import { useCustomersStore } from '@/store/customers.store'
import { useCrmStore } from '@/store/crm.store'
import { applySmartListFilter } from '@/lib/smart-list-filter'
import { SmartListItem } from '@/components/smart-lists/SmartListItem'
import { SmartListModal } from '@/components/smart-lists/SmartListModal'
import { CustomerTableFiltered } from '@/components/smart-lists/CustomerTableFiltered'
import type { SmartList } from '@/types/smart-list.types'

const ACTIVE_STORAGE_KEY = 'cynera:smartlists:active-v1'

export function SmartListsRoute() {
  const lists        = useSmartListsStore(s => s.lists)
  const activeListId = useSmartListsStore(s => s.activeListId)
  const setActive    = useSmartListsStore(s => s.setActive)
  const remove       = useSmartListsStore(s => s.remove)

  const customers    = useCustomersStore(s => s.customers)
  const lastActivity = useCrmStore(s => s.lastActivity)
  const [editing, setEditing] = useState<SmartList | 'new' | null>(null)

  // Persist activeListId across reloads
  useEffect(() => {
    if (activeListId) {
      try { localStorage.setItem(ACTIVE_STORAGE_KEY, activeListId) } catch {}
    } else {
      try { localStorage.removeItem(ACTIVE_STORAGE_KEY) } catch {}
    }
  }, [activeListId])

  useEffect(() => {
    if (activeListId || lists.length === 0) return
    let stored: string | null = null
    try { stored = localStorage.getItem(ACTIVE_STORAGE_KEY) } catch {}
    if (stored && lists.some(l => l.id === stored)) {
      setActive(stored)
    } else {
      setActive(lists[0].id)
    }
  }, [lists, activeListId, setActive])

  const activityMap = useMemo(
    () => new Map(lastActivity.map(a => [a.accountId, a.lastActivityAt])),
    [lastActivity],
  )

  const activeList = useMemo(
    () => lists.find(l => l.id === activeListId) ?? null,
    [lists, activeListId],
  )

  const filtered = useMemo(
    () => activeList
      ? applySmartListFilter(customers, activeList.filter, activityMap)
      : customers,
    [customers, activeList, activityMap],
  )

  const systemLists = lists.filter(l => l.isSystem)
  const userLists   = lists.filter(l => !l.isSystem)

  return (
    <div style={{
      display: 'flex', height: '100%', background: 'var(--bg)',
    }}>
      {/* Left Panel */}
      <aside style={{
        width: 260, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        padding: '20px 0 16px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 20px 14px',
        }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, margin: 0, letterSpacing: '-0.005em' }}>
            Smart Lists
          </h2>
          <button
            onClick={() => setEditing('new')}
            title="Neue Liste"
            style={{
              background: 'transparent', border: '1px solid var(--border)',
              borderRadius: 8, padding: 4, cursor: 'pointer',
              color: 'var(--fg-muted)', display: 'flex',
            }}
          >
            <Plus size={13} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px' }}>
          {systemLists.length > 0 && (
            <SmartListGroup label="System">
              {systemLists.map(list => (
                <SmartListItem
                  key={list.id}
                  list={list}
                  active={activeListId === list.id}
                  onClick={() => setActive(list.id)}
                  onEdit={() => setEditing(list)}
                />
              ))}
            </SmartListGroup>
          )}

          {userLists.length > 0 && (
            <SmartListGroup label="Meine Listen">
              {userLists.map(list => (
                <SmartListItem
                  key={list.id}
                  list={list}
                  active={activeListId === list.id}
                  onClick={() => setActive(list.id)}
                  onEdit={() => setEditing(list)}
                  onDelete={() => {
                    if (activeListId === list.id) setActive(null)
                    remove(list.id)
                  }}
                />
              ))}
            </SmartListGroup>
          )}

          {lists.length === 0 && (
            <div style={{ padding: '20px 14px', color: 'var(--fg-dim)', fontSize: 12, textAlign: 'center' }}>
              Noch keine Smart Lists.<br />Klick + um eine zu erstellen.
            </div>
          )}
        </div>
      </aside>

      {/* Right Panel */}
      <main style={{
        flex: 1, minWidth: 0,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 28px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {activeList ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 18 }}>{activeList.icon}</span>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.015em' }}>
                {activeList.name}
              </h1>
              <span style={{
                fontSize: 12, color: 'var(--fg-dim)',
                fontFamily: 'var(--font-mono)',
              }}>
                {filtered.length} Kunden
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--fg-muted)' }}>
              <ListFilter size={16} />
              <span style={{ fontSize: 14 }}>Wähle eine Smart List links</span>
            </div>
          )}

          {activeList && !activeList.isSystem && (
            <button
              onClick={() => setEditing(activeList)}
              className="btn-ghost"
              style={{ fontSize: 12, padding: '5px 12px' }}
            >
              Filter bearbeiten
            </button>
          )}
        </div>

        {/* Table */}
        <CustomerTableFiltered
          customers={filtered}
          lastActivity={activityMap}
          onReset={activeList ? () => setActive(null) : undefined}
        />
      </main>

      {editing && (
        <SmartListModal
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function SmartListGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        padding: '6px 14px 4px',
        fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
        color: 'var(--fg-dim)', textTransform: 'uppercase',
      }}>{label}</div>
      {children}
    </div>
  )
}
