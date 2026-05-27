export type FollowUpStatus = 'pending' | 'sent' | 'cancelled' | 'skipped'
export type FollowUpTemplateKey = 'value' | 'social_proof' | 'question' | 'urgency' | 'none'

export interface FollowUpQueueItem {
  id: string
  workspaceId: string
  leadId: string
  triggerActivityId: string | null
  sequenceIndex: number
  sendAt: string
  status: FollowUpStatus
  templateKey: FollowUpTemplateKey
  draftSubject: string | null
  draftBody: string | null
  sentActivityId: string | null
  sentAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateFollowUpSequencePayload {
  workspaceId: string
  leadId: string
  triggerActivityId: string
  leadName: string
  companyName?: string
}
