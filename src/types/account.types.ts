import type { TimestampedEntity } from './common.types'

export type AccountKind = 'company' | 'individual'
export type AccountStatus = 'prospect' | 'aktiv' | 'inaktiv' | 'churned'
export type AccountPriority = 'low' | 'normal' | 'high' | 'vip'

export interface Account extends TimestampedEntity {
  id: string
  workspaceId: string
  createdBy: string
  name: string
  kind: AccountKind
  industry?: string
  website?: string
  status: AccountStatus
  priority: AccountPriority
  tags: string[]
  goals: string[]
  healthScore?: number
  internalNotes?: string
  isPrivate: boolean
  socialLinks: string
  primaryDealId?: string
  leadScore: number
  pipelinePhase?: string
  pipelinePhaseLabel?: string
}

export interface UpsertAccountPayload {
  id?: string
  workspaceId: string
  createdBy: string
  name: string
  kind?: AccountKind
  industry?: string
  website?: string
  status?: AccountStatus
  priority?: AccountPriority
  tags?: string[]
  goals?: string[]
  internalNotes?: string
  socialLinks?: string
  primaryDealId?: string
}
