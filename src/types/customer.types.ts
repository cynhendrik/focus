import type { TimestampedEntity } from './common.types'

export type CustomerStatus = 'lead' | 'aktiv' | 'inaktiv' | 'lost'
export type Priority = 'low' | 'normal' | 'high'

// ID-Sentinel fuer den system-seitig erzeugten "Privat"-Kunden,
// in dem persoenliche/nicht-Business-Eintraege landen.
export const PRIVATE_CUSTOMER_ID = '__cynera_privat__'

export function isPrivateCustomer(c: { id: string; isPrivate: boolean }): boolean {
  return c.isPrivate || c.id === PRIVATE_CUSTOMER_ID
}

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
  street?: string
  zip?: string
  city?: string
  country?: string
  leadScore: number
  scoreFactors: Record<string, number>
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
  street?: string
  zip?: string
  city?: string
  country?: string
}
