export type RuleTriggerType = 'activity_outcome' | 'deal_stage_changed'
export type RuleActionType = 'update_lead_score' | 'set_account_status' | 'set_deal_stage'

export interface AutomationRule {
  id: string
  workspaceId: string
  name: string
  isSystem: boolean
  isActive: boolean
  triggerType: RuleTriggerType
  triggerFilter: Record<string, string>
  actionType: RuleActionType
  actionParams: Record<string, string | number>
  orderIndex: number
  createdAt: string
  updatedAt: string
}
