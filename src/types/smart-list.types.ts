import type { CustomerStatus, Priority } from './customer.types'

export interface SmartListFilter {
  status?:       CustomerStatus[]
  priority?:     Priority[]
  scoreMin?:     number
  scoreMax?:     number
  tags?:         string[]
  industry?:     string[]
  inactiveDays?: number
}

export interface SmartList {
  id:          string
  workspaceId: string
  name:        string
  icon:        string
  filter:      SmartListFilter
  orderIndex:  number
  isSystem:    boolean
  createdAt:   string
  updatedAt:   string
}

export interface UpsertSmartListPayload {
  id?:          string
  workspaceId:  string
  name:         string
  icon:         string
  filter:       SmartListFilter
  orderIndex?:  number
  isSystem?:    boolean
}
