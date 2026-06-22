import { supabase } from '@/lib/supabase'
import type { Role, Capability } from '@/lib/capabilities'

export interface WorkspaceMember {
  userId: string
  role: Role
  capabilities: Capability[]
}

export const WorkspaceMembersGateway = {
  async list(workspaceId: string): Promise<WorkspaceMember[]> {
    const { data, error } = await supabase
      .from('workspace_members')
      .select('user_id, role, capabilities')
      .eq('workspace_id', workspaceId)
    if (error) throw new Error(error.message)
    return (data ?? []).map((r: any) => ({
      userId: r.user_id,
      role: (r.role ?? 'member') as Role,
      capabilities: (r.capabilities ?? []) as Capability[],
    }))
  },

  async updateMember(
    workspaceId: string,
    userId: string,
    patch: { role?: Role; capabilities?: Capability[] },
  ): Promise<void> {
    const { error } = await supabase
      .from('workspace_members')
      .update(patch)
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
    if (error) throw new Error(error.message)
  },
}
