import { useEffect, useState, useMemo } from 'react'
import { useNotesModuleStore } from '@/store/notes-module.store'
import { useWorkspaceStore }   from '@/store/workspace.store'
import { useAuthStore }        from '@/store/auth.store'
import { NoteCard }            from './NoteCard'
import { NewNoteForm }         from './NewNoteForm'
import { PinnedDocsRow }       from './PinnedDocsRow'
import type { NoteEntry }      from '@/types/notes-module.types'

interface Props { accountId: string }

function fmtDayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) {
    return `Heute · ${d.getDate()}. ${d.toLocaleDateString('de-DE', { month: 'long' })}`
  }
  if (d.toDateString() === yesterday.toDateString()) return 'Gestern'
  return `${d.getDate()}. ${d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}`
}

function groupByDay(entries: NoteEntry[]): { label: string; entries: NoteEntry[] }[] {
  const groups: { label: string; entries: NoteEntry[] }[] = []
  const seen = new Map<string, number>()
  for (const e of entries) {
    const key = new Date(e.createdAt).toDateString()
    if (!seen.has(key)) {
      seen.set(key, groups.length)
      groups.push({ label: fmtDayLabel(e.createdAt), entries: [] })
    }
    groups[seen.get(key)!].entries.push(e)
  }
  return groups
}

export function CustomerNotesPane({ accountId }: Props) {
  const loadForAccount = useNotesModuleStore(s => s.loadForAccount)
  const entries        = useNotesModuleStore(s => s.entries)
  const docs           = useNotesModuleStore(s => s.docs)
  const createEntry    = useNotesModuleStore(s => s.createEntry)
  const updateEntry    = useNotesModuleStore(s => s.updateEntry)
  const deleteEntry    = useNotesModuleStore(s => s.deleteEntry)
  const createDoc      = useNotesModuleStore(s => s.createDoc)
  const updateDoc      = useNotesModuleStore(s => s.updateDoc)
  const deleteDoc      = useNotesModuleStore(s => s.deleteDoc)
  const loadingEntries = useNotesModuleStore(s => s.loadingEntries)

  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const userId      = useAuthStore(s => s.user?.id) ?? ''

  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    loadForAccount(accountId)
  }, [accountId, loadForAccount])

  const dayGroups = useMemo(() => groupByDay(entries), [entries])

  const handleCreateEntry = async (title: string | null, content: string) => {
    await createEntry({ workspaceId, accountId, title: title ?? undefined, content, createdBy: userId })
    setShowForm(false)
  }

  const handleCreateDoc = async (title: string, content: string) => {
    await createDoc({ workspaceId, accountId, title, content, createdBy: userId })
  }

  const handleUpdateDoc = async (id: string, title: string, content: string) => {
    await updateDoc(id, { title, content, updatedBy: userId })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        padding: '14px 24px 10px', flexShrink: 0,
        borderBottom: '1px solid var(--border)',
      }}>
        <button
          onClick={() => setShowForm(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8, border: 'none',
            background: 'var(--accent)', color: 'var(--accent-ink)',
            fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >+ Notiz</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 64px' }}>
        {/* Pinned docs */}
        <PinnedDocsRow
          docs={docs}
          accountId={accountId}
          onCreate={handleCreateDoc}
          onUpdate={handleUpdateDoc}
          onDelete={id => deleteDoc(id)}
        />

        {/* Timeline label */}
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--fg-dim)',
          fontFamily: 'var(--font-mono)', marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>Verlauf</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
        </div>

        {/* New note form */}
        {showForm && (
          <div style={{ marginBottom: 4 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', marginBottom: 8,
            }}>Heute</div>
            <NewNoteForm onSave={handleCreateEntry} onCancel={() => setShowForm(false)} />
          </div>
        )}

        {/* Day groups */}
        {loadingEntries ? (
          <div style={{ color: 'var(--fg-dim)', fontSize: 12, padding: '20px 0' }}>Lädt…</div>
        ) : dayGroups.length === 0 && !showForm ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--fg-dim)' }}>
            <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.25 }}>✎</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 4 }}>
              Noch keine Notizen
            </div>
            <div style={{ fontSize: 12 }}>+ Notiz klicken um loszulegen</div>
          </div>
        ) : (
          dayGroups.map(group => (
            <div key={group.label} style={{ marginBottom: 24 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--fg-dim)',
                fontFamily: 'var(--font-mono)', marginBottom: 8,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span>{group.label}</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
              </div>
              {group.entries.map(entry => (
                <NoteCard
                  key={entry.id}
                  entry={entry}
                  onUpdate={patch => updateEntry(entry.id, { ...patch, updatedBy: userId })}
                  onDelete={() => deleteEntry(entry.id)}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
