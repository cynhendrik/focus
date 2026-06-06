import { useEffect, useState, useMemo } from 'react'
import { FolderOpen, Folder, Plus, Trash2, Check, X } from 'lucide-react'
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
  const folders        = useNotesModuleStore(s => s.folders)
  const createEntry    = useNotesModuleStore(s => s.createEntry)
  const updateEntry    = useNotesModuleStore(s => s.updateEntry)
  const deleteEntry    = useNotesModuleStore(s => s.deleteEntry)
  const createDoc      = useNotesModuleStore(s => s.createDoc)
  const updateDoc      = useNotesModuleStore(s => s.updateDoc)
  const deleteDoc      = useNotesModuleStore(s => s.deleteDoc)
  const createFolder   = useNotesModuleStore(s => s.createFolder)
  const updateFolder   = useNotesModuleStore(s => s.updateFolder)
  const deleteFolder   = useNotesModuleStore(s => s.deleteFolder)
  const loadingEntries = useNotesModuleStore(s => s.loadingEntries)

  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const userId      = useAuthStore(s => s.user?.id) ?? ''

  const [showForm,      setShowForm]      = useState(false)
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)  // null = Alle
  const [newFolderName, setNewFolderName]   = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingFolderName, setEditingFolderName] = useState('')

  useEffect(() => {
    loadForAccount(accountId)
  }, [accountId, loadForAccount])

  const filteredEntries = useMemo(() =>
    activeFolderId === null
      ? entries
      : entries.filter(e => e.folderId === activeFolderId),
    [entries, activeFolderId],
  )

  const dayGroups = useMemo(() => groupByDay(filteredEntries), [filteredEntries])

  const handleCreateEntry = async (title: string | null, content: string) => {
    await createEntry({ workspaceId, accountId, folderId: activeFolderId, title: title ?? undefined, content, createdBy: userId })
    setShowForm(false)
  }

  const handleCreateDoc = async (title: string, content: string) => {
    await createDoc({ workspaceId, accountId, title, content, createdBy: userId })
  }

  const handleUpdateDoc = async (id: string, title: string, content: string) => {
    await updateDoc(id, { title, content, updatedBy: userId })
  }

  const handleCreateFolder = async () => {
    const name = newFolderName.trim()
    if (!name) return
    await createFolder({ workspaceId, accountId, name, createdBy: userId })
    setNewFolderName('')
    setCreatingFolder(false)
  }

  const handleUpdateFolder = async (id: string) => {
    const name = editingFolderName.trim()
    if (!name) return
    await updateFolder(id, { name })
    setEditingFolderId(null)
  }

  const handleDeleteFolder = async (id: string) => {
    if (activeFolderId === id) setActiveFolderId(null)
    await deleteFolder(id)
  }

  const folderCount = (folderId: string | null) =>
    folderId === null
      ? entries.length
      : entries.filter(e => e.folderId === folderId).length

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── Folder Sidebar ─────────────────────────────────────────────────── */}
      <div style={{
        width: 200, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        borderRight: '1px solid var(--border)',
        background: 'var(--surface)',
        overflow: 'hidden',
      }}>
        {/* Sidebar header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 14px 10px', borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
            Mappen
          </span>
          <button
            onClick={() => setCreatingFolder(true)}
            title="Neue Mappe"
            style={{
              width: 22, height: 22, borderRadius: 6, border: 'none',
              background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 120ms, background 120ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--fg)'; e.currentTarget.style.background = 'var(--surface-2)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-dim)'; e.currentTarget.style.background = 'transparent' }}
          >
            <Plus size={13} />
          </button>
        </div>

        {/* Folder list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {/* "Alle" entry */}
          <FolderItem
            label="Alle"
            count={folderCount(null)}
            active={activeFolderId === null}
            onClick={() => setActiveFolderId(null)}
          />

          {folders.map(folder => (
            editingFolderId === folder.id ? (
              <div key={folder.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 8px' }}>
                <input
                  autoFocus
                  value={editingFolderName}
                  onChange={e => setEditingFolderName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleUpdateFolder(folder.id)
                    if (e.key === 'Escape') setEditingFolderId(null)
                  }}
                  style={{
                    flex: 1, background: 'var(--surface-2)', border: '1px solid var(--accent)',
                    borderRadius: 6, padding: '3px 7px', fontSize: 12, color: 'var(--fg)',
                    outline: 'none', fontFamily: 'inherit',
                  }}
                />
                <button onClick={() => handleUpdateFolder(folder.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 2 }}>
                  <Check size={12} />
                </button>
                <button onClick={() => setEditingFolderId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', padding: 2 }}>
                  <X size={12} />
                </button>
              </div>
            ) : (
              <FolderItem
                key={folder.id}
                label={folder.name}
                count={folderCount(folder.id)}
                active={activeFolderId === folder.id}
                onClick={() => setActiveFolderId(folder.id)}
                onRename={() => { setEditingFolderId(folder.id); setEditingFolderName(folder.name) }}
                onDelete={() => handleDeleteFolder(folder.id)}
              />
            )
          ))}

          {/* New folder input */}
          {creatingFolder && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 8px' }}>
              <input
                autoFocus
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateFolder()
                  if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName('') }
                }}
                placeholder="Name…"
                style={{
                  flex: 1, background: 'var(--surface-2)', border: '1px solid var(--accent)',
                  borderRadius: 6, padding: '3px 7px', fontSize: 12, color: 'var(--fg)',
                  outline: 'none', fontFamily: 'inherit',
                }}
              />
              <button onClick={handleCreateFolder} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 2 }}>
                <Check size={12} />
              </button>
              <button onClick={() => { setCreatingFolder(false); setNewFolderName('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', padding: 2 }}>
                <X size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Notes Area ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px 10px', flexShrink: 0,
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', letterSpacing: '-0.01em' }}>
            {activeFolderId === null
              ? 'Alle Notizen'
              : folders.find(f => f.id === activeFolderId)?.name ?? 'Mappe'}
          </span>
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
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 64px' }}>
          {/* Pinned docs — only in "Alle" view */}
          {activeFolderId === null && (
            <PinnedDocsRow
              docs={docs}
              accountId={accountId}
              onCreate={handleCreateDoc}
              onUpdate={handleUpdateDoc}
              onDelete={id => deleteDoc(id)}
            />
          )}

          {/* Timeline divider */}
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--fg-dim)',
            fontFamily: 'var(--font-mono)', marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span>Verlauf</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
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
                {activeFolderId === null ? 'Noch keine Notizen' : 'Keine Notizen in dieser Mappe'}
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
                  <div style={{ flex: 1, height: 1, background: 'var(--border)', opacity: 0.5 }} />
                </div>
                {group.entries.map(entry => (
                  <NoteCard
                    key={entry.id}
                    entry={entry}
                    folders={folders}
                    onUpdate={patch => updateEntry(entry.id, { ...patch, updatedBy: userId })}
                    onDelete={() => deleteEntry(entry.id)}
                    onMoveToFolder={folderId => updateEntry(entry.id, { folderId, updatedBy: userId })}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ── FolderItem ────────────────────────────────────────────────────────────────

function FolderItem({
  label, count, active, onClick, onRename, onDelete,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
  onRename?: () => void
  onDelete?: () => void
}) {
  const [hover, setHover] = useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
        background: active ? 'var(--accent-soft)' : hover ? 'var(--surface-2)' : 'transparent',
        transition: 'background 120ms',
        marginBottom: 2,
      }}
    >
      {active
        ? <FolderOpen size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        : <Folder size={14} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />}
      <span style={{
        flex: 1, fontSize: 12.5, fontWeight: active ? 600 : 400,
        color: active ? 'var(--accent)' : 'var(--fg-2)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      {hover && onRename && (
        <button
          onClick={e => { e.stopPropagation(); onRename() }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', padding: '1px 3px', borderRadius: 4, fontSize: 10 }}
          title="Umbenennen"
        >✎</button>
      )}
      {hover && onDelete ? (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', padding: 2, borderRadius: 4, display: 'flex' }}
          title="Löschen"
        >
          <Trash2 size={11} />
        </button>
      ) : (
        <span style={{ fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', minWidth: 16, textAlign: 'right' }}>
          {count || ''}
        </span>
      )}
    </div>
  )
}
