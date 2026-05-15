import { useTodosStore } from '@/store/todos.store'
import { useNotesStore } from '@/store/notes.store'
import { useCrmStore } from '@/store/crm.store'

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

interface Props { customerId: string }

export function HealthPane({ customerId: _customerId }: Props) {
  const todos     = useTodosStore(s => s.todos)
  const notes     = useNotesStore(s => s.notes)
  const followUps = useCrmStore(s => s.followUps)

  const today = new Date()
  let score = 100

  const overdue = todos.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < today)
  score -= overdue.length * 10

  const highPrioOpen = todos.filter(t => t.status !== 'done' && t.priority === 'high')
  score -= highPrioOpen.length * 5

  const timestamps = [...todos.map(t => t.updatedAt), ...notes.map(n => n.updatedAt)]
  if (timestamps.length === 0) {
    score -= 20
  } else {
    const last = Math.max(...timestamps.map(d => new Date(d).getTime()))
    const daysSince = (today.getTime() - last) / 86400000
    if (daysSince >= 7) score -= 20
  }

  const overdueFollowUps = followUps.filter(f => f.status === 'offen' && new Date(f.dueDate) < today)
  score -= overdueFollowUps.length * 15

  score = Math.max(10, Math.min(100, score))
  const color = scoreColor(score)
  const label = scoreLabel(score)

  const doneTodos  = todos.filter(t => t.status === 'done').length
  const openTodos  = todos.filter(t => t.status !== 'done').length
  const waitingNotes = notes.filter(n => n.waitingReply).length
  const openFu     = followUps.filter(f => f.status === 'offen').length

  return (
    <div className="p-6 max-w-2xl flex flex-col gap-6">
      <h2 className="text-sm font-semibold text-[var(--text)]">Health / Insights</h2>

      {/* Score */}
      <div className="p-6 rounded-2xl bg-[var(--bg1)] border border-[var(--border)] flex items-center gap-8">
        <div className="relative w-28 h-28 flex-shrink-0">
          <svg viewBox="0 0 36 36" className="w-28 h-28 -rotate-90">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" strokeWidth="3" />
            <circle
              cx="18" cy="18" r="15.9" fill="none"
              stroke={color} strokeWidth="3" strokeLinecap="round"
              strokeDasharray={`${score} ${100 - score}`}
              strokeDashoffset="0"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-[var(--text)]">{score}</span>
            <span className="text-[10px] text-[var(--text2)]">{label}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-base font-semibold text-[var(--text)]">Kundengesundheit</p>
          {overdue.length > 0 && (
            <p className="text-sm text-red-400">↓ {overdue.length} überfällige To-Dos (−{overdue.length * 10} Punkte)</p>
          )}
          {highPrioOpen.length > 0 && (
            <p className="text-sm text-amber-400">↓ {highPrioOpen.length} offene High-Priority Tasks (−{highPrioOpen.length * 5} Punkte)</p>
          )}
          {overdueFollowUps.length > 0 && (
            <p className="text-sm text-red-400">↓ {overdueFollowUps.length} überfällige Follow-Ups (−{overdueFollowUps.length * 15} Punkte)</p>
          )}
          {score === 100 && <p className="text-sm text-green-400">Alles im grünen Bereich ✓</p>}
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: 'Offene Tasks',        value: openTodos,    color: 'text-[var(--text)]' },
          { label: 'Erledigte Tasks',      value: doneTodos,    color: 'text-green-400' },
          { label: 'Warten auf Antwort',   value: waitingNotes, color: 'text-amber-400' },
          { label: 'Offene Follow-Ups',    value: openFu,       color: 'text-[var(--text)]' },
        ].map(item => (
          <div key={item.label} className="p-4 rounded-xl bg-[var(--bg1)] border border-[var(--border)]">
            <p className="text-xs text-[var(--text2)] mb-1">{item.label}</p>
            <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
