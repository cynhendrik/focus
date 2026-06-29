import type { Customer } from '@/types/customer.types'
import type { Account } from '@/types/account.types'
import type { Todo } from '@/types/todo.types'
import type { Invoice, FinanceKpis } from '@/types/finance.types'
import type { Lead } from '@/types/lead.types'
import type { FollowUp } from '@/types/crm.types'
import type { Activity } from '@/types/pipeline.types'
import type { CalendarEvent } from '@/types/calendar.types'
import type { EmailHeader } from '@/types/mail.types'

export const TOUR_WS = 'tour-ws'
export const TOUR_CUSTOMER_ID = 'tour-cust-1'

// ── Datums-Helfer: relativ zu HEUTE ──────────────────────────────────────────
// Feste Datumswerte (z. B. Mai 2026) fielen bei laufender App aus „diesem Monat"
// und „heute fällig" → Dashboard-Umsatz/Tagesplan blieben leer. Darum alle
// datums-abhängigen Felder relativ zum echten Datum (beim Laden des Moduls).
const NOW = new Date()
const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const shift = (days: number) => { const d = new Date(NOW); d.setDate(d.getDate() + days); return d }
const dayBefore = (days: number) => ymd(shift(-days))
const isoAt = (days: number, hour: number) => { const d = shift(days); d.setHours(hour, 0, 0, 0); return d.toISOString() }
const atToday = (hour: number, min = 0) => { const d = new Date(NOW); d.setHours(hour, min, 0, 0); return d.toISOString() }
const nowShift = (mins: number) => { const d = new Date(NOW); d.setMinutes(d.getMinutes() + mins); return d.toISOString() }

const TODAY = ymd(NOW)
// Bezahlte Demo-Rechnung auf HEUTE → immer in der laufenden Woche UND im laufenden Monat,
// damit der Dashboard-Umsatz (Default = Woche) gefüllt ist (nicht 0 / -100%).
const PAID_LAST_MONTH = ymd(new Date(NOW.getFullYear(), NOW.getMonth() - 1, 15))
const TS = isoAt(-25, 9)                          // generische created/updated-Zeit (vor ~25 Tagen)

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
  // Heute fällig → erscheint im Tagesplan und in „Heute fällig".
  { id: 'tour-todo-1', title: 'Angebot für Bergmann finalisieren', status: 'open', priority: 'p1', bucket: 'today',
    checklist: [], tags: [], createdAt: TS, updatedAt: TS, customerId: TOUR_CUSTOMER_ID,
    dueDate: TODAY, scheduledAt: isoAt(0, 14) },
  { id: 'tour-todo-2', title: 'Rechnung Nordlicht nachfassen', status: 'open', priority: 'p2', bucket: 'backlog',
    checklist: [], tags: [], createdAt: TS, updatedAt: TS, customerId: 'tour-cust-2', dueDate: dayBefore(9) },
  { id: 'tour-todo-4', title: 'Rückruf Frau Dr. Klein', status: 'open', priority: 'p2', bucket: 'today',
    checklist: [], tags: [], createdAt: TS, updatedAt: TS, customerId: 'tour-cust-3', dueDate: TODAY },
  { id: 'tour-todo-3', title: 'Kickoff-Notizen verschickt', status: 'done', priority: 'p3', bucket: 'done',
    checklist: [], tags: [], createdAt: TS, updatedAt: TS, customerId: TOUR_CUSTOMER_ID },
]

const baseInv = {
  workspaceId: TOUR_WS, createdBy: 'tour-user', taxMode: 'standard' as const, bankInfo: '',
  isSuggestion: false, pendingSync: false, createdAt: TS, updatedAt: TS,
}

