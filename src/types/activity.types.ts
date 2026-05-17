import type { TimestampedEntity } from './common.types'

export type ActivityType =
  | 'note' | 'task' | 'call' | 'meeting'
  | 'email' | 'file' | 'time_entry' | 'stage_change'

export type ActivityStatus = 'open' | 'done' | 'cancelled'

export interface Activity extends TimestampedEntity {
  id: string
  workspaceId: string
  createdBy: string
  accountId: string
  contactId?: string
  dealId?: string
  type: ActivityType
  title?: string
  body?: string
  payload: string
  status: ActivityStatus
  dueAt?: string
  assignee?: string
}

export interface CreateActivityPayload {
  workspaceId: string
  createdBy: string
  accountId: string
  contactId?: string
  dealId?: string
  type: ActivityType
  title?: string
  body?: string
  payload?: string
  status?: ActivityStatus
  dueAt?: string
  assignee?: string
}

export interface UpdateActivityPayload {
  title?: string
  body?: string
  payload?: string
  status?: ActivityStatus
  dueAt?: string
  assignee?: string
}
