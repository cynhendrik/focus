import { create } from 'zustand'
import { CustomerService } from '@/services/customer.service'
import { log } from '@/lib/logger'
import type { Customer, UpsertCustomerPayload } from '@/types/customer.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface CustomersState {
  customers: Customer[]
  isLoading: boolean
  error: AppError | null
  init: () => Promise<void>
  upsert: (payload: UpsertCustomerPayload) => Promise<void>
  remove: (id: string) => Promise<void>
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

export const useCustomersStore = create<CustomersState>()((set) => ({
  customers: [],
  isLoading: false,
  error: null,

  init: async () => {
    set({ isLoading: true, error: null })
    try {
      const customers = await CustomerService.getAll()
      set({ customers, isLoading: false })
      log.info('Customers loaded', { count: customers.length })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load customers', { error })
    }
  },

  upsert: async (payload) => {
    try {
      const updated = await CustomerService.upsert(payload)
      set(s => ({ customers: upsertById(s.customers, updated) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to upsert customer', { error })
      throw err
    }
  },

  remove: async (id) => {
    try {
      await CustomerService.delete(id)
      set(s => ({ customers: s.customers.filter(c => c.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to delete customer', { id, error })
      throw err
    }
  },
}))
