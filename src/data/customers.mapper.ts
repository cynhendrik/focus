import type { Account, UpsertAccountPayload, AccountStatus, AccountPriority } from '@/types/account.types'
import type { Customer, UpsertCustomerPayload } from '@/types/customer.types'

/** Account-Domänentyp → Customer-View. */
export function accountToCustomer(a: Account): Customer {
  return {
    id: a.id,
    name: a.name,
    company: a.kind === 'company' ? a.name : undefined,
    email: a.email,
    phone: a.phone,
    vatId: a.vatId,
    status: (a.status === 'prospect' ? 'lead' : a.status === 'churned' ? 'lost' : a.status) as Customer['status'],
    priority: (a.priority === 'vip' ? 'high' : a.priority) as Customer['priority'],
    tags: a.tags,
    isPrivate: a.isPrivate,
    workspaceId: a.workspaceId,
    industry: a.industry,
    goals: a.goals,
    socialLinks: a.socialLinks, // verbatim; Account.website wird bewusst nicht hier eingemischt
    internalNotes: a.internalNotes,
    street: a.street,
    zip: a.zip,
    city: a.city,
    country: a.country,
    leadScore: a.leadScore,
    scoreFactors: a.scoreFactors,
    // Hinweis: contactPerson hat kein Account-Äquivalent → wird hier nicht gesetzt.
    archivedAt: a.archivedAt ?? null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }
}

/** Customer-Upsert-Payload → Account-Upsert-Payload. */
export function customerPayloadToAccountPayload(p: UpsertCustomerPayload): UpsertAccountPayload {
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    createdBy: p.createdBy,
    name: p.name,
    kind: p.company ? 'company' : 'individual',
    industry: p.industry,
    status: (p.status === 'lead' ? 'prospect' : p.status === 'lost' ? 'churned' : p.status) as AccountStatus | undefined,
    priority: p.priority as AccountPriority | undefined,
    tags: p.tags,
    goals: p.goals,
    internalNotes: p.internalNotes,
    socialLinks: p.socialLinks,
    street: p.street,
    zip: p.zip,
    city: p.city,
    country: p.country,
    email: p.email,
    phone: p.phone,
    vatId: p.vatId,
  }
}
