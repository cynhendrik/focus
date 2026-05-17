import { useTodosStore } from '@/store/todos.store'
import { useNotesStore } from '@/store/notes.store'
import { useCrmStore } from '@/store/crm.store'

function computeHealthScore(
  todos: ReturnType<typeof useTodosStore.getState>['todos'],
  notes: ReturnType<typeof useNotesStore.getState>['notes'],
  followUps: ReturnType<typeof useCrmStore.getState>['followUps'],
): number {
  const today = new Date()
  let score = 100
  const overdue = todos.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < today)
  score -= overdue.length * 10
  const highPrioOpen = todos.filter(t => t.status !== 'done' && t.priority === 'high')
  score -= highPrioOpen.length * 5
  const allTimestamps = [...todos.map(t => t.updatedAt), ...notes.map(n => n.updatedAt)]
  if (allTimestamps.length === 0) {
    score -= 20
  } else {
    const last = Math.max(...allTimestamps.map(d => new Date(d).getTime()))
    const daysSince = (today.getTime() - last) / 86400000
    if (daysSince >= 7) score -= 20
  }
  const overdueFollowUps = followUps.filter(f => f.status === 'offen' && new Date(f.dueDate) < today)
  score -= overdueFollowUps.length * 15
  return Math.max(10, Math.min(100, score))
}

function scoreColor(score: number): string {
  if (score >= 70) return '#22c55e'
  if (score >= 40) return '#f59e0b'
  return '#ef4444'
}

function scoreLabel(score: number): string {
  if (score >= 70) return 'Healthy'
  if (score >= 40) return 'At Risk'
  return 'Critical'
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `vor ${mins} Minuten`
  const hours = Math.floor(diff / 3600000)
  if (hours < 24) return `vor ${hours} Stunden`
  const days = Math.floor(diff / 86400000)
  if (days === 1) return 'vor 1 Tag'
  return `vor ${days} Tagen`
}

function formatDue(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date()
  if (d < today && d.toDateString() !== today.toDateString()) return 'Overdue • ASAP'
  if (d.toDateString() === today.toDateString()) {
    const hh = d.getHours().toString().padStart(2, '0')
    const mm = d.getMinutes().toString().padStart(2, '0')
    return `Heute • ${hh}:${mm}`
  }
  return iso.slice(0, 10)
}

function isDueToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString()
}

interface Props { customerId: string }

export function DashboardPane({ customerId: _customerId }: Props) {
  const todos     = useTodosStore(s => s.todos)
  const notes     = useNotesStore(s => s.notes)
  const followUps = useCrmStore(s => s.followUps)

  const score = computeHealthScore(todos, notes, followUps)
  const color = scoreColor(score)
  const label = scoreLabel(score)

  const allActivity = [
    ...todos.map(t => ({ label: t.title, time: t.updatedAt })),
    ...notes.map(n => ({ label: n.title, time: n.updatedAt })),
    ...followUps.map(f => ({ label: f.title, time: f.dueDate })),
  ].sort((a, b) => b.time.localeCompare(a.time))

  const lastInteractionItem = allActivity[0]

  const nextAction = [...followUps]
    .filter(f => f.status === 'offen')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
    ?? [...todos]
      .filter(t => t.status !== 'done' && t.dueDate)
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0]

  const highPrioTodos = todos
    .filter(t => t.status !== 'done' && t.priority === 'high')
    .slice(0, 5)

  const timeline = allActivity.slice(0, 5)

  return (
    <div className="p-6 flex flex-col gap-4 max-w-3xl">

      {/* Top row */}
      <div className="grid grid-cols-3 gap-4">

        {/* Health Score */}
        <div className="p-6 rounded-2xl bg-[var(--bg1)] border border-[var(--border)] flex flex-col gap-3">
          <p className="text-xs text-[var(--text2)]">Health Score</p>
          <div className="flex flex-col items-center gap-2">
            <div className="relative w-28 h-28">
              <svg viewBox="0 0 36 36" className="w-28 h-28 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border2)" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15.9" fill="none"
                  stroke={color} strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={`${score} ${100 - score}`}
                  strokeDashoffset="0"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-3xl font-bold text-[var(--text)]">{score}</span>
              </div>
            </div>
            <p className="text-xs text-[var(--text2)]">{label}</p>
          </div>
        </div>

        {/* Letzte Interaktion */}
        <div className="p-6 rounded-2xl bg-[var(--bg1)] border border-[var(--border)] flex flex-col gap-4">
          <p className="text-xs text-[var(--text2)]">Letzte Interaktion</p>
          {lastInteractionItem ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full border border-[var(--border2)] flex items-center justify-center flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text2)]">
                  <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text)] truncate">{lastInteractionItem.label}</p>
                <p className="text-xs text-[var(--text2)]">{relativeTime(lastInteractionItem.time)}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--text2)]">Keine Aktivität</p>
          )}
        </div>

        {/* Nächste Aktion */}
        <div className="p-6 rounded-2xl bg-[var(--bg1)] border border-[var(--border)] flex flex-col gap-4">
          <p className="text-xs text-[var(--text2)]">Nächste Aktion</p>
          {nextAction ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full border border-[var(--border2)] flex items-center justify-center flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text2)]">
                  <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text)] truncate">{nextAction.title}</p>
                {'dueDate' in nextAction && nextAction.dueDate && isDueToday(nextAction.dueDate) && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                    Heute
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--text2)]">Keine offene Aktion</p>
          )}
        </div>
      </div>

      {/* High Priority Items */}
      <div className="p-6 rounded-2xl bg-[var(--bg1)] border border-[var(--border)]">
        <p className="text-base font-bold text-[var(--text)] mb-5">High Priority Items</p>
        {highPrioTodos.length === 0 ? (
          <p className="text-sm text-[var(--text2)]">Keine offenen High-Priority Tasks</p>
        ) : (
          <div className="flex flex-col gap-4">
            {highPrioTodos.map(t => (
              <div key={t.id} className="flex items-center gap-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text2)] flex-shrink-0">
                  <circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" />
                </svg>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text)]">{t.title}</p>
                  <p className="text-xs text-[var(--text2)]">{formatDue(t.dueDate)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Letzte Aktivitäten */}
      {timeline.length > 0 && (
        <div className="p-6 rounded-2xl bg-[var(--bg1)] border border-[var(--border)]">
          <p className="text-base font-bold text-[var(--text)] mb-5">Letzte Aktivitäten</p>
          <div className="flex flex-col gap-4">
            {timeline.map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="w-2 h-2 rounded-full bg-[var(--text2)] mt-1.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text)]">{item.label}</p>
                  <p className="text-xs text-[var(--text2)]">{relativeTime(item.time)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
