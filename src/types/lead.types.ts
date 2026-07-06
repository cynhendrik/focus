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

// Stage names stored in DB (migrated to German in v19; accepts any string for custom stages)
export type LeadStatus = 'new' | 'attempted' | 'warm' | 'lost_reengage'
  | 'neu' | 'kontaktiert' | 'qualifiziert' | 'disqualifiziert'
  | string

export type LeadSource = 'zoom' | 'generic' | 'manual' | 'inbox' | 'linkedin' | 'website' | 'event' | 'newsletter'

export interface Lead {
  id: string
  workspaceId: string
  name: string
  email: string | null
  phone: string | null
  accountType: 'lead'
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
  phone?: string
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
  source: 'zoom' | 'generic' | 'newsletter'
  source_detail: string | null
  payload: Record<string, unknown>
  synced: boolean
  created_at: string
}
