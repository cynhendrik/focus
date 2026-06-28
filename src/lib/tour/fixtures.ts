import type { Customer } from '@/types/customer.types'
import type { Account } from '@/types/account.types'
import type { Todo } from '@/types/todo.types'
import type { Invoice, FinanceKpis } from '@/types/finance.types'
import type { Lead } from '@/types/lead.types'
import type { FollowUp } from '@/types/crm.types'
import type { Activity } from '@/types/pipeline.types'

export const TOUR_WS = 'tour-ws'
export const TOUR_CUSTOMER_ID = 'tour-cust-1'

const TS = '2026-06-01T09:00:00.000Z'           // generische created/updated-Zeit

const baseCust = {
  tags: [] as string[], goals: [] as string[], isPrivate: false, workspaceId: TOUR_WS,
  socialLinks: '{}', leadScore: 0, scoreFactors: {} as Record<string, number>, archivedAt: null,
  createdAt: TS, updatedAt: TS,
}

export const tourCustomers: Customer[] = [
  { ...baseCust, id: TOUR_CUSTOMER_ID, name: 'Bergmann Design GmbH', status: 'aktiv', priority: 'high',
    company: 'Bergmann Design GmbH', email: 'kontakt@bergmann.example', industry: 'Agentur', city: 'München' },
  { ...baseCust, id: 'tour-cust-2', name: 'Nordlicht Studios', status: 'aktiv', priority: 'normal',
    company: 'Nordlicht Studios', email: 'hallo@nordlicht.example', industry: 'Film', city: 'Hamburg' },
  { ...baseCust, id: 'tour-cust-3', name: 'Frau Dr. Klein', status: 'aktiv', priority: 'normal',
    email: 'klein@example.com', city: 'Berlin' },
]

const baseAcc = {
  workspaceId: TOUR_WS, createdBy: 'tour-user', kind: 'company' as const, priority: 'normal' as const,
  tags: [] as string[], goals: [] as string[], isPrivate: false, socialLinks: '{}', leadScore: 0,
  scoreFactors: {} as Record<string, number>, createdAt: TS, updatedAt: TS,
}

export const tourAccounts: Account[] = [
  { ...baseAcc, id: TOUR_CUSTOMER_ID, name: 'Bergmann Design GmbH', status: 'aktiv', priority: 'high' },
  { ...baseAcc, id: 'tour-cust-2', name: 'Nordlicht Studios', status: 'aktiv' },
  { ...baseAcc, id: 'tour-cust-3', name: 'Frau Dr. Klein', kind: 'individual', status: 'aktiv' },
]

export const tourTodos: Todo[] = [
  { id: 'tour-todo-1', title: 'Angebot für Bergmann finalisieren', status: 'open', priority: 'p1', bucket: 'today',
    checklist: [], tags: [], createdAt: TS, updatedAt: TS, customerId: TOUR_CUSTOMER_ID,
    dueDate: '2026-06-28', scheduledAt: '2026-06-28T14:00:00.000Z' },
  { id: 'tour-todo-2', title: 'Rechnung Nordlicht nachfassen', status: 'open', priority: 'p2', bucket: 'backlog',
    checklist: [], tags: [], createdAt: TS, updatedAt: TS, customerId: 'tour-cust-2', dueDate: '2026-06-20' },
  { id: 'tour-todo-3', title: 'Kickoff-Notizen verschickt', status: 'done', priority: 'p3', bucket: 'done',
    checklist: [], tags: [], createdAt: TS, updatedAt: TS, customerId: TOUR_CUSTOMER_ID },
]

const baseInv = {
  workspaceId: TOUR_WS, createdBy: 'tour-user', taxMode: 'standard' as const, bankInfo: '',
  isSuggestion: false, pendingSync: false, createdAt: TS, updatedAt: TS,
}

export const tourInvoices: Invoice[] = [
  { ...baseInv, id: 'tour-inv-1', accountId: TOUR_CUSTOMER_ID, number: 'RE-2026-001',
    date: '2026-05-02', dueDate: '2026-05-16', status: 'paid', subtotal: 3000, taxAmount: 570, total: 3570 },
  { ...baseInv, id: 'tour-inv-2', accountId: 'tour-cust-2', number: 'RE-2026-002',
    date: '2026-05-20', dueDate: '2026-06-03', status: 'overdue', subtotal: 1200, taxAmount: 228, total: 1428 },
]

export const tourKpis: FinanceKpis = {
  monthRevenue: 3570, yearRevenue: 18420, openCount: 1, openTotal: 1428,
  overdueCount: 1, overdueTotal: 1428, suggestionCount: 0, topClients: [],
}

export const tourLeads: Lead[] = [
  { id: 'tour-lead-1', workspaceId: TOUR_WS, name: 'Studio Voss', accountType: 'lead',
    pipelineStage: 'inbox', leadStatus: 'neu', leadSource: 'website', engagementScore: 20,
    createdAt: TS, updatedAt: TS, email: 'voss@example.com', phone: null, leadSourceDetail: null,
    companyName: 'Studio Voss', linkedinUrl: null, lastActivityAt: null, nextFollowUpAt: null,
    reEngageDate: null, convertedAt: null },
  { id: 'tour-lead-2', workspaceId: TOUR_WS, name: 'Café Mira', accountType: 'lead',
    pipelineStage: 'replied', leadStatus: 'warm', leadSource: 'event', engagementScore: 55,
    createdAt: TS, updatedAt: TS, email: 'mira@example.com', phone: null, leadSourceDetail: null,
    companyName: 'Café Mira', linkedinUrl: null, lastActivityAt: null, nextFollowUpAt: null,
    reEngageDate: null, convertedAt: null },
]

export const tourFollowUps: FollowUp[] = [
  { id: 'tour-fu-1', customerId: TOUR_CUSTOMER_ID, title: 'Nach Angebot nachfassen',
    dueDate: '2026-06-30', status: 'offen', priority: 'high', createdAt: TS },
]

export const tourActivities: Activity[] = [
  { id: 'tour-act-1', workspaceId: TOUR_WS, createdBy: 'tour-user', accountId: TOUR_CUSTOMER_ID,
    customerId: TOUR_CUSTOMER_ID, type: 'note', status: 'done', title: 'Kickoff-Call',
    body: 'Projekt-Scope besprochen, Angebot zugesagt.', createdAt: TS, updatedAt: TS },
  { id: 'tour-act-2', workspaceId: TOUR_WS, createdBy: 'tour-user', accountId: TOUR_CUSTOMER_ID,
    customerId: TOUR_CUSTOMER_ID, type: 'task', status: 'open', title: 'Angebot finalisieren',
    dueAt: '2026-06-28T14:00:00.000Z', createdAt: TS, updatedAt: TS },
]
