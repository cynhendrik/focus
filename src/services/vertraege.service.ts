import { invoke } from '@tauri-apps/api/core'
import type { Vertrag } from '@/types/vertrag.types'

/** DB-Zeile = Vertrag + workspaceId (intern). Das Frontend nutzt nur Vertrag. */
export type ContractRow = Vertrag & { workspaceId: string }

export const VertraegeService = {
  getAll(workspaceId: string): Promise<ContractRow[]> {
    return invoke('cmd_get_contracts', { workspaceId })
  },
  upsert(payload: ContractRow): Promise<ContractRow> {
    return invoke('cmd_upsert_contract', { payload })
  },
  delete(id: string): Promise<void> {
    return invoke('cmd_delete_contract', { id })
  },
}
