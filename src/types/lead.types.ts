export interface LeadStage {
  id: string
  workspaceId: string
  name: string
  label: string
  orderIndex: number
  color: string
  isQualified: boolean
  isDisqualified: boolean
  createdAt: string
}

export interface UpsertLeadStagePayload {
  id?: string
  workspaceId: string
  name: string
  label: string
  orderIndex?: number
  color?: string
  isQualified?: boolean
  isDisqualified?: boolean
}

export type PipelineStage =
  | 'inbox' | 'waiting_reply' | 'replied' | 'call_booked' | 'won' | 'lost'

// Stage names stored in DB (migrated to German in v19; accepts any string for custom stages)
export type LeadStatus = 'new' | 'attempted' | 'warm' | 'lost_reengage'
  | 'neu' | 'kontaktiert' | 'qualifiziert' | 'disqualifiziert'
  | string

export type LeadSource = 'zoom' | 'generic' | 'manual' | 'inbox' | 'linkedin' | 'website' | 'event'

export interface Lead {
  id: string
  workspaceId: string
  name: string
  email: string | null
  accountType: 'lead'
  // Canonical pipeline stage
  pipelineStage: PipelineStage
  // Legacy (still on DB, preserved for compat)
  leadStatus: LeadStatus
  leadSource: LeadSource
  leadSourceDetail: string | null
  companyName: string | null
  linkedinUrl: string | null
  lastActivityAt: string | null
  nextFollowUpAt: string | null
  engagementScore: number
  reEngageDate: string | null
  convertedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface UpsertLeadPayload {
  id?: string
  workspaceId: string
  name: string
  email?: string
  pipelineStage?: PipelineStage
  leadStatus?: LeadStatus
  leadSource: LeadSource
  leadSourceDetail?: string
  companyName?: string
  linkedinUrl?: string
  reEngageDate?: string
}

export interface BulkUpdateLeadsPayload {
  ids: string[]
  status: string          // was: LeadStatus — now accepts any stage name
  reEngageDate?: string
}

export interface PendingLead {
  id: string
  workspace_id: string
  email: string
  name: string | null
  source: 'zoom' | 'generic'
  source_detail: string | null
  payload: Record<string, unknown>
  synced: boolean
  created_at: string
}
