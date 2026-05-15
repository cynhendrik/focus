import { useTodosStore } from '@/store/todos.store'
import { useNotesStore } from '@/store/notes.store'
import { useCrmStore } from '@/store/crm.store'
import { useUiStore } from '@/store/ui.store'

function computeHealthScore(
  todos: ReturnType<typeof useTodosStore.getState>['todos'],
  notes: ReturnType<typeof useNotesStore.getState>['notes'],
  followUps: ReturnType<typeof useCrmStore.getState>['followUps'],
): number {
  const today = new Date()
  let score = 100

  const overdue = todos.filter(t =>
    t.status !== 'done' && t.dueDate && new Date(t.dueDate) < today
  )
  score -= overdue.length * 10

  const highPrioOpen = todos.filter(t => t.status !== 'done' && t.priority === 'high')
  score -= highPrioOpen.length * 5

  const allTimestamps = [
    ...todos.map(t => t.updatedAt),
    ...notes.map(n => n.updatedAt),
  ]
  if (allTimestamps.length === 0) {
    score -= 20
  } else {
    const last = Math.max(...allTimestamps.map(d => new Date(d).getTime()))
    const daysSince = (today.getTime() - last) / (1000 * 60 * 60 * 24)
    if (daysSince >= 7) score -= 20
  }

  const overdueFollowUps = followUps.filter(f =>
    f.status === 'offen' && new Date(f.dueDate) < today
  )
  score -= overdueFollowUps.length * 15

  return Math.max(10, Math.min(100, score))
}

function scoreColor(score: number): string {
  if (score >= 70) return '#22c55e'
  if (score >= 40) return '#f59e0b'
  return '#ef4444'
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Heute'
  if (days === 1) return 'Gestern'
  return `vor ${days} Tagen`
}

interface Props { customerId: string }

export function DashboardPane({ customerId: _customerId }: Props) {
  const todos     = useTodosStore(s => s.todos)
  const notes     = useNotesStore(s => s.notes)
  const followUps = useCrmStore(s => s.followUps)
  const setTab    = useUiStore(s => s.setActiveCustomerTab)

  const score = computeHealthScore(todos, notes, followUps)
  const color = scoreColor(score)

  const allTimestamps = [
    ...todos.map(t => t.updatedAt),
    ...notes.map(n => n.updatedAt),
  ].sort().reverse()
  const lastInteraction = allTimestamps[0]

  const nextFollowUp = [...followUps]
    .filter(f => f.status === 'offen')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]

  const highPrioTodos = todos
    .filter(t => t.status !== 'done' && t.priority === 'high')
    .slice(0, 5)

  type TimelineItem = { label: string; time: string }
  const timeline: TimelineItem[] = [
    ...todos.map(t => ({ label: `To-Do: ${t.title}`, time: t.createdAt })),
    ...notes.map(n => ({ label: `Notiz: ${n.title}`, time: n.createdAt })),
    ...followUps.map(f => ({ label: `Follow-Up: ${f.title}`, time: f.createdAt })),
  ].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 3)

  return (
    <div className="p-6 flex flex-col gap-5 max-w-3xl">
      {/* Top row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Health Score */}
        <div className="p-5 rounded-2xl bg-[var(--bg1)] border border-[var(--border)] flex flex-col items-center gap-2">
          <p className="text-xs text-[var(--text2)]">Health Score</p>
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center font-bold text-2xl"
            style={{ background: `conic-gradient(${color} ${score * 3.6}deg, var(--bg) ${score * 3.6}deg)` }}
          >
            <div className="w-14 h-14 rounded-full bg-[var(--bg1)] flex items-center justify-center text-lg font-bold" style={{ color }}>
              {score}
            </div>
          </div>
        </div>

        {/* Letzte Interaktion */}
        <div className="p-5 rounded-2xl bg-[var(--bg1)] border border-[var(--border)]">
          <p className="text-xs text-[var(--text2)] mb-1">Letzte Interaktion</p>
          <p className="text-lg font-semibold text-[var(--text)]">
            {lastInteraction ? relativeTime(lastInteraction) : '—'}
          </p>
        </div>

        {/* Nächste Aktion */}
        <div className="p-5 rounded-2xl bg-[var(--bg1)] border border-[var(--border)]">
          <p className="text-xs text-[var(--text2)] mb-1">Nächste Aktion</p>
          {nextFollowUp ? (
            <>
              <p className="text-sm font-medium text-[var(--text)] truncate">{nextFollowUp.title}</p>
              <p className="text-xs text-[var(--text2)] mt-0.5">{nextFollowUp.dueDate}</p>
            </>
          ) : (
            <p className="text-sm text-[var(--text2)]">Kein Follow-Up</p>
          )}
        </div>
      </div>

      {/* High Priority */}
      {highPrioTodos.length > 0 && (
        <div className="p-5 rounded-2xl bg-[var(--bg1)] border border-[var(--border)]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-[var(--text)]">High Priority</p>
            <button onClick={() => setTab('workflow')} className="text-xs text-[var(--text2)] hover:text-primary">
              Alle →
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {highPrioTodos.map(t => (
              <div key={t.id} className="flex items-center gap-2 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                <span className="text-[var(--text)] truncate">{t.title}</span>
                {t.dueDate && <span className="text-xs text-[var(--text2)] ml-auto flex-shrink-0">{t.dueDate}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mini Timeline */}
      {timeline.length > 0 && (
        <div className="p-5 rounded-2xl bg-[var(--bg1)] border border-[var(--border)]">
          <p className="text-sm font-semibold text-[var(--text)] mb-3">Letzte Aktivitäten</p>
          <div className="flex flex-col gap-2">
            {timeline.map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                <span className="text-[var(--text)] flex-1 truncate">{item.label}</span>
                <span className="text-xs text-[var(--text2)] flex-shrink-0">{relativeTime(item.time)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
