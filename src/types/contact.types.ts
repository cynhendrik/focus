import type { TimestampedEntity } from './common.types'

export type DecisionPower = 'high' | 'medium' | 'low'
export type PreferredChannel = 'email' | 'phone' | 'whatsapp' | 'in_person'

export interface Contact extends TimestampedEntity {
  id: string
  workspaceId: string
  createdBy: string
  accountId?: string
  firstName: string
  lastName?: string
  email?: string
  phone?: string
  role?: string
  isPrimary: boolean
  avatarUrl?: string
  linkedinUrl?: string
  decisionPower?: DecisionPower
  preferredChannel?: PreferredChannel
  notes?: string
  birthday?: string  // ISO date (YYYY-MM-DD)
}

export interface UpsertContactPayload {
  id?: string
  workspaceId: string
  createdBy: string
  accountId?: string
  firstName: string
  lastName?: string
  email?: string
  phone?: string
  role?: string
  isPrimary?: boolean
  avatarUrl?: string
  linkedinUrl?: string
  decisionPower?: DecisionPower
  preferredChannel?: PreferredChannel
  notes?: string
  birthday?: string
}
