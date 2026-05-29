import Anthropic from '@anthropic-ai/sdk'
import type { Customer } from '@/types/customer.types'
import type { Todo } from '@/types/todo.types'
import type { CalendarEvent } from '@/types/calendar.types'
import type { Invoice } from '@/types/finance.types'
import type { Deal } from '@/types/pipeline.types'
import type { Activity } from '@/types/pipeline.types'
import type { EmailHeader } from '@/types/mail.types'
import type { FollowUp } from '@/types/crm.types'
import type { NoteEntry, NoteBook } from '@/store/notebook.store'

// ─────────────────────────────────────────────────────────────────────────────
// Public types — what the UI consumes

export type Tone = 'info' | 'ok' | 'warn' | 'bad'
export type Severity = 'info' | 'warning' | 'alert'

export interface BriefingHighlight {
  title: string
  text: string
  tone: Tone
}

export interface BriefingSignal {
  text: string
  severity: Severity
}

export interface BriefingNextStep {
  action: string
  reason: string
}

export interface CustomerBriefing {
  headline: string
  highlights: BriefingHighlight[]
  signals: BriefingSignal[]
  nextSteps: BriefingNextStep[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Dossier compiler — turns scattered store data into a readable text dossier
// for the model. Trimmed to recent items to keep prompts under cache size.

export interface DossierInput {
  customer: Customer
  notes: NoteEntry[]
  noteBooks: NoteBook[]
  todos: Todo[]
  events: CalendarEvent[]
  invoices: Invoice[]
  deals: Deal[]
  activities: Activity[]
  emails: EmailHeader[]
  followUps: FollowUp[]
}

const NOW = () => new Date()
const RECENT_DAYS = 90

function daysAgo(iso: string | undefined | null): number | null {
  if (!iso) return null
  return Math.floor((NOW().getTime() - new Date(iso).getTime()) / 86_400_000)
}

function relDay(iso: string): string {
  const d = daysAgo(iso)
  if (d === null) return ''
  if (d === 0) return 'heute'
  if (d === 1) return 'gestern'
  if (d < 7)  return `vor ${d} Tagen`
  if (d < 30) return `vor ${Math.floor(d / 7)} Wochen`
  return `vor ${Math.floor(d / 30)} Monaten`
}

function trimText(s: string | undefined | null, max = 280): string {
  if (!s) return ''
  const t = s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max) + '…' : t
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n)
}

/**
 * Builds the human-readable dossier the model will reason over. We keep it as
 * Markdown so the model has a clear structure to anchor on without having to
 * parse JSON. Sorted newest-first within each section.
 */
