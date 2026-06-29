import { create } from 'zustand'
import { ContactsGateway } from '@/data/contacts.gateway'
import { useWorkspaceStore } from './workspace.store'
import { useAuthStore } from './auth.store'
import { log } from '@/lib/logger'
import type { Contact, UpsertContactPayload } from '@/types/contact.types'

interface ContactsState {
  contacts: Contact[]
  currentAccountId: string | null
  isLoading: boolean
  loadByAccount: (accountId: string) => Promise<void>
  upsert: (payload: Omit<UpsertContactPayload, 'workspaceId' | 'createdBy'>) => Promise<Contact>
  remove: (id: string) => Promise<void>
}

export const useContactsStore = create<ContactsState>()((set) => ({
  contacts: [],
  currentAccountId: null,
  isLoading: false,

  loadByAccount: async (accountId) => {
    set({ isLoading: true, currentAccountId: accountId })
    try {
      const contacts = await ContactsGateway.getByAccount(accountId)
      set({ contacts, isLoading: false })
    } catch (err) {
      // Vorher still verschluckt → Nutzer sah leere Kontaktliste statt Fehler.
      log.error('Kontakte konnten nicht geladen werden', { accountId, err })
      set({ isLoading: false })
    }
  },

  upsert: async (payload) => {
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    const createdBy = useAuthStore.getState().user?.id ?? ''
    const updated = await ContactsGateway.upsert({ ...payload, workspaceId, createdBy })
    set(s => {
      const idx = s.contacts.findIndex(c => c.id === updated.id)
      if (idx >= 0) { const next = [...s.contacts]; next[idx] = updated; return { contacts: next } }
      return { contacts: [...s.contacts, updated] }
    })
    return updated
  },

  remove: async (id) => {
    await ContactsGateway.delete(id)
    set(s => ({ contacts: s.contacts.filter(c => c.id !== id) }))
  },
}))
