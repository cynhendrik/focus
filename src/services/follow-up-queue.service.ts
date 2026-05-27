import { invoke } from '@tauri-apps/api/core'
import type { FollowUpQueueItem, CreateFollowUpSequencePayload } from '@/types/follow-up-queue.types'

export const FollowUpQueueService = {
  getDue(workspaceId: string): Promise<FollowUpQueueItem[]> {
    return invoke('cmd_get_due_follow_ups', { workspaceId })
  },

  getForLead(leadId: string): Promise<FollowUpQueueItem[]> {
    return invoke('cmd_get_follow_ups_for_lead', { leadId })
  },

  createSequence(p: CreateFollowUpSequencePayload): Promise<FollowUpQueueItem[]> {
    return invoke('cmd_create_follow_up_sequence', {
      workspaceId: p.workspaceId,
      leadId: p.leadId,
      triggerActivityId: p.triggerActivityId,
      leadName: p.leadName,
      companyName: p.companyName ?? null,
    })
  },

  cancelForLead(leadId: string): Promise<number> {
    return invoke('cmd_cancel_follow_ups_for_lead', { leadId })
  },

  markSent(id: string, sentActivityId: string): Promise<FollowUpQueueItem> {
    return invoke('cmd_mark_follow_up_sent', { id, sentActivityId })
  },

  markSkipped(id: string): Promise<FollowUpQueueItem> {
    return invoke('cmd_mark_follow_up_skipped', { id })
  },

  updateDraft(id: string, subject: string | null, body: string | null): Promise<FollowUpQueueItem> {
    return invoke('cmd_update_follow_up_draft', { id, subject, body })
  },
}
