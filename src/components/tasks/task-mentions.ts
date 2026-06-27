import type { MemberProfile } from '@/types/profile.types'
import type { Account } from '@/types/account.types'

export interface TaskMentionCandidate {
  kind: 'member' | 'customer'
  id:   string
  name: string
  sub?: string
}

/** Mitglieder zuerst (Zuweisung), dann nicht-private Kunden (Verknüpfung). */
export function buildTaskMentionCandidates(members: MemberProfile[], accounts: Account[]): TaskMentionCandidate[] {
  const memberCands: TaskMentionCandidate[] = members.map(m => ({
    kind: 'member', id: m.id, name: m.displayName, sub: m.email ?? undefined,
  }))
  const customerCands: TaskMentionCandidate[] = accounts
    .filter(a => !a.isPrivate)
    .map(a => ({ kind: 'customer', id: a.id, name: a.name, sub: a.industry ?? undefined }))
  return [...memberCands, ...customerCands]
}

/** Anzeige-Marker: @Vorname (erstes Wort). */
export function markerForTask(c: TaskMentionCandidate): string {
  return `@${c.name.split(' ')[0]}`
}