export function buildDossier(input: DossierInput): string {
  const { customer, notes, noteBooks, todos, events, invoices, deals, activities, emails, followUps } = input
  const now = NOW()
  const since = new Date(now.getTime() - RECENT_DAYS * 86_400_000)
  const sinceIso = since.toISOString()

  const lines: string[] = []

  // ── Header ────────────────────────────────────────────────────────────────
  lines.push(`# ${customer.name}`)
  const meta: string[] = []
  if (customer.company) meta.push(customer.company)
  meta.push(`Status: ${customer.status}`)
  meta.push(`Priorität: ${customer.priority}`)
  if (customer.industry) meta.push(`Branche: ${customer.industry}`)
  lines.push(meta.join(' · '))
  lines.push('')

  if (customer.goals && customer.goals.length) {
    lines.push(`Ziele: ${customer.goals.join(', ')}`)
  }
  if (customer.tags && customer.tags.length) {
    lines.push(`Tags: ${customer.tags.join(', ')}`)
  }
  if (customer.internalNotes) {
    lines.push(`Interne Notizen: ${trimText(customer.internalNotes)}`)
  }
  if (customer.email)   lines.push(`E-Mail: ${customer.email}`)
  if (customer.phone)   lines.push(`Telefon: ${customer.phone}`)
  if (customer.city)    lines.push(`Ort: ${[customer.zip, customer.city, customer.country].filter(Boolean).join(', ')}`)
  lines.push('')

  // ── Open deals ───────────────────────────────────────────────────────────
  const customerDeals = deals.filter(d => d.accountId === customer.id || (d as any).customerId === customer.id)
  if (customerDeals.length) {
    lines.push('## Deals')
    for (const d of customerDeals.slice(0, 10)) {
      const parts = [`- ${d.title}`, `Stage: ${d.stage}`]
      if (d.value) parts.push(`Wert: ${fmtMoney(d.value)}`)
      if (d.expectedClose) parts.push(`Erwarteter Abschluss: ${d.expectedClose.slice(0, 10)}`)
      if (d.probability !== undefined) parts.push(`Wahrscheinlichkeit: ${Math.round((d.probability ?? 0) * 100)}%`)
      lines.push(parts.join(' · '))
    }
    lines.push('')
  }

  // ── Invoices (recent + overdue) ──────────────────────────────────────────
  const customerInvoices = invoices.filter(i => i.accountId === customer.id)
  const relevantInvoices = customerInvoices
    .filter(i => i.status !== 'paid' || i.date > sinceIso)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10)
  if (relevantInvoices.length) {
    lines.push('## Rechnungen')
    for (const i of relevantInvoices) {
      const parts = [
        `- ${i.number ?? '(ohne Nummer)'}`,
        fmtMoney(i.total),
        `Status: ${i.status}`,
        `Datum: ${i.date.slice(0, 10)}`,
      ]
      if (i.status === 'overdue' || i.status === 'open') {
        parts.push(`Fällig: ${i.dueDate.slice(0, 10)}`)
      }
      lines.push(parts.join(' · '))
    }
    lines.push('')
  }

  // ── Calendar events (upcoming + last few past) ───────────────────────────
  const customerEvents = events
    .filter(e => e.endAt > sinceIso)
    .slice(0, 12)
  if (customerEvents.length) {
    lines.push('## Termine')
    for (const e of customerEvents) {
      lines.push(`- ${e.startAt.slice(0, 16).replace('T', ' ')} · ${e.title}${e.location ? ` (${e.location})` : ''}`)
    }
    lines.push('')
  }

  // ── Tasks ────────────────────────────────────────────────────────────────
  const customerTodos = todos
    .filter(t => t.customerId === customer.id)
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
    .slice(0, 15)
  if (customerTodos.length) {
    lines.push('## Aufgaben')
    for (const t of customerTodos) {
      const parts = [`- [${t.status === 'done' ? 'x' : ' '}] ${t.title}`]
      parts.push(`Priorität: ${t.priority}`)
      if (t.dueDate) parts.push(`Fällig: ${t.dueDate.slice(0, 10)} (${relDay(t.dueDate)})`)
      lines.push(parts.join(' · '))
    }
    lines.push('')
  }

  // ── Follow-ups ───────────────────────────────────────────────────────────
  const customerFollowUps = followUps.filter(f => f.customerId === customer.id && f.status !== 'erledigt')
  if (customerFollowUps.length) {
    lines.push('## Offene Follow-Ups')
    for (const f of customerFollowUps.slice(0, 10)) {
      lines.push(`- ${f.title} · Fällig: ${f.dueDate.slice(0, 10)} (${relDay(f.dueDate)})`)
    }
    lines.push('')
  }

  // ── Notes (most recent, with content excerpts) ───────────────────────────
  const bookById = new Map(noteBooks.map(b => [b.id, b]))
  const customerNotes = notes
    .filter(n => n.customerId === customer.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 15)
  if (customerNotes.length) {
    lines.push('## Notizen')
    for (const n of customerNotes) {
      const book = bookById.get(n.bookId)
      const bookName = book ? book.name : 'Allgemein'
      lines.push(`### ${bookName} · ${n.title || '(ohne Titel)'} · ${relDay(n.updatedAt)}`)
      const excerpt = trimText(n.content, 500)
      if (excerpt) lines.push(excerpt)
    }
    lines.push('')
  }

  // ── Recent activities ────────────────────────────────────────────────────
  const customerActivities = activities
    .filter(a => a.accountId === customer.id)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, 12)
  if (customerActivities.length) {
    lines.push('## Aktivitäten')
    for (const a of customerActivities) {
      const parts = [`- ${a.type}`, relDay(a.createdAt ?? '')]
      if (a.title) parts.push(a.title)
      if (a.body)  parts.push(trimText(a.body, 200))
      lines.push(parts.join(' · '))
    }
    lines.push('')
  }

  // ── Recent emails ────────────────────────────────────────────────────────
  const customerEmails = emails
    .filter(e => e.customerId === customer.id)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
    .slice(0, 15)
  if (customerEmails.length) {
    lines.push('## E-Mails')
    for (const e of customerEmails) {
      lines.push(`- ${e.sentAt.slice(0, 10)} · ${e.fromName || e.fromAddr} → ${e.subject || '(ohne Betreff)'}${e.isRead ? '' : ' [ungelesen]'}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt — stable, cached. Changes here invalidate the prompt cache,
// so keep it deterministic and avoid timestamps / per-request strings.

const SYSTEM_PROMPT = `Du bist ein erfahrener Berater-Assistent für eine deutschsprachige Beratungs- und Agentur-Plattform. Deine Aufgabe: Aus einem Kunden-Dossier ein präzises, handlungsorientiertes Briefing erstellen — das was der Berater in 30 Sekunden vor dem nächsten Call wissen muss.

Regeln:
- Antworte ausschließlich auf Deutsch.
- Beziehe dich NUR auf Fakten aus dem Dossier. Keine Spekulation, keine Erfindung.
- Sei knapp und konkret. Berater haben keine Zeit für Floskeln.
- Verwende das Du in nextSteps (Direktansprache an den Berater).
- Vermeide Beraterdeutsch ("Synergien heben", "Touchpoints", "Stakeholder-Alignment"). Klartext.

Struktur deines Output:

headline (2-3 Sätze):
Status des Kunden + wichtigster offener Punkt + nächster konkreter Touchpoint, falls vorhanden.
Beispiel: "Müller AG ist aktiv. Letzter Kontakt vor 2 Tagen vom CFO. Offenes Angebot über €48k läuft am 02.06 aus."

highlights (3-5 Items):
Die wichtigsten Fakten aus dem Dossier. Jeder Highlight hat einen kurzen Titel (3-6 Wörter), einen erklärenden Text (1 Satz) und einen tone:
- "info" = neutraler Fakt
- "ok"   = positiv (Deal gewonnen, schnelle Antworten, ...)
- "warn" = Aufmerksamkeit nötig (lange keine Antwort, Angebot läuft aus, ...)
- "bad"  = dringend (überfällige Rechnung, verlorener Deal, ...)

signals (0-4 Items):
Datengetriebene Warnsignale aus Mustern (z.B. "Antwortzeit hat sich verschlechtert"). Nur wenn das Dossier konkrete Hinweise liefert. severity:
- "info"    = Beobachtung
- "warning" = sollte beachtet werden
- "alert"   = dringend

nextSteps (3-5 Items):
Konkrete nächste Aktionen für den Berater. Jeder Step hat eine action (was zu tun ist, im Imperativ) und reason (warum, in 1 Satz). Beispiel:
{"action": "CFO Schmidt zum Angebot nachfassen", "reason": "Angebot wurde vor 6 Tagen verschickt, läuft in 3 Tagen aus"}

Wenn das Dossier sehr dünn ist (kaum Daten), sag das ehrlich in der headline und schlage in nextSteps vor, was zu erfassen wäre.`

// ─────────────────────────────────────────────────────────────────────────────
// JSON schema for structured output — exactly matches CustomerBriefing

const BRIEFING_SCHEMA = {
  type: 'object',
  properties: {
    headline: {
      type: 'string',
      description: '2-3 Sätze Statuszusammenfassung',
    },
    highlights: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Kurze Headline 3-6 Wörter' },
          text:  { type: 'string', description: 'Erklärender Satz' },
          tone:  { type: 'string', enum: ['info', 'ok', 'warn', 'bad'] },
        },
        required: ['title', 'text', 'tone'],
        additionalProperties: false,
      },
    },
    signals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text:     { type: 'string' },
          severity: { type: 'string', enum: ['info', 'warning', 'alert'] },
        },
        required: ['text', 'severity'],
        additionalProperties: false,
      },
    },
    nextSteps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'Imperativ, was zu tun ist' },
          reason: { type: 'string', description: 'Warum, in einem Satz' },
        },
        required: ['action', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['headline', 'highlights', 'signals', 'nextSteps'],
  additionalProperties: false,
} as const

// ─────────────────────────────────────────────────────────────────────────────
// API key helpers — kept simple. Tauri desktop app, single user per machine,
// so localStorage is an acceptable trust boundary.

const API_KEY_STORAGE = 'cynera:anthropic-api-key:v1'
const MODEL_STORAGE   = 'cynera:anthropic-model:v1'

export function getApiKey(): string | null {
  try { return localStorage.getItem(API_KEY_STORAGE) } catch { return null }
}

export function setApiKey(key: string): void {
  try { localStorage.setItem(API_KEY_STORAGE, key.trim()) } catch {}
}

export function clearApiKey(): void {
  try { localStorage.removeItem(API_KEY_STORAGE) } catch {}
}

export function getModel(): string {
  try { return localStorage.getItem(MODEL_STORAGE) || 'claude-sonnet-4-6' } catch { return 'claude-sonnet-4-6' }
}

export function setModel(model: string): void {
  try { localStorage.setItem(MODEL_STORAGE, model) } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors

export class MissingApiKeyError extends Error {
  constructor() {
    super('Kein API-Key konfiguriert. Bitte in den Einstellungen hinterlegen.')
    this.name = 'MissingApiKeyError'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The main call

/**
 * Sends the customer dossier to Claude and returns a structured briefing.
 *
 * Uses prompt caching on the system prompt — repeated briefings for any
 * customer reuse the same cached prefix, slashing cost on the second+ call.
 * The dossier (volatile) goes in the user message after the cache breakpoint.
 *
 * Structured output via `output_config.format` guarantees the response shape
 * matches CustomerBriefing.
 */
export async function generateBriefing(input: DossierInput): Promise<CustomerBriefing> {
  const apiKey = getApiKey()
  if (!apiKey) throw new MissingApiKeyError()

  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  })

  const dossier = buildDossier(input)

  const message = await client.messages.create({
    model: getModel(),
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    output_config: {
      format: {
        type: 'json_schema',
        schema: BRIEFING_SCHEMA as unknown as Record<string, unknown>,
      },
    } as any,
    messages: [
      {
        role: 'user',
        content: `Erstelle das Briefing für diesen Kunden.\n\n---\n\n${dossier}`,
      },
    ],
  })

  const block = message.content.find(b => b.type === 'text')
  if (!block || block.type !== 'text') {
    throw new Error('Claude hat keinen Text-Output geliefert.')
  }

  let parsed: CustomerBriefing
  try {
    parsed = JSON.parse(block.text) as CustomerBriefing
  } catch (e) {
    throw new Error(`Antwort konnte nicht als JSON gelesen werden: ${String(e)}`)
  }

  // Defensive defaults — schema should guarantee these but belt-and-braces
  if (!parsed.headline)   parsed.headline = ''
  if (!parsed.highlights) parsed.highlights = []
  if (!parsed.signals)    parsed.signals = []
  if (!parsed.nextSteps)  parsed.nextSteps = []

  return parsed
}
