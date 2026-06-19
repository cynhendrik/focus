import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'

export interface Workspace {
  id: string
  name: string
  logo_url: string | null
  role: 'owner' | 'member'
  isShared: boolean
  join_code: string | null
}

/** Pro Workspace true, wenn mehr als ein Mitglied existiert. */
export function deriveShared(
  ids: string[],
  memberRows: { workspace_id: string }[],
): Record<string, boolean> {
  const counts = new Map<string, number>()
  for (const r of memberRows) counts.set(r.workspace_id, (counts.get(r.workspace_id) ?? 0) + 1)
  const out: Record<string, boolean> = {}
  for (const id of ids) out[id] = (counts.get(id) ?? 0) > 1
  return out
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
  activeWorkspaceId: string | null
  pendingCount: number
  isOnline: boolean
  loadWorkspaces: () => Promise<void>
  createWorkspace: (name: string) => Promise<void>
  joinWorkspaceByCode: (code: string) => Promise<void>
  regenerateJoinCode: (workspaceId: string) => Promise<string>
  setActiveWorkspace: (id: string) => void
  setPendingCount: (count: number) => void
  setOnline: (online: boolean) => void
  getActiveWorkspaceId: () => string | null
  isActiveWorkspaceShared: () => boolean
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      activeWorkspaceId: null,
      pendingCount: 0,
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
          .select('workspace_id, role, workspaces(id, name, logo_url, join_code)')
          .eq('user_id', uid)

        if (error) throw error

        const base = (data ?? []).map((m: any) => ({
          id: m.workspaces.id,
          name: m.workspaces.name,
          logo_url: m.workspaces.logo_url,
          role: m.role as 'owner' | 'member',
          join_code: m.workspaces.join_code ?? null,
        }))

        const ids = base.map((w) => w.id)
        let sharedMap: Record<string, boolean> = {}
        if (ids.length > 0) {
          const { data: members } = await supabase
            .from('workspace_members')
            .select('workspace_id')
            .in('workspace_id', ids)
          sharedMap = deriveShared(ids, members ?? [])
        }

        const workspaces: Workspace[] = base.map((w) => ({
          ...w,
          isShared: sharedMap[w.id] ?? false,
        }))

        set({ workspaces })

        // Die persistierte activeWorkspaceId kann veraltet sein (z. B. eine alte
        // 'dev'-Id oder ein Workspace, dem der Nutzer nicht mehr angehört). Passt
        // sie zu keinem geladenen Workspace, zurücksetzen: bei genau einem
        // Workspace automatisch wählen, sonst null (dann greift der Picker).
        const { activeWorkspaceId } = get()
        const validActive = workspaces.some((w) => w.id === activeWorkspaceId)
        if (!validActive) {
          set({ activeWorkspaceId: workspaces.length === 1 ? workspaces[0].id : null })
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

      joinWorkspaceByCode: async (code) => {
        const { data, error } = await supabase.rpc('join_workspace_by_code', {
          p_code: code.trim().toUpperCase(),
        })
        if (error) throw new Error(error.message || 'Beitritt fehlgeschlagen')
        await get().loadWorkspaces()
        if (typeof data === 'string') set({ activeWorkspaceId: data })
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
      setOnline: (online) => set({ isOnline: online }),

      getActiveWorkspaceId: () => get().activeWorkspaceId,
      isActiveWorkspaceShared: () => {
        const { workspaces, activeWorkspaceId } = get()
        return workspaces.find((w) => w.id === activeWorkspaceId)?.isShared ?? false
      },
    }),
    {
      name: 'focus-workspace-v1',
      partialize: (s) => ({ activeWorkspaceId: s.activeWorkspaceId }),
    }
  )
)
