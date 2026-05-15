import type { TimestampedEntity } from './common.types'

export type CustomerStatus = 'lead' | 'aktiv' | 'inaktiv' | 'lost'
export type Priority = 'low' | 'normal' | 'high'

export interface SocialLinks {
  instagram?: string
  linkedin?: string
  website?: string
}

export interface Customer extends TimestampedEntity {
  id: string
  name: string
  company?: string
  email?: string
  phone?: string
  status: CustomerStatus
  priority: Priority
  tags: string[]
  isPrivate: boolean
  workspaceId: string
  industry?: string
  contactPerson?: string
  goals: string[]
  socialLinks: string
  internalNotes?: string
}

export interface UpsertCustomerPayload {
  id?: string
  name: string
  company?: string
  email?: string
  phone?: string
  status?: CustomerStatus
  priority?: Priority
  tags?: string[]
  workspaceId: string
  createdBy: string
  industry?: string
  contactPerson?: string
  goals?: string[]
  socialLinks?: string
  internalNotes?: string
}
