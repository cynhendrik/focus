import type { Invoice } from '@/types/finance.types'
import type { Todo } from '@/types/todo.types'
import type { EmailHeader } from '@/types/mail.types'
import type { Deal } from '@/types/pipeline.types'
import type { CalendarEvent } from '@/types/calendar.types'
import type { Account } from '@/types/account.types'

// ─── Public Types ────────────────────────────────────────────────────────────

export interface CorraActionItem {
  type: 'invoice' | 'todo' | 'mail'
  id: string
  label: string
  detail: string
  urgency: string
}

export type CorraWidgetType = 'revenue' | 'todos' | 'mails' | 'week' | 'heute'

const VALID_WIDGETS = new Set<string>(['revenue', 'todos', 'mails', 'week', 'heute'])

export interface CorraIntelligenceResponse {
  text: string
  widget?: CorraWidgetType
  actions?: CorraActionItem[]
  focusCta?: string
}

export interface CorraMessage {
  id?: string           // stable key for AnimatePresence
  role: 'user' | 'assistant'
  text: string
  widget?: CorraWidgetType
  actions?: CorraActionItem[]
  focusCta?: string
}

export interface CorraContextInput {
  todos: Todo[]
  invoices: Invoice[]
  emails: EmailHeader[]
  deals: Deal[]
  calendarEvents: CalendarEvent[]
  accounts: Account[]
}

// ─── Context Builder ─────────────────────────────────────────────────────────

function formatEur(n: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n)
}

export function buildCorraIntelligenceContext(input: CorraContextInput): string {
  const today    = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  const accountName = (id: string) =>
    input.accounts.find(a => a.id === id)?.name ?? id

  const openTodos = input.todos
    .filter(t => t.status !== 'done' && (t.bucket === 'today' || t.bucket === 'in_progress' || t.status === 'in_progress'))
    .slice(0, 15)

  const overdueInvoices = input.invoices
    .filter(i => i.status === 'overdue')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 10)

  const unreadEmails = input.emails
    .filter(e => !e.isRead && e.customerId != null)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
    .slice(0, 10)

  const openDeals = input.deals
    .filter(d => d.stage !== 'won' && d.stage !== 'lost')
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 8)

  const todayEvents = input.calendarEvents
    .filter(e => e.startAt.startsWith(todayStr))
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(0, 5)

  const lines: string[] = [
    `DATUM: ${today.toLocaleDateString('de-DE', {
      weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit',
    })}`,
    '',
  ]

  if (openTodos.length > 0) {
    lines.push('TODOS HEUTE/IN ARBEIT:')
    for (const t of openTodos) {
      const prefix = t.bucket === 'in_progress' ? '[IN ARBEIT]' : '[HEUTE]'
      const cust   = t.customerId ? ` · ${accountName(t.customerId)}` : ''
      const type   = t.actionType ? ` (${t.actionType})` : ''
      lines.push(`- ${prefix} ${t.title}${cust}${type} · ID:${t.id}`)
    }
    lines.push('')
  }

  if (overdueInvoices.length > 0) {
    lines.push('RECHNUNGEN ÜBERFÄLLIG:')
    for (const inv of overdueInvoices) {
      const days = Math.floor(
        (today.getTime() - new Date(inv.dueDate).getTime()) / 86_400_000,
      )
      const num = inv.number ? ` · ${inv.number}` : ''
      lines.push(
        `- ${accountName(inv.accountId)}${num} · ${formatEur(inv.total)} · ${days} Tage · ID:${inv.id}`,
      )
    }
    lines.push('')
  }

  if (unreadEmails.length > 0) {
    lines.push('UNGELESENE KUNDEN-MAILS:')
    for (const m of unreadEmails) {
      const from = m.fromName ? `${m.fromName} <${m.fromAddr}>` : m.fromAddr
      lines.push(`- ${from} · ${m.subject} · ID:${m.id}`)
    }
    lines.push('')
  }

  if (openDeals.length > 0) {
    lines.push('OFFENE DEALS:')
    for (const d of openDeals) {
      const val = d.value != null ? ` · ${formatEur(d.value)}` : ''
      lines.push(`- ${d.title} · ${accountName(d.accountId)}${val} · ${d.stage}`)
    }
    lines.push('')
  }

  if (todayEvents.length > 0) {
    lines.push('KALENDER HEUTE:')
    for (const e of todayEvents) {
      lines.push(`- ${e.startAt.slice(11, 16)} ${e.title}`)
    }
    lines.push('')
  }

  if (openTodos.length === 0 && overdueInvoices.length === 0 && unreadEmails.length === 0 && openDeals.length === 0 && todayEvents.length === 0) {
    lines.push('Keine offenen Aufgaben, Rechnungen oder Mails heute.')
  }

  return lines.join('\n').trim()
}

