import { invoke } from '@tauri-apps/api/core'
import type { Workspace } from '@/store/workspace.store'

/** Lokaler Workspace mit Cloud-kompatiblen Default-Feldern (verhindert Crashes in Consumern). */
export function makeLocalWorkspace(id: string, name: string): Workspace {
  return { id, name, logo_url: null, role: 'owner', capabilities: [], isShared: false, join_code: null }
}

export async function hasLocalOrphanData(): Promise<boolean> {
  try { return await invoke<boolean>('cmd_has_local_orphan_data') } catch { return false }
}

export async function rescopeWorkspace(from: string, to: string, userId: string): Promise<number> {
  return invoke<number>('cmd_rescope_workspace', { from, to, userId })
}
