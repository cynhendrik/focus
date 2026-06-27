import { create } from 'zustand'
import { ProfilesGateway } from '@/data/profiles.gateway'
import { WorkspaceMembersGateway } from '@/data/workspace-members.gateway'
import { useAuthStore } from '@/store/auth.store'
import { log } from '@/lib/logger'
import type { MemberProfile } from '@/types/profile.types'

interface MembersState {
  profiles:  Record<string, MemberProfile>
  memberIds: string[]
  ensureSelf: () => Promise<void>
  /** Eigenen Anzeigenamen setzen (Profil-UI / Erst-Login). Schreibt profiles +
   *  aktualisiert den lokalen Store sofort → überall (Chat, Mitglieder) sichtbar. */
  setMyDisplayName: (name: string) => Promise<void>
  load:       (workspaceId: string) => Promise<void>
  nameOf:     (userId: string) => string
  members:    () => MemberProfile[]
}

export const useMembersStore = create<MembersState>()((set, get) => ({
  profiles: {},
  memberIds: [],

  ensureSelf: async () => {
    const user = useAuthStore.getState().user
    if (!user) return
    const displayName =
      (user.user_metadata?.full_name as string | undefined)?.trim()
      || user.email?.split('@')[0]
      || 'Nutzer'
    try {
      await ProfilesGateway.ensureSelf({ id: user.id, displayName, email: user.email ?? null })
    } catch (err) {
      log.error('Failed to ensure own profile', { err })
    }
  },

  setMyDisplayName: async (name) => {
    const user = useAuthStore.getState().user
    if (!user) return
    const displayName = name.trim() || user.email?.split('@')[0] || 'Nutzer'
    await ProfilesGateway.ensureSelf({ id: user.id, displayName, email: user.email ?? null })
    set(s => ({ profiles: { ...s.profiles, [user.id]: { id: user.id, displayName, email: user.email ?? null } } }))
  },

  load: async (workspaceId) => {
    try {
      const members = await WorkspaceMembersGateway.list(workspaceId)
      const ids = members.map(m => m.userId)
      const list = await ProfilesGateway.listByIds(ids)
      const byId: Record<string, MemberProfile> = {}
      for (const p of list) byId[p.id] = p
      set({ profiles: byId, memberIds: ids })
    } catch (err) {
      log.error('Failed to load members', { err })
    }
  },

  // Fallback hält die UI lesbar, falls ein Profil (noch) nicht gelesen werden kann.
  nameOf: (userId) => get().profiles[userId]?.displayName || `Mitglied ${userId.slice(0, 8)}`,

  members: () => {
    const { profiles, memberIds } = get()
    return memberIds.map(id => profiles[id]).filter(Boolean) as MemberProfile[]
  },
}))
