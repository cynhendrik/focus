import type { Todo } from '@/types/todo.types'
import type { Kpi } from '@/types/kpi.types'
import type { FollowUp } from '@/types/crm.types'

export interface HealthScoreResult {
  score: number
  label: string
  color: string
  factors: {
    todoCompletion: number
    kpiProgress: number
    followUpHealth: number
  }
}

export function computeHealthScore(
  todos: Todo[],
  kpis: Kpi[],
  followUps: FollowUp[],
): HealthScoreResult {
  // Todo completion rate (0–100)
  const todoCompletion = todos.length === 0
    ? 50
    : Math.round((todos.filter(t => t.status === 'done').length / todos.length) * 100)

  // KPI progress average (0–100)
  const kpisWithTarget = kpis.filter(k => k.value != null && k.target != null && k.target > 0)
  const kpiProgress = kpisWithTarget.length === 0
    ? 50
    : Math.round(
        kpisWithTarget.reduce((sum, k) => sum + Math.min(100, (k.value! / k.target!) * 100), 0)
        / kpisWithTarget.length
      )

  // Follow-up health: penalize overdue open items (0–100)
  const today = new Date().toISOString().slice(0, 10)
  const openFollowUps = followUps.filter(f => f.status === 'offen')
  const overdueCount = openFollowUps.filter(f => f.dueDate < today).length
  const followUpHealth = openFollowUps.length === 0
    ? 100
    : Math.max(0, 100 - Math.round((overdueCount / openFollowUps.length) * 100))

  const score = Math.round((todoCompletion + kpiProgress + followUpHealth) / 3)

  let label: string
  let color: string
  if (score >= 80) { label = 'Sehr gut'; color = 'text-green-500' }
  else if (score >= 60) { label = 'Gut'; color = 'text-primary' }
  else if (score >= 40) { label = 'Mittel'; color = 'text-amber-500' }
  else { label = 'Kritisch'; color = 'text-red-500' }

  return { score, label, color, factors: { todoCompletion, kpiProgress, followUpHealth } }
}
