import { useTodosStore } from '@/store/todos.store'

const SEED_FLAG = 'cynera.tasks.ai-summary-seeded.v1'

const SAMPLE_SUMMARIES = [
  'Letzter Stand: erste Iteration vorbereitet, Kunde hat Feedback zur Farbpalette gegeben. Heute: Reinarbeiten und finale Version vorschlagen.',
  'Kontext: Kunde wartet seit 2 Tagen auf Rückmeldung. Heute kurz anrufen, offene Fragen klären, danach mit Designupdate weitermachen.',
  'Vorbereitung Call: Agenda-Punkte sammeln, vorherige Notizen sichten, Beispiele aus letzter Woche bereithalten.',
  'Ablage: alle relevanten Dokumente liegen im Workspace-Ordner. Heute strukturieren und an Kunde freigeben.',
  'Nachfassen: Angebot ging vor einer Woche raus, höflicher Reminder ohne Druck, offen für Rückfragen.',
]

export async function seedSampleAiSummaries() {
  if (typeof window === 'undefined') return
  if (localStorage.getItem(SEED_FLAG)) return

  const store = useTodosStore.getState()
  const candidates = store.allTodos
    .filter(t => t.status !== 'done' && !t.aiSummary)
    .slice(0, SAMPLE_SUMMARIES.length)
  if (candidates.length === 0) return

  for (let i = 0; i < candidates.length; i++) {
    const t = candidates[i]
    await store.upsert({
      id: t.id,
      customerId: t.customerId,
      title: t.title,
      status: t.status,
      priority: t.priority,
      bucket: t.bucket,
      scheduledAt: t.scheduledAt,
      plannedMinutes: t.plannedMinutes,
      dueDate: t.dueDate,
      notes: t.notes,
      aiSummary: SAMPLE_SUMMARIES[i],
      checklist: t.checklist,
      tags: t.tags,
      assignee: t.assignee,
    })
  }

  localStorage.setItem(SEED_FLAG, '1')
}
