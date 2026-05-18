export interface PipelineStage {
  id: string
  workspaceId: string
  name: string
  label: string
  orderIndex: number
  color: string
  isWon: boolean
  isLost: boolean
  createdAt: string
  updatedAt: string
}

export interface UpsertPipelineStagePayload {
  id?: string
  workspaceId: string
  name: string
  label: string
  orderIndex?: number
  color?: string
  isWon?: boolean
  isLost?: boolean
}

export interface Deal {
  id: string
  workspaceId: string
  createdBy: string
  accountId: string
  customerId?: string
  contactId?: string
  title: string
  stage: string
  value?: number
  currency: string
  probability?: number
  expectedClose?: string
  owner?: string
  createdAt: string
  updatedAt: string
}

export interface UpsertDealPayload {
  id?: string
  workspaceId: string
  createdBy: string
  accountId: string
  customerId?: string
  title: string
  stage?: string
  value?: number
  probability?: number
  expectedClose?: string
}

export type ActivityType = 'call' | 'meeting' | 'email' | 'note'

export interface Activity {
  id: string
  workspaceId: string
  createdBy: string
  accountId: string
  customerId?: string
  type: string
  title?: string
  body?: string
  status: string
  createdAt: string
  updatedAt: string
}

export interface CreateActivityPayload {
  workspaceId: string
  createdBy: string
  accountId: string
  customerId?: string
  type: ActivityType
  title?: string
  body?: string
  durationMinutes?: number
}
