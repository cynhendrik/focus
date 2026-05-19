export type LeadStatus = 'new' | 'attempted' | 'warm' | 'lost_reengage'
export type LeadSource = 'zoom' | 'generic' | 'manual'

export interface Lead {
  id: string
  workspaceId: string
  name: string
  email: string | null
  accountType: 'lead'
  leadStatus: LeadStatus
  leadSource: LeadSource
  leadSourceDetail: string | null
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
  leadStatus?: LeadStatus
  leadSource: LeadSource
  leadSourceDetail?: string
  reEngageDate?: string
}

export interface BulkUpdateLeadsPayload {
  ids: string[]
  status: LeadStatus
  reEngageDate?: string
}

export interface PendingLead {
  id: string
  workspace_id: string
  email: string
  name: string | null
  source: 'zoom' | 'generic'
  sourceDetail: string | null
  payload: Record<string, unknown>
  synced: boolean
  createdAt: string
}
