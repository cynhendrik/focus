import { invoke } from '@tauri-apps/api/core'
import type { Customer, UpsertCustomerPayload } from '@/types/customer.types'
import type { Account } from '@/types/account.types'

function accountToCustomer(a: Account): Customer {
  return {
    id: a.id,
    name: a.name,
    company: a.kind === 'company' ? a.name : undefined,
    status: (a.status === 'prospect' ? 'lead' : a.status === 'churned' ? 'lost' : a.status) as Customer['status'],
    priority: (a.priority === 'vip' ? 'high' : a.priority) as Customer['priority'],
    tags: a.tags,
    isPrivate: a.isPrivate,
    workspaceId: a.workspaceId,
    industry: a.industry,
    goals: a.goals,
    socialLinks: a.socialLinks,
    internalNotes: a.internalNotes,
    street: a.street,
    zip: a.zip,
    city: a.city,
    country: a.country,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }
}

export const CustomerService = {
  getAll(workspaceId: string): Promise<Customer[]> {
    return invoke<Account[]>('get_accounts', { workspaceId }).then(list => list.map(accountToCustomer))
  },

  upsert(payload: UpsertCustomerPayload): Promise<Customer> {
    const accountPayload = {
      id: payload.id,
      workspaceId: payload.workspaceId,
      createdBy: payload.createdBy,
      name: payload.name,
      kind: payload.company ? 'company' : 'individual',
      industry: payload.industry,
      status: payload.status === 'lead' ? 'prospect' : payload.status === 'lost' ? 'churned' : payload.status,
      priority: payload.priority,
      tags: payload.tags,
      goals: payload.goals,
      internalNotes: payload.internalNotes,
      socialLinks: payload.socialLinks,
      street: payload.street,
      zip: payload.zip,
      city: payload.city,
      country: payload.country,
    }
    return invoke<Account>('upsert_account', { payload: accountPayload }).then(accountToCustomer)
  },

  delete(id: string, workspaceId: string): Promise<void> {
    return invoke<void>('delete_account', { id, workspaceId })
  },
}
