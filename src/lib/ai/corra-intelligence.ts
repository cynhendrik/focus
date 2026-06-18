import type { Invoice } from '@/types/finance.types'
import type { Todo } from '@/types/todo.types'
import type { EmailHeader } from '@/types/mail.types'
import type { Deal } from '@/types/pipeline.types'
import type { CalendarEvent } from '@/types/calendar.types'
import type { Account } from '@/types/account.types'
import type { FollowUp } from '@/types/crm.types'
import type { Lead } from '@/types/lead.types'

// ─── Public Types ────────────────────────────────────────────────────────────

export interface CorraActionItem {
  type: 'invoice' | 'todo' | 'mail' | 'followup'
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
  /** Offene Follow-Ups über alle Leads & Kunden — damit KORA keinen vergisst. */
  followUps: FollowUp[]
  /** Alle Leads — für Namensauflösung und das Erkennen kalter Kontakte. */
  leads: Lead[]
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

  // Leads und Kunden sind beide Accounts — ein Follow-Up kann an beiden hängen.
  const accountName = (id: string) =>
    input.accounts.find(a => a.id === id)?.name ??
    input.leads.find(l => l.id === id)?.name ?? id

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

  // Offene Follow-Ups, die heute oder früher fällig sind — echte Versprechen,
  // die nicht untergehen dürfen. Sortiert nach Fälligkeit (älteste zuerst).
  const openFollowUps = input.followUps.filter(f => f.status === 'offen' && f.dueDate)
  const dueFollowUps = openFollowUps
    .filter(f => f.dueDate.slice(0, 10) <= todayStr)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 10)

  // Kalte Leads: kein offenes Follow-Up und seit >14 Tagen keine Aktivität —
  // genau die, die man sonst vergisst. Won/Lost ausgenommen.
  const leadIdsWithOpenFu = new Set(openFollowUps.map(f => f.customerId))
  const coldCutoff = new Date(today)
  coldCutoff.setDate(coldCutoff.getDate() - 14)
  const coldCutoffStr = coldCutoff.toISOString()
  const coldLeads = input.leads
    .filter(l =>
      l.pipelineStage !== 'won' &&
      l.pipelineStage !== 'lost' &&
      !leadIdsWithOpenFu.has(l.id) &&
      (!l.lastActivityAt || l.lastActivityAt < coldCutoffStr),
    )
    .sort((a, b) => (a.lastActivityAt ?? '0').localeCompare(b.lastActivityAt ?? '0'))
    .slice(0, 5)

  const lines: string[] = [
    `DATUM: ${today.toLocaleDateString('de-DE', {
      weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit',
    })}`,
    '',
  ]

  if (openTodos.length > 0) {
    lines.push('TODOS (HEUTE / ÜBERFÄLLIG / IN ARBEIT):')
    const sTodayTodo = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    for (const t of openTodos) {
      // Status datumsbasiert (Kalendertage lokal) — nicht nur nach Bucket.
      let prefix = '[HEUTE]'
      if (t.bucket === 'in_progress') {
        prefix = '[IN ARBEIT]'
      } else if (t.dueDate) {
        const dd = new Date(t.dueDate)
        const sDue = new Date(dd.getFullYear(), dd.getMonth(), dd.getDate())
        const days = Math.round((sTodayTodo.getTime() - sDue.getTime()) / 86_400_000)
        if (days > 0) prefix = `[ÜBERFÄLLIG ${days}T]`
      }
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

  if (dueFollowUps.length > 0) {
    lines.push('FOLLOW-UPS FÄLLIG:')
    const sToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    for (const f of dueFollowUps) {
      // Kalendertage lokal (nicht UTC-Floor) — sonst off-by-one in CEST.
      const dd = new Date(f.dueDate)
      const sDue = new Date(dd.getFullYear(), dd.getMonth(), dd.getDate())
      const days = Math.round((sToday.getTime() - sDue.getTime()) / 86_400_000)
      const prefix = days > 0 ? `[ÜBERFÄLLIG ${days}T]` : '[HEUTE]'
      lines.push(`- ${prefix} ${accountName(f.customerId)} · „${f.title}" · ID:${f.id}`)
    }
    lines.push('')
  }

  if (coldLeads.length > 0) {
    lines.push('LEADS OHNE FOLLOW-UP (KALT, >14 TAGE STILL):')
    for (const l of coldLeads) {
      const days = l.lastActivityAt
        ? Math.floor((today.getTime() - new Date(l.lastActivityAt).getTime()) / 86_400_000)
        : null
      const since = days != null ? `seit ${days} Tagen still` : 'noch nie kontaktiert'
      lines.push(`- ${l.name} · ${since} · ID:${l.id}`)
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

  if (
    openTodos.length === 0 && overdueInvoices.length === 0 && unreadEmails.length === 0 &&
    openDeals.length === 0 && todayEvents.length === 0 &&
    dueFollowUps.length === 0 && coldLeads.length === 0
  ) {
    lines.push('Keine offenen Aufgaben, Rechnungen, Follow-Ups oder Mails heute.')
  }

  return lines.join('\n').trim()
}

// ─── Response Parser ──────────────────────────────────────────────────────────

export function parseCorraResponse(raw: string): CorraIntelligenceResponse {
  const trimmed = raw.trim()

  // JSON kann als reiner Text, in einem ```json-Block (auch mit Prosa davor/danach)
  // oder eingebettet kommen. Wir sammeln Kandidaten und nehmen den ersten gültigen.
  const candidates: string[] = []
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)
  if (fence) candidates.push(fence[1].trim())
  candidates.push(trimmed)
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1))

  for (const c of candidates) {
    try {
      const parsed: unknown = JSON.parse(c)
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
    } catch { /* nächster Kandidat */ }
  }
  return { text: trimmed }
}

