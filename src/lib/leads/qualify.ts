import type { CreateActivityPayload } from '@/types/pipeline.types'

/**
 * Baut aus dem Termindatum des Qualifizieren-Dialogs ein Follow-up am Termin —
 * type 'task' + is_follow_up ist die Konvention aller Follow-Up-Listen
 * (Mein Tag, Stapel, ActivityStream). Ohne Datum entsteht nichts.
 */
export function appointmentFollowUp(input: {
  leadId: string
  leadName: string
  workspaceId: string
  userId: string
  appointmentDate?: string
}): CreateActivityPayload | null {
  if (!input.appointmentDate) return null
  return {
    workspaceId: input.workspaceId,
    createdBy: input.userId,
    accountId: input.leadId,
    type: 'task',
    title: `Termin mit ${input.leadName}`,
    dueAt: input.appointmentDate,
    status: 'open',
    payload: JSON.stringify({ is_follow_up: true }),
  }
}
