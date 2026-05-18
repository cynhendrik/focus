import { invoke } from '@tauri-apps/api/core'
import type { SmartList, SmartListFilter, UpsertSmartListPayload } from '@/types/smart-list.types'
import { log } from '@/lib/logger'

interface RawSmartList extends Omit<SmartList, 'filter'> {
  filter: string
}

function parse(raw: RawSmartList): SmartList {
  let filter: SmartListFilter = {}
  try { filter = JSON.parse(raw.filter) } catch {
    log.warn('SmartList filter parse failed', { id: raw.id })
  }
  return { ...raw, filter }
}

export const SmartListService = {
  async getAll(workspaceId: string): Promise<SmartList[]> {
    const raws = await invoke<RawSmartList[]>('get_smart_lists', { workspaceId })
    return raws.map(parse)
  },

  async upsert(payload: UpsertSmartListPayload): Promise<SmartList> {
    const raw = await invoke<RawSmartList>('upsert_smart_list', {
      payload: { ...payload, filter: JSON.stringify(payload.filter) },
    })
    return parse(raw)
  },

  delete(id: string): Promise<void> {
    return invoke<void>('delete_smart_list', { id })
  },

  seedSystemLists(workspaceId: string): Promise<void> {
    return invoke<void>('seed_system_smart_lists', { workspaceId })
  },
}
