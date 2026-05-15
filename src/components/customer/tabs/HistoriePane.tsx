import { useTodosStore } from '@/store/todos.store'
import { useNotesStore } from '@/store/notes.store'
import { useFilesStore } from '@/store/files.store'
import { useCrmStore } from '@/store/crm.store'
import { useDeadlinesStore } from '@/store/deadlines.store'

interface TimelineEvent {
  id: string
  icon: string
  label: string
  timestamp: string
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours   = Math.floor(diff / 3600000)
  const days    = Math.floor(diff / 86400000)
  if (minutes < 60) return `vor ${minutes} Min.`
  if (hours < 24)   return `vor ${hours} Std.`
  if (days === 1)   return 'Gestern'
  return `vor ${days} Tagen`
}

interface Props { customerId: string }

export function HistoriePane({ customerId: _customerId }: Props) {
  const todos     = useTodosStore(s => s.todos)
  const notes     = useNotesStore(s => s.notes)
  const files     = useFilesStore(s => s.files)
  const followUps = useCrmStore(s => s.followUps)
  const deadlines = useDeadlinesStore(s => s.deadlines)

  const events: TimelineEvent[] = [
    ...todos.map(t => ({ id: `todo-${t.id}`, icon: '✅', label: `To-Do erstellt: ${t.title}`, timestamp: t.createdAt })),
    ...todos.filter(t => t.status === 'done').map(t => ({ id: `todo-done-${t.id}`, icon: '✓', label: `To-Do erledigt: ${t.title}`, timestamp: t.updatedAt })),
    ...notes.map(n => ({ id: `note-${n.id}`, icon: '📝', label: `Notiz: ${n.title}`, timestamp: n.createdAt })),
    ...files.map(f => ({ id: `file-${f.id}`, icon: '📎', label: `Datei hochgeladen: ${f.name}`, timestamp: f.createdAt })),
    ...followUps.map(f => ({ id: `fu-${f.id}`, icon: '🔔', label: `Follow-Up: ${f.title}`, timestamp: f.createdAt })),
    ...followUps.filter(f => f.status === 'erledigt').map(f => ({ id: `fu-done-${f.id}`, icon: '✓', label: `Follow-Up erledigt: ${f.title}`, timestamp: f.createdAt })),
    ...deadlines.map(d => ({ id: `dl-${d.id}`, icon: '📅', label: `Deadline: ${d.title}`, timestamp: d.createdAt })),
  ].sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-sm font-semibold text-[var(--text)] mb-4">Aktivitäten</h2>

      {events.length === 0 ? (
        <p className="text-sm text-[var(--text2)] text-center py-12">Noch keine Aktivitäten</p>
      ) : (
        <div className="flex flex-col">
          {events.map((event, i) => (
            <div key={event.id} className="flex gap-4 pb-4 relative">
              {i < events.length - 1 && (
                <div className="absolute left-4 top-6 bottom-0 w-px bg-[var(--border)]" />
              )}
              <div className="w-8 h-8 rounded-full bg-[var(--bg1)] border border-[var(--border)] flex items-center justify-center text-sm flex-shrink-0 z-10">
                {event.icon}
              </div>
              <div className="flex-1 pt-1 min-w-0">
                <p className="text-sm text-[var(--text)] truncate">{event.label}</p>
                <p className="text-xs text-[var(--text2)] mt-0.5">{relativeTime(event.timestamp)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
