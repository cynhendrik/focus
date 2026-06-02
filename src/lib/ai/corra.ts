/**
 * CORRA — Focus-Mode draft generator.
 * Generates short, human, editable message drafts for Focus action cards.
 * Uses the same Rust backend (cmd_anthropic_messages) as the briefing system.
 */
import { invoke } from '@tauri-apps/api/core'
import { getApiKey, getModel, MissingApiKeyError } from './briefing'

export interface CorraReminderContext {
  kind: 'reminder'
  customerName: string
  invoiceNumber: string
  amount: number
  dueDate: string
  daysOverdue: number
  dunningLevel: number // 0 = Erinnerung, 1 = 1. Mahnung, 2 = 2. Mahnung
}

export interface CorraFollowUpContext {
  kind: 'followup'
  customerName: string
  contactName?: string
  topic?: string
  notes?: string
  daysAgo?: number
}

export interface CorraReplyMailContext {
  kind: 'reply_mail'
  customerName: string
  contactName?: string
  subject?: string
  notes?: string
}

export interface CorraInvoiceContext {
  kind: 'invoice'
  customerName: string
  invoiceNumber?: string
  amount: number
  dealTitle?: string
}

export type CorraContext =
  | CorraReminderContext
  | CorraFollowUpContext
  | CorraReplyMailContext
  | CorraInvoiceContext

function formatEur(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function buildUserPrompt(ctx: CorraContext): string {
  if (ctx.kind === 'reminder') {
    const level = ['Zahlungserinnerung', '1. Mahnung', '2. Mahnung'][ctx.dunningLevel] ?? '2. Mahnung'
    const tone  = ctx.dunningLevel === 0
      ? 'Freundlich und entspannt — kein Vorwurf, nur eine sanfte Erinnerung.'
      : ctx.dunningLevel === 1
      ? 'Bestimmt, aber noch freundlich. Klare Bitte um Zahlung bis zu einem Datum.'
      : 'Klar und ernst. Kein Drama, aber unmissverständlich: das muss jetzt geklärt werden.'

    return `Schreibe eine kurze ${level} per E-Mail an ${ctx.customerName}.
Rechnung: ${ctx.invoiceNumber} · ${formatEur(ctx.amount)} · fällig seit ${ctx.daysOverdue} Tagen (${ctx.dueDate.slice(0, 10)}).
Ton: ${tone}
Kein Betreff, nur der Fließtext. 2-4 Sätze. Kein "Sehr geehrte/r", kein formelles Grußwort.`
  }

  if (ctx.kind === 'followup') {
    const who  = ctx.contactName ? `${ctx.contactName} bei ${ctx.customerName}` : ctx.customerName
    const age  = ctx.daysAgo != null ? ` (letzter Kontakt vor ${ctx.daysAgo} Tagen)` : ''
    const about = ctx.topic ? ` zum Thema „${ctx.topic}"` : ''
    const extra = ctx.notes ? `\nKontext: ${ctx.notes}` : ''
    return `Schreibe eine kurze Follow-Up-Nachricht an ${who}${age}${about}.${extra}
Ton: locker, menschlich, kein Druck. Frag kurz wie es läuft oder ob es Neuigkeiten gibt.
Kein Betreff, nur der Fließtext. 2-3 Sätze.`
  }

  if (ctx.kind === 'reply_mail') {
    const who   = ctx.contactName ? `${ctx.contactName} (${ctx.customerName})` : ctx.customerName
    const subj  = ctx.subject ? ` Betreff war: „${ctx.subject}"` : ''
    const extra = ctx.notes ? `\nKontext: ${ctx.notes}` : ''
    return `Schreibe eine kurze Antwort-Mail an ${who}.${subj}${extra}
Ton: freundlich, direkt. Bestätige den Eingang und kündige an, dass du dich kümmerst oder fragst kurz nach Details.
Kein Betreff, nur der Fließtext. 2-3 Sätze.`
  }

  if (ctx.kind === 'invoice') {
    const deal  = ctx.dealTitle ? ` zum Deal „${ctx.dealTitle}"` : ''
    const num   = ctx.invoiceNumber ? ` (${ctx.invoiceNumber})` : ''
    return `Schreibe eine kurze Begleitmail für eine Rechnung${num} über ${formatEur(ctx.amount)}${deal} an ${ctx.customerName}.
Ton: professionell aber persönlich. Kurze Bestätigung, was berechnet wird, und Hinweis bei Fragen.
Kein Betreff, nur der Fließtext. 2-3 Sätze.`
  }

  return ''
}

const CORRA_SYSTEM = `Du bist CORRA, ein KI-Assistent in einer CRM-App für Berater und Agenturen.
Deine Aufgabe: kurze, editierbare Entwürfe für Aktionen im Fokus-Modus schreiben.

Regeln:
- Immer auf Deutsch.
- Ton: locker-professionell. Wie eine E-Mail an jemanden, den man gut kennt — aber trotzdem Geschäftskontakt.
- KEIN "Sehr geehrte/r", KEIN "Mit freundlichen Grüßen", KEINE Floskeln.
- Nur den Fließtext, keine Betreffzeile, keine Grußformel.
- 2-4 Sätze. Nicht kürzer, nicht länger.
- Der Nutzer wird den Text bearbeiten — gib ihm eine gute Basis.`

interface AnthropicTextBlock { type: 'text'; text: string }
interface AnthropicResponse  { content: Array<AnthropicTextBlock | { type: string }> }

export async function generateCorraDraft(ctx: CorraContext): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) throw new MissingApiKeyError()

  const userPrompt = buildUserPrompt(ctx)
  if (!userPrompt) return ''

  const response = await invoke<AnthropicResponse>('cmd_anthropic_messages', {
    apiKey,
    body: {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: [
        { type: 'text', text: CORRA_SYSTEM, cache_control: { type: 'ephemeral' } },
      ],
      messages: [
        { role: 'user', content: userPrompt },
      ],
    },
  })

  const block = response.content.find((b): b is AnthropicTextBlock => b.type === 'text')
  return block?.text.trim() ?? ''
}
