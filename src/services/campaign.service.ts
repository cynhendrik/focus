import { invoke } from '@tauri-apps/api/core'
import type {
  Campaign, CampaignWithStats, CampaignRecipient, CreateCampaignPayload,
} from '@/types/campaign.types'

export const CampaignService = {
  list(workspaceId: string): Promise<CampaignWithStats[]> {
    return invoke('cmd_list_campaigns', { workspaceId })
  },

  get(id: string): Promise<Campaign | null> {
    return invoke('cmd_get_campaign', { id })
  },

  getRecipients(campaignId: string): Promise<CampaignRecipient[]> {
    return invoke('cmd_get_campaign_recipients', { campaignId })
  },

  create(payload: CreateCampaignPayload): Promise<Campaign> {
    return invoke('cmd_create_campaign', { payload })
  },

  send(campaignId: string, leadsJson: string): Promise<void> {
    return invoke('cmd_send_campaign', { campaignId, leadsJson })
  },
}
