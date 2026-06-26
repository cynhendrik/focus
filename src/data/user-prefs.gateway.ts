import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth.store'

function fail(error: { message: string }): never { throw new Error(error.message) }

export const UserPrefsGateway = {
  async getMuted(workspaceId: string): Promise<string[]> {
    const uid = useAuthStore.getState().user?.id
    if (!uid) return []
    const { data, error } = await supabase
      .from('user_workspace_prefs')
      .select('muted_refs')
      .eq('user_id', uid).eq('workspace_id', workspaceId).maybeSingle()
    if (error) fail(error)
    const v = data?.muted_refs
    return Array.isArray(v) ? v as string[] : []
  },

  async toggleMute(workspaceId: string, refId: string): Promise<string[]> {
    const uid = useAuthStore.getState().user?.id
    if (!uid) return []
    const current = await this.getMuted(workspaceId)
    const next = current.includes(refId) ? current.filter(r => r !== refId) : [...current, refId]
    const { error } = await supabase
      .from('user_workspace_prefs')
      .upsert({ user_id: uid, workspace_id: workspaceId, muted_refs: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id,workspace_id' })
    if (error) fail(error)
    return next
  },
}
