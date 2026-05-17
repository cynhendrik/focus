import type { TimestampedEntity } from './common.types'

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
}
