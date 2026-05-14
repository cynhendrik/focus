import { invoke } from '@tauri-apps/api/core'
import type { Customer, UpsertCustomerPayload } from '@/types/customer.types'

export const CustomerService = {
  getAll(workspaceId: string): Promise<Customer[]> {
    return invoke<Customer[]>('get_customers', { workspaceId })
  },

  upsert(payload: UpsertCustomerPayload): Promise<Customer> {
    return invoke<Customer>('upsert_customer', { payload })
  },

  delete(id: string, workspaceId: string): Promise<void> {
    return invoke<void>('delete_customer', { id, workspaceId })
  },
}
