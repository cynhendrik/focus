import { useState } from 'react'
import { useTodosStore } from '@/store/todos.store'
import { useNotesStore } from '@/store/notes.store'
import { useActivitiesStore } from '@/store/activities.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { useFilesStore } from '@/store/files.store'
import { useMailStore } from '@/store/mail.store'

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `vor ${mins} Min.`
  const hours = Math.floor(diff / 3600000)
  if (hours < 24) return `vor ${hours} Std.`
  const days = Math.floor(diff / 86400000)
  if (days === 1) return 'gestern'
  return `vor ${days} Tagen`
}

function formatDue(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date()
  if (d < today && d.toDateString() !== today.toDateString()) return 'Überfällig'
  if (d.toDateString() === today.toDateString()) return 'Heute'
  return iso.slice(0, 10)
}

function fileIcon(mime: string | null): string {
  if (!mime) return '📄'
  if (mime.startsWith('image/')) return '🖼️'
  if (mime.includes('pdf')) return '📕'
  if (mime.includes('word') || mime.includes('document')) return '📝'
  if (mime.includes('sheet') || mime.includes('excel')) return '📊'
  if (mime.includes('zip') || mime.includes('rar')) return '📦'
  return '📄'
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function relationshipStatus(lastActivityTime: string | undefined): { label: string; color: string } {
  if (!lastActivityTime) return { label: 'Kein Kontakt', color: '#ef4444' }
  const days = Math.floor((Date.now() - new Date(lastActivityTime).getTime()) / 86_400_000)
  if (days <= 14) return { label: 'Aktiv', color: '#4ade80' }
  if (days <= 90) return { label: 'Inaktiv', color: '#fbbf24' }
  return { label: 'Eingeschlafen', color: '#ef4444' }
}

// ── Card Wrapper ──────────────────────────────────────────────────────────────

function Card({ title, children, className = '' }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-[var(--bg1)] border border-[var(--border)] flex flex-col ${className}`}>
      {title && (
        <p className="text-xs font-semibold text-[var(--text2)] px-5 pt-4 pb-2 border-b border-[var(--border)]">{title}</p>
      )}
      <div className="flex-1 p-5">{children}</div>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props { customerId: string }

export function DashboardPane({ customerId }: Props) {
  const todos      = useTodosStore(s => s.todos)
  const notes      = useNotesStore(s => s.notes)
  const activities = useActivitiesStore(s => s.activities)
  const createActivity = useActivitiesStore(s => s.create)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const user        = useAuthStore(s => s.user)
  const [showFuForm, setShowFuForm] = useState(false)
  const [fuTitle, setFuTitle]       = useState('')
  const [fuDate, setFuDate]         = useState(() => new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10))

  const followUps = activities.filter(a => a.type === 'followup' && a.status === 'open')
  const folders   = useFilesStore(s => s.folders)
  const files     = useFilesStore(s => s.files)
  const allEmails = useMailStore(s => s.emails)

  // Letzte Interaktion
  const allActivity = [
    ...todos.map(t => ({ label: t.title, time: t.updatedAt, kind: 'task' as const })),
    ...notes.map(n => ({ label: n.title, time: n.updatedAt, kind: 'note' as const })),
    ...followUps.map(f => ({ label: f.title ?? 'Follow-up', time: f.createdAt, kind: 'followup' as const })),
  ].sort((a, b) => b.time.localeCompare(a.time))

  const lastInteraction = allActivity[0]

  // Nächste Aktion
  const nextFollowUp = [...followUps]
    .filter(f => f.dueAt)
    .sort((a, b) => a.dueAt!.localeCompare(b.dueAt!))[0]
  const nextTodo = [...todos]
    .filter(t => t.status !== 'done' && t.dueDate)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0]
  const nextAction = nextFollowUp ?? nextTodo

  // Hohe Prio
  const highPrio = todos
    .filter(t => t.status !== 'done' && t.priority === 'high')
    .slice(0, 6)

  // Timeline
  const timeline = allActivity.slice(0, 8)

  // Dateien
  const recentFiles = [...files].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5)
  const rootFolders = folders.filter(f => !f.parentId).slice(0, 4)

  // Nachrichten
  const customerEmails = allEmails
    .filter(e => e.customerId === customerId)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
    .slice(0, 4)

  // Beziehungsstatus
  const openTodosCount = todos.filter(t => t.status !== 'done').length
  const relStatus = relationshipStatus(lastInteraction?.time)

  return (
    <div className="p-5 flex flex-col gap-4 overflow-auto h-full">

      {/* ── Row 1: Beziehung + Letzte Interaktion + Nächste Aktion ── */}
      <div className="grid grid-cols-3 gap-4">

        {/* Beziehung */}
        <Card>
          <p className="text-[10px] text-[var(--text2)] uppercase tracking-wide mb-3">Beziehung</p>

          {/* Status */}
          <div className="flex items-center gap-2 mb-4">
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: relStatus.color,
              boxShadow: `0 0 7px ${relStatus.color}99`,
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: relStatus.color }}>
              {relStatus.label}
            </span>
            {lastInteraction && (
              <span className="text-xs text-[var(--text2)] ml-0.5">
                {relativeTime(lastInteraction.time)}
              </span>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: 'Aufgaben', value: openTodosCount },
              { label: 'Follow-Ups', value: followUps.length },
              { label: 'Notizen', value: notes.length },
            ].map(stat => (
              <div
                key={stat.label}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 8, padding: '8px 4px', textAlign: 'center',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', lineHeight: 1.1 }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: 9, color: 'var(--text2)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {/* Follow-Up */}
          <div className="pt-3 border-t border-[var(--border)]">
            {showFuForm ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  value={fuTitle}
                  onChange={e => setFuTitle(e.target.value)}
                  placeholder="Follow-Up Titel…"
                  autoFocus
                  className="text-xs px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--fg)] focus:outline-none focus:border-[var(--accent)] placeholder:text-[var(--fg-dim)]"
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="date"
                    value={fuDate}
                    onChange={e => setFuDate(e.target.value)}
                    className="flex-1 text-xs px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--fg)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    onClick={async () => {
                      if (!fuTitle.trim() || !workspaceId) return
                      await createActivity({
                        workspaceId,
                        createdBy: user?.email ?? 'user',
                        accountId: customerId,
                        customerId,
                        type: 'followup',
                        title: fuTitle.trim(),
                        dueAt: fuDate || undefined,
                        status: 'open',
                      })
                      setFuTitle('')
                      setShowFuForm(false)
                    }}
                    className="btn-primary"
                    style={{ fontSize: 11, padding: '4px 12px', flexShrink: 0 }}
                  >
                    Speichern
                  </button>
                  <button
                    onClick={() => setShowFuForm(false)}
                    style={{ fontSize: 11, padding: '4px 8px', color: 'var(--fg-muted)' }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowFuForm(true)}
                className="text-xs text-[var(--fg-2)] hover:text-[var(--accent)] transition-colors"
              >
                + Follow-Up erstellen
              </button>
            )}
          </div>
        </Card>

        {/* Letzte Interaktion */}
        <Card>
          <p className="text-[10px] text-[var(--text2)] uppercase tracking-wide mb-3">Letzte Interaktion</p>
          {lastInteraction ? (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full border border-[var(--border2)] flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text2)]">
                  <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text)] truncate leading-snug">{lastInteraction.label}</p>
                <p className="text-xs text-[var(--text2)] mt-0.5">{relativeTime(lastInteraction.time)}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--text2)]">Noch keine Aktivität</p>
          )}
        </Card>

        {/* Nächste Aktion */}
        <Card>
          <p className="text-[10px] text-[var(--text2)] uppercase tracking-wide mb-3">Nächste Aktion</p>
          {nextAction ? (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full border border-[var(--border2)] flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text2)]">
                  <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text)] truncate leading-snug">
                  {'title' in nextAction ? (nextAction.title ?? 'Follow-up') : nextAction.title}
                </p>
                {(() => {
                  const due: string | undefined = (nextAction as any).dueAt ?? (nextAction as any).dueDate
                  return due ? (
                    <p className="text-xs mt-0.5" style={{ color: formatDue(due) === 'Überfällig' ? '#ef4444' : 'var(--text2)' }}>
                      {formatDue(due)}
                    </p>
                  ) : null
                })()}
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--text2)]">Keine offene Aktion</p>
          )}
        </Card>
      </div>

      {/* ── Row 2: Prio Tasks + Timeline ── */}
      <div className="grid grid-cols-2 gap-4">

        {/* Hohe Priorität */}
        <Card title="Hohe Priorität">
          {highPrio.length === 0 ? (
            <p className="text-sm text-[var(--text2)]">Keine offenen High-Priority Tasks</p>
          ) : (
            <div className="flex flex-col gap-3">
              {highPrio.map(t => (
                <div key={t.id} className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[var(--text)] truncate">{t.title}</p>
                    {t.dueDate && (
                      <p className="text-xs mt-0.5" style={{ color: formatDue(t.dueDate) === 'Überfällig' ? '#ef4444' : 'var(--text2)' }}>
                        {formatDue(t.dueDate)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Timeline */}
        <Card title="Timeline">
          {timeline.length === 0 ? (
            <p className="text-sm text-[var(--text2)]">Keine Aktivitäten</p>
          ) : (
            <div className="flex flex-col gap-3">
              {timeline.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className="w-2 h-2 rounded-full bg-[var(--text2)] mt-1" />
                    {i < timeline.length - 1 && <div className="w-px flex-1 bg-[var(--border)] mt-1 min-h-[12px]" />}
                  </div>
                  <div className="min-w-0 pb-1">
                    <p className="text-sm text-[var(--text)] truncate leading-snug">{item.label}</p>
                    <p className="text-xs text-[var(--text2)] mt-0.5">{relativeTime(item.time)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Row 3: Dateien + Nachrichten ── */}
      <div className="grid grid-cols-2 gap-4">

        {/* Dateien */}
        <Card title="Dateien">
          {rootFolders.length === 0 && recentFiles.length === 0 ? (
            <p className="text-sm text-[var(--text2)]">Noch keine Dateien vorhanden</p>
          ) : (
            <div className="flex flex-col gap-2">
              {rootFolders.map(f => (
                <div key={f.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[var(--bg2)] transition-colors cursor-pointer">
                  <span className="text-base">📁</span>
                  <p className="text-sm text-[var(--text)] truncate">{f.name}</p>
                </div>
              ))}
              {rootFolders.length > 0 && recentFiles.length > 0 && (
                <div className="h-px bg-[var(--border)] my-1" />
              )}
              {recentFiles.map(f => (
                <div key={f.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[var(--bg2)] transition-colors cursor-pointer">
                  <span className="text-base">{fileIcon(f.mimeType)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[var(--text)] truncate">{f.name}</p>
                    {f.size && <p className="text-xs text-[var(--text2)]">{formatBytes(f.size)}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Nachrichten */}
        <Card title="Neueste Nachrichten">
          <div className="flex flex-col gap-3">

            {/* WhatsApp Placeholder */}
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-dashed border-[var(--border)]">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#25D366' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.553 4.116 1.522 5.845L0 24l6.335-1.502A11.954 11.954 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.892 0-3.668-.497-5.208-1.37l-.374-.216-3.762.892.942-3.665-.236-.385A9.952 9.952 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
                </svg>
              </div>
              <p className="text-xs text-[var(--text2)]">WhatsApp — API in Vorbereitung</p>
            </div>

            {/* E-Mails */}
            {customerEmails.length === 0 ? (
              <p className="text-xs text-[var(--text2)] px-1">Keine zugeordneten E-Mails</p>
            ) : (
              customerEmails.map(email => (
                <div key={email.id} className="flex items-start gap-2.5 px-3 py-2 rounded-xl hover:bg-[var(--bg2)] transition-colors cursor-pointer">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${email.isRead ? 'bg-transparent' : 'bg-primary'}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm truncate leading-snug ${email.isRead ? 'text-[var(--text2)]' : 'text-[var(--text)] font-medium'}`}>
                      {email.subject || '(Kein Betreff)'}
                    </p>
                    <p className="text-xs text-[var(--text2)] truncate mt-0.5">{email.fromName || email.fromAddr}</p>
                  </div>
                  <p className="text-[10px] text-[var(--text2)] flex-shrink-0 mt-0.5">
                    {relativeTime(email.sentAt)}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

    </div>
  )
}
