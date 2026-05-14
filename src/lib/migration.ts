import type { UpsertCustomerPayload } from '@/types/customer.types'

interface LegacyCustomer {
  id: string
  name: string
  company?: string
  email?: string
  phone?: string
  status?: string
  priority?: string
  tags?: string[]
}

interface LegacyStore {
  customers?: LegacyCustomer[]
}

export const LEGACY_KEY = 'cynera-os-v4'

export function detectLegacyData(): LegacyStore | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LegacyStore
    if (!parsed.customers?.length) return null
    return parsed
  } catch {
    return null
  }
}

export function buildImportPayloads(
  legacy: LegacyStore,
  workspaceId: string,
  createdBy: string,
): UpsertCustomerPayload[] {
  return (legacy.customers ?? []).map(c => ({
    name: c.name,
    company: c.company,
    email: c.email,
    phone: c.phone,
    status: normalizeStatus(c.status),
    priority: normalizePriority(c.priority),
    tags: c.tags ?? [],
    workspaceId,
    createdBy,
  }))
}

export function clearLegacyData(): void {
  localStorage.removeItem(LEGACY_KEY)
}

function normalizeStatus(s?: string): 'lead' | 'aktiv' | 'inaktiv' | 'lost' {
  if (s === 'aktiv' || s === 'inaktiv' || s === 'lead' || s === 'lost') return s
  return 'aktiv'
}

function normalizePriority(p?: string): 'low' | 'normal' | 'high' {
  if (p === 'low' || p === 'normal' || p === 'high') return p
  return 'normal'
}
