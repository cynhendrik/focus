export type PreparedItemType = 'mahnung' | 'followup' | 'sequenz' | 'rechnungsentwurf' | 'aufgabe'
export type PreparedItemStatus = 'pending' | 'approved' | 'snoozed' | 'dismissed' | 'resolved'
export type PreparedSourceKind = 'invoice_reminder' | 'crm_follow_up' | 'follow_up_queue' | 'invoice_suggestion' | 'todo'
export interface PreparedItemPayload {
  title: string; why: string
  customerName?: string; invoiceNumber?: string; amount?: number; level?: number
  draftSubject?: string; draftBody?: string
}
export interface PreparedItem {
  id: string; workspaceId: string; type: PreparedItemType
  sourceKind: PreparedSourceKind; sourceId: string; assignee: string | null
  payload: PreparedItemPayload; score: number; status: PreparedItemStatus
  snoozeUntil: string | null; ruleId: string
  createdAt: string; updatedAt: string; approvedAt: string | null
}
export interface CreatePreparedItem {
  workspaceId: string; type: PreparedItemType; sourceKind: PreparedSourceKind
  sourceId: string; assignee?: string | null; payload: PreparedItemPayload
  score: number; ruleId: string
}
