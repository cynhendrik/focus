export type CampaignStatus = 'draft' | 'sending' | 'sent' | 'error'

export interface Campaign {
  id: string
  workspaceId: string
  name: string
  subject: string
  body: string
  senderAccountId: string
  smartListId: string | null
  status: CampaignStatus
  sentAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CampaignWithStats extends Campaign {
  sentCount: number
  repliedCount: number
  totalRecipients: number
}

export interface CampaignRecipient {
  id: string
  campaignId: string
  leadId: string
  email: string
  sentAt: string | null
  repliedAt: string | null
  error: string | null
  activityId: string | null
  createdAt: string
}

export interface LeadRef {
  id: string
  email: string
  name: string
  company?: string
}

export interface CreateCampaignPayload {
  workspaceId: string
  name: string
  subject: string
  body: string
  senderAccountId: string
  smartListId?: string
  leads: LeadRef[]
}

export interface CampaignProgress {
  campaignId: string
  sent: number
  total: number
  error?: string
}
