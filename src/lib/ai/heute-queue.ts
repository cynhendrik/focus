import { invoke } from '@tauri-apps/api/core'
import { getApiKey, getModel, MissingApiKeyError } from './briefing'
import { buildCorraIntelligenceContext } from './corra-intelligence'
import type { CorraContextInput } from './corra-intelligence'
import type { Invoice } from '@/types/finance.types'
import type { Todo } from '@/types/todo.types'
import type { EmailHeader } from '@/types/mail.types'

export type HeuteItemType = 'invoice_reminder' | 'mail_reply' | 'todo' | 'followup'

export interface HeuteQueueItem {
  type: HeuteItemType
  id: string
  reason: string
}

export const CORRA_HEUTE_SYSTEM = `Du bist KORA, persönlicher Assistent in Cynera (CRM für Berater).

Erstelle eine priorisierte Aufgabenliste für heute. Reihenfolge:
1. Mahnwesen — Rechnungen deren Fälligkeitsdatum vergangen ist UND nicht bezahlt/storniert (status != paid/cancelled/draft), sortiert nach Betrag × Tage überfällig
2. Kunden-Mails — nach Wartezeit
3. Todos — nach Priorität (p1 zuerst)

Antworte AUSSCHLIESSLICH als JSON-Array, kein Text davor oder danach:
[
  { "type": "invoice_reminder", "id": "EXAKTE_ID", "reason": "1 Satz warum jetzt" },
  { "type": "mail_reply",       "id": "EXAKTE_ID", "reason": "1 Satz warum jetzt" },
  { "type": "todo",             "id": "EXAKTE_ID", "reason": "1 Satz warum jetzt" },
  { "type": "followup",        "id": "EXAKTE_ID", "reason": "1 Satz warum jetzt" }
]

Maximal 10 Einträge. IDs EXAKT aus dem Kontext (nach "ID:"). Nur Dinge die heute wichtig sind.`

export function parseHeuteQueue(raw: string): HeuteQueueItem[] {
  const trimmed = raw.trim()
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/s.exec(trimmed)
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : trimmed
  try {
    const parsed: unknown = JSON.parse(jsonStr)
    if (!Array.isArray(parsed)) return []
    const VALID_TYPES = new Set<string>(['invoice_reminder', 'mail_reply', 'todo', 'followup'])
    return parsed
      .filter((item): item is HeuteQueueItem =>
        item !== null &&
        typeof item === 'object' &&
        typeof (item as HeuteQueueItem).type === 'string' &&
        VALID_TYPES.has((item as HeuteQueueItem).type) &&
        typeof (item as HeuteQueueItem).id === 'string' &&
        typeof (item as HeuteQueueItem).reason === 'string'
      )
      .slice(0, 10)
  } catch {
    return []
  }
}

export function staticHeuteQueue(input: CorraContextInput): HeuteQueueItem[] {
  const items: HeuteQueueItem[] = []

  // 1. Überfällige Rechnungen — status='overdue' ODER Fälligkeitsdatum vergangen + nicht bezahlt/storniert
  const today = Date.now()
  const overdueInvoices = input.invoices
    .filter((i: Invoice) => {
      if (i.status === 'paid' || i.status === 'cancelled' || i.status === 'draft') return false
      const isPastDue = new Date(i.dueDate).getTime() < today
      return i.status === 'overdue' || isPastDue
    })
    .map((i: Invoice) => {
      const days = Math.max(0, Math.floor((today - new Date(i.dueDate).getTime()) / 86_400_000))
      return { invoice: i, score: i.total * days, days }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  for (const { invoice, days } of overdueInvoices) {
    items.push({
      type: 'invoice_reminder',
      id: invoice.id,
      reason: `Rechnung seit ${days} Tagen überfällig — ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(invoice.total)}.`,
    })
  }

  // 2. Unread customer mails — oldest first
  const unreadMails = input.emails
    .filter((e: EmailHeader) => !e.isRead && e.customerId != null)
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt))
    .slice(0, 3)

  for (const mail of unreadMails) {
    items.push({
      type: 'mail_reply',
      id: mail.id,
      reason: `Unbeantwortet seit ${new Date(mail.sentAt).toLocaleDateString('de-DE')}.`,
    })
  }

  // 3. Today's todos — p1 first, then p2+
  const todayTodos = input.todos
    .filter((t: Todo) =>
      t.status !== 'done' &&
      (t.bucket === 'today' || t.bucket === 'in_progress')
    )
    .sort((a, b) => {
      const prio = { p1: 0, p2: 1, p3: 2, p4: 3 }
      return (prio[a.priority] ?? 9) - (prio[b.priority] ?? 9)
    })
    .slice(0, 5)

  for (const todo of todayTodos) {
    const type: HeuteItemType =
      todo.actionType === 'reply_mail' || todo.actionType === 'write_email' ? 'mail_reply' :
      todo.actionType === 'followup' ? 'followup' :
      'todo'
    items.push({
      type,
      id: todo.id,
      reason: todo.aiSummary ?? `Priorität ${todo.priority.toUpperCase()} — heute fällig.`,
    })
  }

  return items.slice(0, 10)
}

interface AnthropicTextBlock { type: 'text'; text: string }
interface AnthropicResponse  { content: Array<AnthropicTextBlock | { type: string }> }

export async function fetchHeuteQueue(input: CorraContextInput): Promise<HeuteQueueItem[]> {
  const apiKey = getApiKey()
  if (!apiKey) throw new MissingApiKeyError()

  const ctx = buildCorraIntelligenceContext(input)

  const response = await invoke<AnthropicResponse>('cmd_anthropic_messages', {
    apiKey,
    body: {
      model: getModel(),
      max_tokens: 512,
      system: [
        { type: 'text', text: `${CORRA_HEUTE_SYSTEM}\n\n--- AKTUELLE DATEN ---\n${ctx}`, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: 'Erstelle die Aufgabenliste für heute.' }],
    },
  })

  const block = response.content.find((b): b is AnthropicTextBlock => b.type === 'text')
  const raw = block?.text.trim() ?? '[]'
  return parseHeuteQueue(raw)
}
