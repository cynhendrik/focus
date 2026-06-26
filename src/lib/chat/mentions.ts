import type { MemberProfile } from '@/types/profile.types'
import type { Todo } from '@/types/todo.types'

export interface ChatMentionCandidate {
  kind: 'member' | 'task'
  id:   string
  name: string
  sub?: string
}

export interface ResolvedMarker {
  kind:   'member' | 'task'
  id:     string
  marker: string
}

/** Mitglieder zuerst (das laute Signal), dann offene Aufgaben. Erledigte Aufgaben fallen raus. */
export function buildMentionCandidates(
  members: MemberProfile[],
  todos: Pick<Todo, 'id' | 'title' | 'status'>[],
): ChatMentionCandidate[] {
  const memberCands: ChatMentionCandidate[] = members.map(m => ({
    kind: 'member', id: m.id, name: m.displayName, sub: m.email ?? undefined,
  }))
  const taskCands: ChatMentionCandidate[] = todos
    .filter(t => t.status !== 'done')
    .map(t => ({ kind: 'task', id: t.id, name: t.title, sub: 'Aufgabe' }))
  return [...memberCands, ...taskCands]
}

/** Anzeige-Marker. Mitglied = @Vorname; Aufgabe = @Slug (gekürzt, Leerzeichen→Bindestrich). */
export function markerFor(c: ChatMentionCandidate): string {
  if (c.kind === 'member') return `@${c.name.split(' ')[0]}`
  const slug = c.name.trim().split(/\s+/).slice(0, 4).join('-')
  return `@${slug}`
}

/** Aufgelöste Marker → Trigger-Payload: Mitglieder-IDs als mentions, erste Aufgabe als ref. */
export function resolveComposed(markers: ResolvedMarker[]): {
  mentions: string[]
  ref: { refType: 'task'; refId: string } | null
} {
  const mentions: string[] = []
  for (const m of markers) {
    if (m.kind === 'member' && !mentions.includes(m.id)) mentions.push(m.id)
  }
  const task = markers.find(m => m.kind === 'task')
  return { mentions, ref: task ? { refType: 'task', refId: task.id } : null }
}
