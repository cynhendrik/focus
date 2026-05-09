export type FollowUpStatus = 'offen' | 'erledigt'
export type FollowUpPriority = 'low' | 'normal' | 'high'

export interface FollowUp {
  id: string
  customerId: string
  title: string
  dueDate: string
  status: FollowUpStatus
  priority: FollowUpPriority
  createdAt: string
}

export interface UpsertFollowUpPayload {
  id?: string
  customerId: string
  title: string
  dueDate: string
  status?: FollowUpStatus
  priority?: FollowUpPriority
}
