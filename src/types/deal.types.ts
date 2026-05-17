import type { TimestampedEntity } from './common.types'

export type DealStage = 'prospect' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost'

export interface Deal extends TimestampedEntity {
  id: string
  workspaceId: string
  createdBy: string
  accountId: string
  contactId?: string
  title: string
  stage: DealStage
  value?: number
  currency: string
  probability?: number
  expectedClose?: string
  owner?: string
}

export interface UpsertDealPayload {
  id?: string
  workspaceId: string
  createdBy: string
  accountId: string
  contactId?: string
  title: string
  stage?: DealStage
  value?: number
  currency?: string
  probability?: number
  expectedClose?: string
  owner?: string
}