// ─── Response Parser ──────────────────────────────────────────────────────────

export function parseCorraResponse(raw: string): CorraIntelligenceResponse {
  const trimmed = raw.trim()
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/s.exec(trimmed)
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : trimmed
  try {
    const parsed: unknown = JSON.parse(jsonStr)
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'text' in parsed &&
      typeof (parsed as { text: unknown }).text === 'string'
    ) {
      const p = parsed as { text: string; widget?: unknown; actions?: unknown; focusCta?: unknown }
      return {
        text:     p.text,
        widget:   typeof p.widget === 'string' && VALID_WIDGETS.has(p.widget)
                    ? p.widget as CorraWidgetType
                    : undefined,
        actions:  Array.isArray(p.actions) ? (p.actions as CorraActionItem[]) : undefined,
        focusCta: typeof p.focusCta === 'string' ? p.focusCta : undefined,
      }
    }
  } catch {}
  return { text: trimmed }
}

// ─── System Prompt ────────────────────────────────────────────────────────────

export const CORRA_INTELLIGENCE_SYSTEM = `Du bist KORA Intelligence, ein persönlicher KI-Assistent in Cynera (CRM-App für Berater).
Du hast Zugriff auf alle aktuellen Geschäftsdaten des Nutzers (Todos, Rechnungen, Mails, Deals, Kalender).

DEINE AUFGABE:
- Beantworte Fragen direkt und präzise mit echten Daten aus dem Kontext
- Erkenne actionable Items und schlage vor, sie im Fokus-Modus zu bearbeiten

ANTWORT-FORMAT:
Wenn deine Antwort actionable Items enthält (Rechnungen, Mails, Todos die bearbeitet werden sollen), antworte AUSSCHLIESSLICH als JSON — kein Text davor oder danach:
{
  "text": "Deine Antwort als Fließtext (2-4 Sätze)",
  "actions": [
    { "type": "invoice", "id": "EXAKTE_ID_AUS_KONTEXT", "label": "Firmenname", "detail": "RE-Nummer · €Betrag", "urgency": "X Tage" }
  ],
  "focusCta": "Kurzer Button-Text z.B. 'Alle 3 jetzt in Fokus bearbeiten'"
}

Typen für actions[].type:
- "invoice" → überfällige Rechnung → ID nach "ID:" im Kontext
- "mail" → ungelesene Kunden-Mail → ID nach "ID:" im Kontext
- "todo" → bestehendes Todo → ID nach "ID:" im Kontext

Wenn KEINE Aktionen nötig sind, antworte als normaler Text (kein JSON).

REGELN:
- Immer auf Deutsch
- Ton: direkt, kompetent, kein Berater-Speak
- Zahlen immer mit konkreten Werten (€, Tage, Namen)
- IDs EXAKT aus dem Kontext übernehmen (nach "ID:")
- Nur Daten aus dem Kontext — keine Erfindungen

WIDGET-FELD (optional, nur wenn inhaltlich passend):
Wenn deine Antwort primär Umsatz/Rechnungen/Finanzen zeigt → füge "widget": "revenue" ins JSON
Wenn deine Antwort Todos/Aufgaben zeigt → "widget": "todos"
Wenn deine Antwort Mails/Nachrichten zeigt → "widget": "mails"
Wenn deine Antwort Kalender/Termine/Woche zeigt → "widget": "week"
Wenn deine Antwort einen Tagesüberblick gibt (mehrere Kategorien) → "widget": "heute"
Bei reinen Text-Antworten (Erklärungen, Fragen) → kein "widget" Feld`
