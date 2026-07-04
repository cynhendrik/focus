/**
 * Deterministische Karten-Generierung für den Stapel — pure Funktionen, kein Store,
 * kein KI-Call. Scoring: Geld > Beziehung > Rechnungsentwurf > Aufgabe (Spec §6).
 */
import type { Invoice, Payment } from '@/types/finance.types'
import type { Todo } from '@/types/todo.types'
import type { FollowUp } from '@/types/crm.types'
import type { FollowUpQueueItem } from '@/types/follow-up-queue.types'
import type { CreatePreparedItem, PreparedItem } from '@/types/prepared-item.types'
import { dueReminders, reminderBreakdown } from '@/services/dunning.service'
import { mahnungBody, mahnungSubject, fmtEur, levelLabel, begleitmailBody } from '@/lib/templates/mahnung'
import { followupBody, followupSubject } from '@/lib/templates/followup'
import { isTodoForToday } from '@/lib/heute/due'

export interface GenerateInput {
  workspaceId: string
  invoices: Invoice[]
  todos: Todo[]
  followUps: FollowUp[]
  accounts: { id: string; name: string }[]
  leads: { id: string; name: string }[]
  payments: Payment[]
  fees: number[]
  suppressedRuleIds: string[]
  /** Fällige, offene Schritte der automatischen Follow-up-Sequenz (get_due). */
  queueItems: FollowUpQueueItem[]
  todayIso: string
}

function nameOf(input: GenerateInput, id: string): string {
  return input.leads.find(l => l.id === id)?.name
    ?? input.accounts.find(a => a.id === id)?.name ?? 'Kontakt'
}

