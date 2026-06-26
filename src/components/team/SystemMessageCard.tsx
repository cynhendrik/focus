import type { Message } from '@/types/message.types'
import { useMembersStore } from '@/store/members.store'
import { TaskRefChip } from './TaskRefChip'

const EVENT_LABEL: Record<string, string> = {
  task_assigned:  'hat eine Aufgabe zugewiesen',
  task_completed: 'hat eine Aufgabe abgeschlossen',
  task_created:   'hat eine Aufgabe erstellt',
}

/** Mittig zentrierte System-Karte (Zuweisung/Abschluss) mit Aufgaben-Chip. */
export function SystemMessageCard({ message }: { message: Message }) {
  const actor = useMembersStore(s => s.nameOf(message.createdBy))
  const label = (message.systemEvent && EVENT_LABEL[message.systemEvent]) || 'Systemereignis'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, margin: '8px 0' }}>
      <div style={{ fontSize: 11.5, color: 'var(--fg-dim)' }}>
        <strong style={{ color: 'var(--fg-muted)' }}>{actor}</strong> {label}
      </div>
      {message.refType === 'task' && message.refId && <TaskRefChip taskId={message.refId} />}
    </div>
  )
}
