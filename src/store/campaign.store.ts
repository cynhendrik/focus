import { create } from 'zustand'
import { CampaignService } from '@/services/campaign.service'
import { log } from '@/lib/logger'
import type {
  CampaignWithStats, CampaignRecipient, CreateCampaignPayload, CampaignProgress,
} from '@/types/campaign.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface CampaignState {
  campaigns: CampaignWithStats[]
  activeCampaignId: string | null
  recipients: CampaignRecipient[]
  sendProgress: CampaignProgress | null
  isLoading: boolean
  error: AppError | null

  load: (workspaceId: string) => Promise<void>
  loadRecipients: (campaignId: string) => Promise<void>
  setActive: (id: string | null) => void
  create: (payload: CreateCampaignPayload) => Promise<void>
  send: (campaignId: string, leadsJson: string, workspaceId: string) => Promise<void>
  setSendProgress: (p: CampaignProgress | null) => void
}

export const useCampaignStore = create<CampaignState>()((set, get) => ({
  campaigns: [],
  activeCampaignId: null,
  recipients: [],
  sendProgress: null,
  isLoading: false,
  error: null,

  load: async (workspaceId) => {
    set({ isLoading: true, error: null })
    try {
      const campaigns = await CampaignService.list(workspaceId)
      set({ campaigns, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load campaigns', { error })
    }
  },

  loadRecipients: async (campaignId) => {
    set({ isLoading: true, error: null })
    try {
      const recipients = await CampaignService.getRecipients(campaignId)
      set({ recipients, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load campaign recipients', { error })
    }
  },

  setActive: (id) => {
    set({ activeCampaignId: id, recipients: [] })
  },

  create: async (payload) => {
    set({ error: null })
    try {
      await CampaignService.create(payload)
      await get().load(payload.workspaceId)
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  send: async (campaignId, leadsJson, workspaceId) => {
    set({ error: null })
    try {
      await CampaignService.send(campaignId, leadsJson)
      await get().load(workspaceId)
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  setSendProgress: (p) => {
    set({ sendProgress: p })
  },
}))
