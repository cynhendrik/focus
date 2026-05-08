import { invoke } from '@tauri-apps/api/core'
import type { Kpi, UpsertKpiPayload } from '@/types/kpi.types'

export const KpiService = {
  getByCustomer(customerId: string): Promise<Kpi[]> {
    return invoke<Kpi[]>('get_kpis', { customerId })
  },
  upsert(payload: UpsertKpiPayload): Promise<Kpi> {
    return invoke<Kpi>('upsert_kpi', { payload })
  },
  delete(id: string): Promise<void> {
    return invoke<void>('delete_kpi', { id })
  },
}