export const tourInvoices: Invoice[] = [
  // Bezahlt heute → Dashboard-Umsatz (Default: diese Woche) gefüllt.
  { ...baseInv, id: 'tour-inv-1', accountId: TOUR_CUSTOMER_ID, number: 'RE-001',
    date: TODAY, dueDate: dayBefore(-10), status: 'paid', subtotal: 3000, taxAmount: 570, total: 3570 },
  // Bezahlt im Vormonat → liefert den „vs Vormonat"-Vergleich.
  { ...baseInv, id: 'tour-inv-3', accountId: TOUR_CUSTOMER_ID, number: 'RE-000',
    date: PAID_LAST_MONTH, dueDate: PAID_LAST_MONTH, status: 'paid', subtotal: 2000, taxAmount: 380, total: 2380 },
  // Überfällig → Mahnwesen leuchtet.
  { ...baseInv, id: 'tour-inv-2', accountId: 'tour-cust-2', number: 'RE-002',
    date: dayBefore(40), dueDate: dayBefore(26), status: 'overdue', subtotal: 1200, taxAmount: 228, total: 1428 },
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
    dueDate: TODAY, status: 'offen', priority: 'high', createdAt: TS },
]

export const tourActivities: Activity[] = [
  { id: 'tour-act-1', workspaceId: TOUR_WS, createdBy: 'tour-user', accountId: TOUR_CUSTOMER_ID,
    customerId: TOUR_CUSTOMER_ID, type: 'note', status: 'done', title: 'Kickoff-Call',
    body: 'Projekt-Scope besprochen, Angebot zugesagt.', createdAt: TS, updatedAt: TS },
  { id: 'tour-act-2', workspaceId: TOUR_WS, createdBy: 'tour-user', accountId: TOUR_CUSTOMER_ID,
    customerId: TOUR_CUSTOMER_ID, type: 'task', status: 'open', title: 'Angebot finalisieren',
    dueAt: isoAt(0, 14), createdAt: TS, updatedAt: TS },
]

// Kalender-Termine HEUTE → füllen „Mein Tagesplan" mit Uhrzeiten; einer läuft gerade („Jetzt").
const baseEvent = { workspaceId: TOUR_WS, createdBy: 'tour-user', allDay: false, createdAt: TS, updatedAt: TS }
export const tourCalendarEvents: CalendarEvent[] = [
  { ...baseEvent, id: 'tour-ev-1', title: 'Team-Standup', startAt: atToday(9, 0), endAt: atToday(9, 15), location: 'Video' },
  { ...baseEvent, id: 'tour-ev-2', title: 'Call mit Bergmann Design', accountId: TOUR_CUSTOMER_ID,
    startAt: nowShift(-20), endAt: nowShift(40), location: 'Google Meet' },
  { ...baseEvent, id: 'tour-ev-3', title: 'Angebot-Review Nordlicht', accountId: 'tour-cust-2',
    startAt: atToday(16, 0), endAt: atToday(17, 0), location: 'Büro' },
]

// Demo-Mails für die Inbox-Karte auf dem Dashboard (ungelesen oben).
const TOUR_MAIL_ACCOUNT = 'tour-mail-acc'
export const tourEmails: EmailHeader[] = [
  { id: 'tour-mail-1', accountId: TOUR_MAIL_ACCOUNT, uid: 1, folder: 'INBOX',
    subject: 'Re: Angebot – kurze Rückfrage', fromAddr: 'kontakt@bergmann.example', fromName: 'Lena Bergmann',
    toAddrs: ['ich@example.com'], sentAt: nowShift(-45), isRead: false, customerId: TOUR_CUSTOMER_ID, notALead: false },
  { id: 'tour-mail-2', accountId: TOUR_MAIL_ACCOUNT, uid: 2, folder: 'INBOX',
    subject: 'Anfrage: Website-Relaunch', fromAddr: 'voss@example.com', fromName: 'Studio Voss',
    toAddrs: ['ich@example.com'], sentAt: nowShift(-180), isRead: false, customerId: null, notALead: false },
  { id: 'tour-mail-3', accountId: TOUR_MAIL_ACCOUNT, uid: 3, folder: 'INBOX',
    subject: 'Rechnung erhalten – danke!', fromAddr: 'hallo@nordlicht.example', fromName: 'Nordlicht Studios',
    toAddrs: ['ich@example.com'], sentAt: atToday(8, 30), isRead: true, customerId: 'tour-cust-2', notALead: false },
]

export const TOUR_MAIL_ACCOUNT_ID = TOUR_MAIL_ACCOUNT
