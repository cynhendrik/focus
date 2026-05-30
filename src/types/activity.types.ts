import type { TimestampedEntity } from './common.types'

export type ActivityType =
  | 'note' | 'task' | 'call' | 'meeting'
  | 'email' | 'file' | 'time_entry' | 'stage_change'
  | 'email_out' | 'email_in' | 'dm' | 'system_event'

export type ActivityStatus = 'open' | 'done' | 'cancelled'

export type ActivityOutcome =
  | 'strong_interest' | 'interest_follow_up' | 'proposal_requested'
  | 'deal_won' | 'deal_lost'
  | 'no_interest_later' | 'no_interest_lost'
  | 'no_show' | 'reply_received' | 'no_reply' | 'waiting_for_reply'

export interface Activity extends TimestampedEntity {
  id: string
  workspaceId: string
  createdBy: string
  accountId?: string
  contactId?: string
  dealId?: string
  type: ActivityType
  title?: string
  body?: string
  payload: string
  status: ActivityStatus
  dueAt?: string
  assignee?: string
  outcome?: ActivityOutcome
  direction?: 'in' | 'out'
  emailId?: string
}

export interface CreateActivityPayload {
  workspaceId: string
  createdBy: string
  accountId?: string
  contactId?: string
  dealId?: string
  type: ActivityType
  title?: string
  body?: string
  payload?: string
  status?: ActivityStatus
  dueAt?: string
  assignee?: string
  outcome?: ActivityOutcome
  direction?: 'in' | 'out'
  emailId?: string
}

export interface UpdateActivityPayload {
  title?: string
  body?: string
  payload?: string
  status?: ActivityStatus
  dueAt?: string
  assignee?: string
  outcome?: ActivityOutcome
}