// ─── System Prompt ────────────────────────────────────────────────────────────

export const CORRA_INTELLIGENCE_SYSTEM = `Du bist KORA Intelligence, ein persönlicher KI-Assistent in Cultera (CRM-App für Berater).
Du hast Zugriff auf alle aktuellen Geschäftsdaten des Nutzers (Todos, Rechnungen, Mails, Deals, Kalender, Lead-Follow-Ups).

DEINE AUFGABE:
- Beantworte Fragen direkt und präzise mit echten Daten aus dem Kontext
- Erkenne actionable Items und schlage vor, sie im Fokus-Modus zu bearbeiten
- Erinnere aktiv an fällige Lead-Follow-Ups und kalte Leads — kein Kontakt darf untergehen

ANTWORT-FORMAT:
Wenn deine Antwort actionable Items enthält (Rechnungen, Mails, Todos die bearbeitet werden sollen), antworte AUSSCHLIESSLICH als rohes JSON-Objekt — KEIN Markdown, KEINE \`\`\`-Codeblöcke, KEIN Fließtext und keine Aufzählung davor oder danach. Nur das JSON:
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
- "followup" → fälliges Lead-Follow-Up → ID nach "ID:" im Kontext (aus FOLLOW-UPS FÄLLIG)

Wenn KEINE Aktionen nötig sind, antworte als normaler Text (kein JSON).

REGELN:
- Immer auf Deutsch
- Ton: direkt, kompetent, kein Berater-Speak
- Zahlen immer mit konkreten Werten (€, Tage, Namen)
- IDs EXAKT aus dem Kontext übernehmen (nach "ID:")
- Nur Daten aus dem Kontext — keine Erfindungen
- Du führst selbst KEINE Aktionen aus und legst nichts an, sendest oder erledigst nichts. Du SCHLÄGST Aktionen ausschließlich über das actions-Array vor — der Nutzer führt sie per Klick aus. Behaupte NIEMALS, etwas angelegt, erstellt, gesendet, beantwortet oder erledigt zu haben (kein "Ich habe … angelegt").
- Rechne Datums-/Wochentagsangaben NICHT selbst aus und erfinde KEINE Wochentage. Die Kontext-Marker "[HEUTE]" und "[ÜBERFÄLLIG XT]" (X = Tage überfällig) dienen nur deiner Orientierung — gib sie NIEMALS wörtlich aus (keine eckigen Klammern). Formuliere menschlich: "heute" bzw. "X Tage überfällig". Das gilt auch für das "urgency"-Feld der actions.
- Wenn der Nutzer nach offenen Aufgaben/Todos, Rechnungen, Follow-ups oder Mails fragt und es im Kontext welche gibt: gib sie IMMER als actions aus (JSON-Format) — nicht nur als Fließtext, auch bei nur einem Eintrag. Für ein bestehendes Todo: type "todo" mit der exakten ID aus dem Kontext.

WIDGET-FELD (optional, nur wenn inhaltlich passend):
Wenn deine Antwort primär Umsatz/Rechnungen/Finanzen zeigt → füge "widget": "revenue" ins JSON
Wenn deine Antwort Todos/Aufgaben zeigt → "widget": "todos"
Wenn deine Antwort Mails/Nachrichten zeigt → "widget": "mails"
Wenn deine Antwort Kalender/Termine/Woche zeigt → "widget": "week"
Wenn deine Antwort einen Tagesüberblick gibt (mehrere Kategorien) → "widget": "heute"
Bei reinen Text-Antworten (Erklärungen, Fragen) → kein "widget" Feld

ERSTER TURN:
Wenn der Kontext "[ERSTER_TURN]" enthält: Beginne deine Antwort IMMER mit einer kurzen Triage.
Zeige max. 3 der wichtigsten offenen Punkte als actions-Array.
Dann beantworte die eigentliche Frage des Nutzers.
Format: JSON mit text + actions (+ optional widget).`
