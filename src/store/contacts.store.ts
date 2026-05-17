import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { useWorkspaceStore } from './workspace.store'
import { useAuthStore } from './auth.store'
import type { Contact, UpsertContactPayload } from '@/types/contact.types'

interface ContactsState {
  contacts: Contact[]
  isLoading: boolean
  loadByAccount: (accountId: string) => Promise<void>
  upsert: (payload: Omit<UpsertContactPayload, 'workspaceId' | 'createdBy'>) => Promise<Contact>
  remove: (id: string) => Promise<void>
}

export const useContactsStore = create<ContactsState>()((set) => ({
  contacts: [],
  isLoading: false,

  loadByAccount: async (accountId) => {
    set({ isLoading: true })
    try {
      const contacts = await invoke<Contact[]>('get_contacts', { accountId })
      set({ contacts, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  upsert: async (payload) => {
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    const createdBy = useAuthStore.getState().user?.id ?? ''
    const updated = await invoke<Contact>('upsert_contact', { payload: { ...payload, workspaceId, createdBy } })
    set(s => {
      const idx = s.contacts.findIndex(c => c.id === updated.id)
      if (idx >= 0) { const next = [...s.contacts]; next[idx] = updated; return { contacts: next } }
      return { contacts: [...s.contacts, updated] }
    })
    return updated
  },

  remove: async (id) => {
    await invoke<void>('delete_contact', { id })
    set(s => ({ contacts: s.contacts.filter(c => c.id !== id) }))
  },
}))
