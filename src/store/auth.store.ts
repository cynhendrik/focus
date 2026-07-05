import { create } from 'zustand'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspace.store'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  init: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  session: null,
  loading: true,

  init: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      set({ session, user: session?.user ?? null, loading: false })
    } catch {
      set({ loading: false })
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null })
    })
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  },

  signUp: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
  },

  signOut: async () => {
    // Lokale Workspaces VOR dem Logout sichern — sie sind geräte-scoped,
    // nicht account-scoped, und dürfen keinen Logout nicht überleben.
    const { localWorkspaces, activeWorkspaceId, workspaces } =
      useWorkspaceStore.getState()
    await supabase.auth.signOut()
    set({ user: null, session: null })
    // Cloud-Workspace-Liste leeren; lokale Workspaces explizit beibehalten.
    // War der aktive Workspace ein Cloud-Workspace, auf den ersten lokalen
    // Workspace wechseln (oder null, wenn kein lokaler existiert), damit
    // nach dem Re-Login kein ungültiger activeWorkspaceId im Store bleibt.
    const wasCloudActive = workspaces.some(w => w.id === activeWorkspaceId)
    useWorkspaceStore.setState({
      workspaces: [],
      localWorkspaces, // ← explizit beibehalten (verhindert persist-Überschreibung)
      ...(wasCloudActive
        ? { activeWorkspaceId: localWorkspaces[0]?.id ?? null }
        : {}),
    })
  },
}))
