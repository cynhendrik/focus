import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { invoke } from '@tauri-apps/api/core'
import { supabase } from '@/lib/supabase'
import type { Role, Capability } from '@/lib/capabilities'
import { makeLocalWorkspace, hasLocalOrphanData, rescopeWorkspace } from '@/data/workspace-local'

export interface Workspace {
  id: string
  name: string
  logo_url: string | null
  role: Role
  capabilities: Capability[]
  isShared: boolean
  join_code: string | null
}

const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Kurzer, verbal teilbarer Beitritts-Code: 6 Zeichen, ohne Verwechsler (0/O/1/I). */
export function generateJoinCode(length = 6): string {
  let out = ''
  for (let i = 0; i < length; i++) {
    out += JOIN_CODE_ALPHABET[Math.floor(Math.random() * JOIN_CODE_ALPHABET.length)]
  }
  return out
}

interface WorkspaceState {
  workspaces: Workspace[]
  localWorkspaces: Workspace[]
  activeWorkspaceId: string | null
  pendingCount: number
  failedCount: number
  isOnline: boolean
  loadWorkspaces: () => Promise<void>
  createWorkspace: (name: string) => Promise<void>
  createCloudWorkspaceRecord: (name: string) => Promise<string>
  createLocalWorkspace: (name: string) => string
  joinWorkspaceByCode: (code: string) => Promise<void>
  deleteWorkspace: (id: string) => Promise<void>
  regenerateJoinCode: (workspaceId: string) => Promise<string>
  setActiveWorkspace: (id: string) => void
  setPendingCount: (count: number) => void
  setFailedCount: (count: number) => void
  setOnline: (online: boolean) => void
  getActiveWorkspaceId: () => string | null
  isActiveWorkspaceShared: () => boolean
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      localWorkspaces: [],
      activeWorkspaceId: null,
      pendingCount: 0,
      failedCount: 0,
      isOnline: true,

      loadWorkspaces: async () => {
        const { data: { session } } = await supabase.auth.getSession()
        const uid = session?.user?.id
        if (!uid) {
          set({ workspaces: [] })
          return
        }

        const { data, error } = await supabase
          .from('workspace_members')
          .select('workspace_id, role, capabilities, workspaces(id, name, logo_url, join_code)')
          .eq('user_id', uid)

        if (error) throw error

        const cloud: Workspace[] = (data ?? []).map((m: any) => ({
          id: m.workspaces.id,
          name: m.workspaces.name,
          logo_url: m.workspaces.logo_url,
          role: (m.role ?? 'member') as Role,
          capabilities: (m.capabilities ?? []) as Capability[],
          join_code: m.workspaces.join_code ?? null,
          isShared: true,
        }))

        // Adoption: vorhandene 'dev'-Daten als lokalen Workspace übernehmen (einmalig).
        let local = get().localWorkspaces
        if (local.length === 0 && await hasLocalOrphanData()) {
          const id = crypto.randomUUID()
          await rescopeWorkspace('dev', id, uid)
          local = [makeLocalWorkspace(id, 'Mein Workspace')]
          set({ localWorkspaces: local, activeWorkspaceId: id })
        }

        set({ workspaces: cloud })

        const all = [...cloud, ...local]
        const { activeWorkspaceId } = get()
        const validActive = all.some((w) => w.id === activeWorkspaceId)
        if (!validActive) {
          set({ activeWorkspaceId: all.length === 1 ? all[0].id : null })
        }
      },

      createWorkspace: async (name) => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Nicht eingeloggt')

        const { data: ws, error: wsErr } = await supabase
          .from('workspaces')
          .insert({ name, created_by: user.id, join_code: generateJoinCode() })
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

      createCloudWorkspaceRecord: async (name) => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Nicht eingeloggt')
        const { data: ws, error: wsErr } = await supabase
          .from('workspaces')
          .insert({ name, created_by: user.id, join_code: generateJoinCode() })
          .select().single()
        if (wsErr) throw wsErr
        const { error: memberErr } = await supabase
          .from('workspace_members')
          .insert({ workspace_id: ws.id, user_id: user.id, role: 'owner' })
        if (memberErr) throw memberErr
        return ws.id as string
      },

      createLocalWorkspace: (name) => {
        const id = crypto.randomUUID()
        set((s) => ({ localWorkspaces: [...s.localWorkspaces, makeLocalWorkspace(id, name)], activeWorkspaceId: id }))
        return id
      },

      joinWorkspaceByCode: async (code) => {
        const { data, error } = await supabase.rpc('join_workspace_by_code', {
          p_code: code.trim().toUpperCase(),
        })
        if (error) throw new Error(error.message || 'Beitritt fehlgeschlagen')
        await get().loadWorkspaces()
        if (typeof data === 'string') set({ activeWorkspaceId: data })
      },

      deleteWorkspace: async (id) => {
        const all = [...get().workspaces, ...get().localWorkspaces]
        const ws = all.find((w) => w.id === id)
        if (!ws) return
        if (ws.isShared) {
          const { error } = await supabase.rpc('delete_workspace', { ws_id: id })
          if (error) throw new Error(error.message || 'Löschen fehlgeschlagen')
          set((s) => ({ workspaces: s.workspaces.filter((w) => w.id !== id) }))
        } else {
          await invoke('cmd_delete_workspace')
          set((s) => ({ localWorkspaces: s.localWorkspaces.filter((w) => w.id !== id) }))
        }
        if (get().activeWorkspaceId === id) {
          const remaining = [...get().workspaces, ...get().localWorkspaces]
          set({ activeWorkspaceId: remaining.length > 0 ? remaining[0].id : null })
        }
      },

      regenerateJoinCode: async (workspaceId) => {
        // Einmaliger Retry bei Unique-Kollision auf join_code.
        for (let attempt = 0; attempt < 2; attempt++) {
          const code = generateJoinCode()
          const { error } = await supabase
            .from('workspaces')
            .update({ join_code: code })
            .eq('id', workspaceId)
          if (!error) {
            set((s) => ({
              workspaces: s.workspaces.map((w) =>
                w.id === workspaceId ? { ...w, join_code: code } : w),
            }))
            return code
          }
          if (error.code !== '23505') throw new Error(error.message || 'Code-Aktualisierung fehlgeschlagen')
        }
        throw new Error('Konnte keinen eindeutigen Code erzeugen')
      },

      setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),
      setPendingCount: (count) => set({ pendingCount: count }),
      setFailedCount: (count) => set({ failedCount: count }),
      setOnline: (online) => set({ isOnline: online }),

      getActiveWorkspaceId: () => get().activeWorkspaceId,
      isActiveWorkspaceShared: () => {
        const { workspaces, localWorkspaces, activeWorkspaceId } = get()
        return [...workspaces, ...localWorkspaces].find((w) => w.id === activeWorkspaceId)?.isShared ?? false
      },
    }),
    {
      name: 'focus-workspace-v2',
      migrate: (persisted) => {
        const s = (persisted ?? {}) as Record<string, unknown>
        if (!Array.isArray(s.localWorkspaces)) s.localWorkspaces = []
        return s as unknown as WorkspaceState
      },
      partialize: (s) => ({ activeWorkspaceId: s.activeWorkspaceId, localWorkspaces: s.localWorkspaces }),
    }
  )
)