function daysSince(dateIso: string, todayIso: string): number {
  const ms = new Date(todayIso + 'T12:00:00').getTime() - new Date(dateIso.slice(0, 10) + 'T12:00:00').getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

export function generateCardDrafts(input: GenerateInput): CreatePreparedItem[] {
  const cards: CreatePreparedItem[] = []
  const suppressed = new Set(input.suppressedRuleIds)

  // 1) MAHNUNGEN — bestehende Erkennung (Stufen, Cooldowns) wiederverwenden.
  for (const r of dueReminders(input.invoices, input.todos, input.accounts, input.fees, input.payments)) {
    const ruleId = `mahnung-l${r.level}`
    if (suppressed.has(ruleId)) continue
    const bd = reminderBreakdown(r.invoice, input.payments, input.todos, r.level, input.fees)
    const newDeadline = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
    const t = {
      customerName: r.customerName,
      invoiceNumber: r.invoice.number ?? r.invoice.id.slice(0, 8),
      base: bd.base, fee: bd.fee, total: bd.total,
      daysOverdue: r.daysOverdue, level: r.level, newDeadline,
    }
    cards.push({
      workspaceId: input.workspaceId, type: 'mahnung',
      sourceKind: 'invoice_reminder', sourceId: `${r.invoice.id}:${r.level}`,
      ruleId,
      payload: {
        title: `${levelLabel(r.level)} an ${r.customerName} — ${fmtEur(bd.total)}`,
        why: `${levelLabel(r.level)}, weil Rechnung ${t.invoiceNumber} seit ${r.daysOverdue} Tagen ohne Zahlung ist.`,
        customerName: r.customerName, invoiceNumber: t.invoiceNumber,
        amount: bd.total, level: r.level,
        draftSubject: mahnungSubject(t), draftBody: mahnungBody(t),
      },
      // Geld-Band 1000+: Betrag und Alter treiben nach oben, gedeckelt gegen Ausreißer.
      score: 1000 + Math.min(r.daysOverdue, 60) * 2 + Math.min(bd.total / 100, 500),
    })
  }

  // 2) FOLLOW-UPS — fällige offene CRM-Follow-ups.
  if (!suppressed.has('followup-due')) {
    for (const f of input.followUps) {
      if (f.status !== 'offen' || !f.dueDate || f.dueDate.slice(0, 10) > input.todayIso) continue
      const contact = nameOf(input, f.customerId)
      const days = daysSince(f.dueDate, input.todayIso)
      cards.push({
        workspaceId: input.workspaceId, type: 'followup',
        sourceKind: 'crm_follow_up', sourceId: f.id, ruleId: 'followup-due',
        payload: {
          title: `Follow-up: ${contact}`,
          why: days > 0 ? `„${f.title}" ist seit ${days} Tagen fällig.` : `„${f.title}" ist heute fällig.`,
          customerName: contact,
          draftSubject: followupSubject({ title: f.title }),
          draftBody: followupBody({ contactName: contact, title: f.title, daysOverdue: days }),
        },
        score: 800 + Math.min(days, 60),
      })
    }
  }

  // 2b) SEQUENZ — fällige Schritte der automatischen Follow-up-Sequenz.
  //     Kein Auto-Versand: Der vorgetextete Entwurf wartet hier auf Freigabe.
  if (!suppressed.has('sequenz-due')) {
    for (const q of input.queueItems) {
      if (q.status !== 'pending' || q.sendAt.slice(0, 10) > input.todayIso) continue
      const contact = nameOf(input, q.leadId)
      const days = daysSince(q.sendAt, input.todayIso)
      cards.push({
        workspaceId: input.workspaceId, type: 'sequenz',
        sourceKind: 'follow_up_queue', sourceId: q.id, ruleId: 'sequenz-due',
        payload: {
          title: `Sequenz-Mail ${q.sequenceIndex}/4 an ${contact}`,
          why: `Schritt ${q.sequenceIndex} der Follow-up-Sequenz ist fällig — Freigeben sendet die Mail.`,
          customerName: contact,
          draftSubject: q.draftSubject ?? undefined,
          draftBody: q.draftBody ?? undefined,
        },
        // Beziehungs-Band, knapp unter manuellen Follow-ups.
        score: 780 + Math.min(days, 30),
      })
    }
  }

  // 3) RECHNUNGSENTWÜRFE — Suggestions (Deals, Verträge ab Task 12). Normale Drafts NICHT.
  if (!suppressed.has('rechnung-vorschlag')) {
    for (const inv of input.invoices) {
      if (!inv.isSuggestion) continue
      const customer = nameOf(input, inv.accountId)
      cards.push({
        workspaceId: input.workspaceId, type: 'rechnungsentwurf',
        sourceKind: 'invoice_suggestion', sourceId: inv.id, ruleId: 'rechnung-vorschlag',
        payload: {
          title: `Rechnungsentwurf ${fmtEur(inv.total)} an ${customer}`,
          why: 'Automatisch vorbereitet — Freigeben vergibt die Rechnungsnummer.',
          customerName: customer, amount: inv.total,
          invoiceNumber: inv.number ?? undefined,
          draftBody: begleitmailBody({ invoiceNumber: inv.number ?? '(Rechnungsnummer wird vergeben)', total: inv.total, dueDate: inv.dueDate }),
        },
        score: 600 + Math.min(inv.total / 100, 200),
      })
    }
  }

  // 4) AUFGABEN — heute fällige offene Todos (ohne interne send_reminder-Protokolle).
  if (!suppressed.has('aufgabe-heute')) {
    const prio: Record<string, number> = { p1: 30, p2: 20, p3: 10, p4: 0 }
    for (const t of input.todos) {
      if (t.status === 'done' || t.actionType === 'send_reminder') continue
      if (!isTodoForToday(t, input.todayIso)) continue
      cards.push({
        workspaceId: input.workspaceId, type: 'aufgabe',
        sourceKind: 'todo', sourceId: t.id, ruleId: 'aufgabe-heute',
        assignee: t.assignee ?? null,
        payload: { title: t.title, why: `Heute fällig — Priorität ${t.priority.toUpperCase()}.` },
        score: 400 + (prio[t.priority] ?? 0),
      })
    }
  }

  return cards
}

/**
 * Aktive Karten, deren Quelle sich erledigt hat (Rechnung bezahlt, Follow-up erledigt …),
 * werden still geschlossen. Rückgabe: IDs, die auf 'approved' gesetzt werden können
 * (Erledigung außerhalb des Stapels zählt nicht als Verwerfen).
 */
export function reconcileResolvedIds(active: PreparedItem[], input: GenerateInput): string[] {
  const resolved: string[] = []
  for (const item of active) {
    if (item.sourceKind === 'invoice_reminder') {
      const invoiceId = item.sourceId.split(':')[0]
      const inv = input.invoices.find(i => i.id === invoiceId)
      if (!inv || inv.status === 'paid' || inv.status === 'cancelled') resolved.push(item.id)
      // Stufe weitergezählt (neue Karte existiert): alte Stufen-Karte schließen.
      else if (input.todos.some(t => t.sourceRef === invoiceId && t.actionType === 'send_reminder' && t.status === 'done'
        && (item.payload.level ?? 0) < input.todos.filter(x => x.sourceRef === invoiceId && x.actionType === 'send_reminder' && x.status === 'done').length)) {
        resolved.push(item.id)
      }
    } else if (item.sourceKind === 'crm_follow_up') {
      const fu = input.followUps.find(f => f.id === item.sourceId)
      if (!fu || fu.status === 'erledigt') resolved.push(item.id)
    } else if (item.sourceKind === 'follow_up_queue') {
      // queueItems enthält nur fällige pending-Schritte — fehlt der Schritt,
      // wurde er gesendet, übersprungen oder die Sequenz gestoppt.
      if (!input.queueItems.some(q => q.id === item.sourceId)) resolved.push(item.id)
    } else if (item.sourceKind === 'invoice_suggestion') {
      const inv = input.invoices.find(i => i.id === item.sourceId)
      if (!inv || !inv.isSuggestion) resolved.push(item.id)
    } else if (item.sourceKind === 'todo') {
      const t = input.todos.find(x => x.id === item.sourceId)
      if (!t || t.status === 'done') resolved.push(item.id)
    }
  }
  return resolved
}
