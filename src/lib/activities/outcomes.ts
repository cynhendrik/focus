import type { ActivityOutcome } from '@/types/activity.types'
import type { CreateActivityPayload } from '@/types/pipeline.types'

/**
 * Ergebnis-Auswahl beim Loggen einer Interaktion. Die Werte sind exakt die
 * Outcomes, auf die die Automatisierungsregeln (Lead-Scoring) hören —
 * ein Klick hier ist das, was den Engagement-Score bewegt.
 */
export interface OutcomeOption {
  value: ActivityOutcome
  label: string
}

const CALL_MEETING_OPTIONS: OutcomeOption[] = [
  { value: 'strong_interest',    label: 'Starkes Interesse' },
  { value: 'interest_follow_up', label: 'Interesse — nachfassen' },
  { value: 'proposal_requested', label: 'Angebot gewünscht' },
  { value: 'no_reply',           label: 'Nicht erreicht' },
  { value: 'no_show',            label: 'No-Show' },
  { value: 'no_interest_later',  label: 'Kein Interesse (vorerst)' },
]

const EMAIL_OPTIONS: OutcomeOption[] = [
  { value: 'reply_received',     label: 'Antwort erhalten' },
  { value: 'waiting_for_reply',  label: 'Warte auf Antwort' },
  { value: 'no_reply',           label: 'Keine Antwort' },
]

export function outcomeOptionsFor(kind: string): OutcomeOption[] {
  if (kind === 'call' || kind === 'meeting') return CALL_MEETING_OPTIONS
  if (kind === 'email') return EMAIL_OPTIONS
  return []
}

/** Outcomes, nach denen automatisch drangeblieben werden muss. */
const RETRY_OUTCOMES: ReadonlySet<ActivityOutcome> = new Set(['no_reply', 'no_show'])

const RETRY_DAYS = 3

/**
 * „Nicht erreicht" / No-Show → automatisch ein Follow-up in 3 Tagen, damit
 * kein Lead durchrutscht. Positive Ergebnisse erzeugen nichts — da entscheidet
 * der Nutzer selbst über den nächsten Schritt.
 */
export function autoFollowUpForOutcome(input: {
  outcome?: ActivityOutcome
  accountId: string
  workspaceId: string
  userId: string
  leadName?: string
  now?: Date
}): CreateActivityPayload | null {
  if (!input.outcome || !RETRY_OUTCOMES.has(input.outcome)) return null
  const due = new Date(input.now ?? new Date())
  due.setUTCDate(due.getUTCDate() + RETRY_DAYS)
  return {
    workspaceId: input.workspaceId,
    createdBy: input.userId,
    accountId: input.accountId,
    type: 'task',
    title: input.leadName ? `Erneut versuchen: ${input.leadName}` : 'Erneut versuchen',
    dueAt: due.toISOString().slice(0, 10),
    status: 'open',
    payload: JSON.stringify({ is_follow_up: true, auto_from_outcome: input.outcome }),
  }
}
