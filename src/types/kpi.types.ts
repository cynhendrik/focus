export interface Kpi {
  id: string
  customerId: string
  label: string
  value?: number
  unit?: string
  target?: number
  period?: string
  updatedAt: string
}

export interface UpsertKpiPayload {
  id?: string
  customerId: string
  label: string
  value?: number
  unit?: string
  target?: number
  period?: string
}
