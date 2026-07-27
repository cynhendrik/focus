export type ProjectStatus = 'active' | 'paused' | 'completed'
export type GateState = 'open' | 'pending' | 'approved'

export type DeliverableStatus = 'open' | 'review' | 'done'

export interface Deliverable {
  id: string
  name: string
  status: DeliverableStatus
}

export type MoodboardItemKind = 'image' | 'color' | 'type' | 'note'

export interface MoodboardItemBase {
  id: string
  kind: MoodboardItemKind
  x: number
  y: number
  w: number
  h: number
  cap: string
}

export interface MoodboardImageItem extends MoodboardItemBase {
  kind: 'image'
  storageKey: string | null
}

export interface MoodboardColorItem extends MoodboardItemBase {
  kind: 'color'
  colors: string[]
}

export interface MoodboardTypeItem extends MoodboardItemBase {
  kind: 'type'
  font: string
  sample: string
  note: string
}

export interface MoodboardNoteItem extends MoodboardItemBase {
  kind: 'note'
  text: string
}

export type MoodboardItem = MoodboardImageItem | MoodboardColorItem | MoodboardTypeItem | MoodboardNoteItem

export interface Project {
  id: string
  workspaceId: string
  accountId: string
  title: string
  description: string | null
  status: ProjectStatus
  currentPhaseId: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  retainerMonthly: number
  retainerHours: number
  retainerMonths: number | null
  moodboardItems: MoodboardItem[]
}

export interface UpsertProjectPayload {
  id?: string
  workspaceId: string
  accountId: string
  title: string
  description?: string
  retainerMonthly: number
  retainerHours: number
  retainerMonths: number | null
}

export interface ProjectPhase {
  id: string
  projectId: string
  name: string
  orderIndex: number
  createdAt: string
  startDate: string
  endDate: string
  gateName: string
  gateState: GateState
  gateDate: string | null
  gateApprovedBy: string | null
  progressPercent: number
  deliverables: Deliverable[]
  assigneeIds: string[]
}

export interface CreateProjectPhasePayload {
  projectId: string
  name: string
  startDate: string
  endDate: string
  gateName: string
}
