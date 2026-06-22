import { create } from 'zustand'
import { AccountsGateway } from '@/data/accounts.gateway'
import { accountToCustomer, customerPayloadToAccountPayload } from '@/data/customers.mapper'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { useMailStore } from '@/store/mail.store'
import { log } from '@/lib/logger'
import type { Customer, UpsertCustomerPayload } from '@/types/customer.types'
import type { AppError } from '@/types/error.types'
import { toAppError } from '@/types/error.types'

interface CustomersState {
  customers: Customer[]
  isLoading: boolean
  error: AppError | null
  init: () => Promise<void>
  upsert: (payload: Omit<UpsertCustomerPayload, 'workspaceId' | 'createdBy'> & { id?: string }) => Promise<void>
  remove: (id: string) => Promise<void>
  setArchived: (id: string, archived: boolean) => Promise<void>
}

function upsertById(list: Customer[], updated: Customer): Customer[] {
  const idx = list.findIndex(c => c.id === updated.id)
  if (idx >= 0) {
    const next = [...list]
    next[idx] = updated
    return next
  }
  return [...list, updated]
}

function getWorkspaceId(): string {
  return useWorkspaceStore.getState().activeWorkspaceId ?? ''
}

function getCreatedBy(): string {
  return useAuthStore.getState().user?.id ?? ''
}

/**
 * Mail↔Kunde-Zuordnungen gegen die übergebene (aktiver-Workspace-)Kundenliste neu
 * bewerten. Fire-and-forget — blockiert nie das Laden/Speichern. Wird beim Laden
 * (init) UND bei Kundenänderungen ausgelöst, damit die lokalen Postfächer immer am
 * aktiven Workspace ausgerichtet sind (kein Matching gegen fremde Workspaces).
 */
function rematchMail(customers: Customer[]): void {
  const refs = customers.map(c => ({ id: c.id, email: c.email ?? null }))
  void useMailStore.getState().rematchCustomers(JSON.stringify(refs)).catch(() => {})
}

export const useCustomersStore = create<CustomersState>()((set) => ({
  customers: [],
  isLoading: false,
  error: null,

  init: async () => {
    const workspaceId = getWorkspaceId()
    set({ isLoading: true, error: null })
    try {
      const accounts = await AccountsGateway.getAccounts(workspaceId)
      const customers = accounts.map(accountToCustomer)
      set({ customers, isLoading: false })
      log.info('Customers loaded', { count: customers.length })
      rematchMail(customers)
    } catch (err) {
      const error = toAppError(err)
      set({ isLoading: false, error })
      log.error('Failed to load customers', { error })
    }
  },

  upsert: async (payload) => {
    const workspaceId = getWorkspaceId()
    const createdBy = getCreatedBy()
    try {
      const account = await AccountsGateway.upsertAccount(
        customerPayloadToAccountPayload({ ...payload, workspaceId, createdBy }),
      )
      const updated = accountToCustomer(account)
      set(s => ({ customers: upsertById(s.customers, updated) }))
      // Kunde angelegt/geändert → Mail-Zuordnungen neu bewerten (auch beim Entfernen
      // der E-Mail, damit alte Zuordnungen wieder abfallen).
      rematchMail(useCustomersStore.getState().customers)
    } catch (err) {
      const error = toAppError(err)
      set({ error })
      log.error('Failed to upsert customer', { error })
      throw err
    }
  },

  remove: async (id) => {
    const workspaceId = getWorkspaceId()
    try {
      await AccountsGateway.deleteAccount(id, workspaceId)
      set(s => ({ customers: s.customers.filter(c => c.id !== id) }))
      // Gelöschter Kunde → seine Mail-Zuordnungen fallen ab.
      rematchMail(useCustomersStore.getState().customers)
    } catch (err) {
      const error = toAppError(err)
      set({ error })
      log.error('Failed to delete customer', { id, error })
      throw err
    }
  },

  setArchived: async (id, archived) => {
    try {
      const account = await AccountsGateway.setArchived(id, archived)
      const updated = accountToCustomer(account)
      set(s => ({ customers: upsertById(s.customers, updated) }))
    } catch (err) {
      const error = toAppError(err)
      set({ error })
      log.error('Failed to (un)archive customer', { id, archived, error })
      throw err
    }
  },
}))
