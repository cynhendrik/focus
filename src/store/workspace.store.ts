import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'

export interface Workspace {
  id: string
  name: string
  logo_url: string | null
  role: 'owner' | 'member'
}

interface WorkspaceState {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  pendingCount: number
  isOnline: boolean
  loadWorkspaces: () => Promise<void>
  createWorkspace: (name: string) => Promise<void>
  setActiveWorkspace: (id: string) => void
  setPendingCount: (count: number) => void
  setOnline: (online: boolean) => void
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      activeWorkspaceId: null,
      pendingCount: 0,
      isOnline: true,

      loadWorkspaces: async () => {
        const { data, error } = await supabase
          .from('workspace_members')
          .select('workspace_id, role, workspaces(id, name, logo_url)')

        if (error) throw error

        const workspaces: Workspace[] = (data ?? []).map((m: any) => ({
          id: m.workspaces.id,
          name: m.workspaces.name,
          logo_url: m.workspaces.logo_url,
          role: m.role as 'owner' | 'member',
        }))

        set({ workspaces })

        const { activeWorkspaceId } = get()
        if (workspaces.length === 1 && !activeWorkspaceId) {
          set({ activeWorkspaceId: workspaces[0].id })
        }
      },

      createWorkspace: async (name) => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Nicht eingeloggt')

        const { data: ws, error: wsErr } = await supabase
          .from('workspaces')
          .insert({ name, created_by: user.id })
          .select()
          .single()
        if (wsErr) throw wsErr

        const { error: memberErr } = await supabase
          .from('workspace_members')
          .insert({ workspace_id: ws.id, user_id: user.id, role: 'owner' })
        if (memberErr) throw memberErr

        await get().loadWorkspaces()
        set({ activeWorkspaceId: ws.id })
      },

      setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),
      setPendingCount: (count) => set({ pendingCount: count }),
      setOnline: (online) => set({ isOnline: online }),
    }),
    {
      name: 'focus-workspace-v1',
      partialize: (s) => ({ activeWorkspaceId: s.activeWorkspaceId }),
    }
  )
)
