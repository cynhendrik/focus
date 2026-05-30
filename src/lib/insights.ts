// ─────────────────────────────────────────────────────────────────────────────
// Insights engine — pure functions that look at customer state and produce
// system-spoken observations. No UI here; just signal extraction.
//
// Each insight has a stable id so the UI can dismiss it for a session.
// Computed conservatively: thresholds, not ML. We'd rather miss a soft signal
// than spam the user with noise.
// ─────────────────────────────────────────────────────────────────────────────

import type { Activity, Deal, PipelineStage } from '@/types/pipeline.types'
import type { Todo } from '@/types/todo.types'
import type { Note } from '@/types/note.types'
import type { EmailHeader } from '@/types/mail.types'
import type { Contact } from '@/types/contact.types'
import type { Customer } from '@/types/customer.types'
import type { FollowUp, AccountActivityDate } from '@/types/crm.types'

export type InsightSeverity = 'positive' | 'neutral' | 'caution' | 'urgent'

export type InsightKind =
  | 'dormancy'
  | 'overdue_followup'
  | 'stage_stall'
  | 'birthday'
  | 'trend_up'
  | 'trend_down'
  | 'untouched_contact'
  | 'pipeline_health'

export interface Insight {
  id: string
  kind: InsightKind
  severity: InsightSeverity
  text: string
}

interface ComputeInput {
  customerId: string
  activities: Activity[]
  todos:      Todo[]
  notes:      Note[]
  emails:     EmailHeader[]
  deals:      Deal[]
  stages:     PipelineStage[]
  contacts:   Contact[]
}

const DAY = 86_400_000

// ─── Helpers ────────────────────────────────────────────────────────────────

function toMs(iso: string | undefined | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? null : t
}

function pluralDays(n: number): string {
  return `${n} Tag${n === 1 ? '' : 'en'}`
}

function collectTouchTimes(input: ComputeInput): number[] {
  const out: number[] = []
  for (const a of input.activities) {
    const t = toMs(a.createdAt); if (t !== null) out.push(t)
  }
  for (const t of input.todos) {
    const ms = toMs(t.createdAt); if (ms !== null) out.push(ms)
  }
  for (const n of input.notes) {
    const ms = toMs(n.createdAt); if (ms !== null) out.push(ms)
  }
  for (const e of input.emails) {
    if (e.customerId !== input.customerId) continue
    const ms = toMs(e.sentAt); if (ms !== null) out.push(ms)
  }
  return out
}

function daysUntilBirthday(iso: string): number | null {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date()
  const tYear = today.getFullYear()
  const next = new Date(tYear, d.getMonth(), d.getDate())
  if (next < new Date(tYear, today.getMonth(), today.getDate())) {
    next.setFullYear(tYear + 1)
  }
  return Math.round((next.getTime() - today.getTime()) / DAY)
}

// ─── Individual insight rules ───────────────────────────────────────────────

function dormancy(touchTimes: number[]): Insight | null {
  if (touchTimes.length === 0) return null
  const last = Math.max(...touchTimes)
  const days = Math.floor((Date.now() - last) / DAY)
  if (days < 14) return null
  if (days >= 60) {
    return {
      id: 'dormancy',
      kind: 'dormancy',
      severity: 'urgent',
      text: `Schweigen seit ${days} Tagen — der Account schläft ein.`,
    }
  }
  if (days >= 30) {
    return {
      id: 'dormancy',
      kind: 'dormancy',
      severity: 'urgent',
      text: `Vor ${days} Tagen letzter Touch — Beziehung kühlt deutlich ab.`,
    }
  }
  return {
    id: 'dormancy',
    kind: 'dormancy',
    severity: 'caution',
    text: `Vor ${days} Tagen letzter Touch — Zeit für ein Lebenszeichen.`,
  }
}

function overdueFollowups(activities: Activity[]): Insight | null {
  const overdue: Activity[] = []
  const now = Date.now()
  for (const a of activities) {
    if (a.type !== 'followup' || a.status !== 'open' || !a.dueAt) continue
    const due = toMs(a.dueAt)
    if (due !== null && due < now) overdue.push(a)
  }
  if (overdue.length === 0) return null
  if (overdue.length === 1) {
    const a = overdue[0]
    const days = Math.floor((now - toMs(a.dueAt!)!) / DAY)
    const title = a.title ?? '(ohne Titel)'
    const since = days === 0 ? 'seit heute' : `seit ${pluralDays(days)}`
    return {
      id: `overdue-${a.id}`,
      kind: 'overdue_followup',
      severity: 'urgent',
      text: `Follow-up "${title}" überfällig ${since}.`,
    }
  }
  return {
    id: 'overdue-multi',
    kind: 'overdue_followup',
    severity: 'urgent',
    text: `${overdue.length} Follow-ups überfällig — hol sie nach.`,
  }
}

function stageStall(deals: Deal[], stages: PipelineStage[]): Insight | null {
  const stageBy = new Map<string, PipelineStage>()
  for (const s of stages) stageBy.set(s.name, s)

  let worst: { deal: Deal; stage: PipelineStage; days: number } | null = null
  for (const d of deals) {
    const stage = stageBy.get(d.stage)
    if (!stage || stage.isWon || stage.isLost) continue
    const ts = toMs(d.updatedAt)
    if (ts === null) continue
    const days = Math.floor((Date.now() - ts) / DAY)
    if (days < 14) continue
    if (!worst || days > worst.days) worst = { deal: d, stage, days }
  }
  if (!worst) return null
  return {
    id: `stall-${worst.deal.id}`,
    kind: 'stage_stall',
    severity: worst.days >= 30 ? 'urgent' : 'caution',
    text: `Deal "${worst.deal.title}" steckt in "${worst.stage.label}" seit ${pluralDays(worst.days)}.`,
  }
}

function birthdaySoon(contacts: Contact[]): Insight | null {
  for (const c of contacts) {
    if (!c.birthday) continue
    const days = daysUntilBirthday(c.birthday)
    if (days === null || days > 14 || days < 0) continue
    const name = c.lastName ? `${c.firstName} ${c.lastName}` : c.firstName
    if (days === 0) {
      return {
        id: `birthday-${c.id}`,
        kind: 'birthday',
        severity: 'positive',
        text: `${name} hat heute Geburtstag — der perfekte Anlass.`,
      }
    }
    if (days <= 3) {
      return {
        id: `birthday-${c.id}`,
        kind: 'birthday',
        severity: 'positive',
        text: `${name} Geburtstag in ${pluralDays(days)} — Vorlauf für eine Geste.`,
      }
    }
    return {
      id: `birthday-${c.id}`,
      kind: 'birthday',
      severity: 'neutral',
      text: `${name} Geburtstag in ${pluralDays(days)}.`,
    }
  }
  return null
}

function touchTrend(touchTimes: number[]): Insight | null {
  const now = Date.now()
  const last7 = touchTimes.filter(t => t > now - 7 * DAY).length
  const prev7 = touchTimes.filter(t => t > now - 14 * DAY && t <= now - 7 * DAY).length

  // Need a base to make trend meaningful
  if (last7 + prev7 < 2) return null

  if (last7 === 0 && prev7 >= 2) {
    return {
      id: 'trend-cold',
      kind: 'trend_down',
      severity: 'caution',
      text: `Diese Woche null Aktivität — letzte Woche waren es ${prev7}. Bricht ab.`,
    }
  }
  if (prev7 > 0 && last7 >= prev7 * 2 && last7 >= 3) {
    return {
      id: 'trend-hot',
      kind: 'trend_up',
      severity: 'positive',
      text: `Aktivität verdoppelt (${prev7}→${last7} in 7 Tagen) — Beziehung beschleunigt.`,
    }
  }
  return null
}

function untouchedContact(contacts: Contact[], notes: Note[], emails: EmailHeader[], customerId: string): Insight | null {
  if (contacts.length < 2) return null  // only relevant with multiple contacts
  // For each contact, check if they appear in any pinned note or email
  const mentionedEmails = new Set<string>()
  for (const e of emails) {
    if (e.customerId !== customerId) continue
    if (e.fromAddr)    mentionedEmails.add(e.fromAddr.toLowerCase())
    for (const t of e.toAddrs ?? []) mentionedEmails.add(t.toLowerCase())
  }
  const noteText = notes
    .filter(n => n.pinned && n.customerId === customerId)
    .map(n => `${n.title} ${n.content ?? ''}`)
    .join(' ')
    .toLowerCase()

  for (const c of contacts) {
    if (c.isPrimary) continue  // primary is expected to have traffic
    const inMail = c.email ? mentionedEmails.has(c.email.toLowerCase()) : false
    const inNotes = noteText.includes(c.firstName.toLowerCase())
    if (!inMail && !inNotes) {
      const name = c.lastName ? `${c.firstName} ${c.lastName}` : c.firstName
      return {
        id: `untouched-${c.id}`,
        kind: 'untouched_contact',
        severity: 'caution',
        text: `${name} (${c.role ?? 'Kontakt'}) noch nie eingebunden — Champion-Risiko?`,
      }
    }
  }
  return null
}

function pipelineHealth(deals: Deal[], stages: PipelineStage[]): Insight | null {
  const stageBy = new Map<string, PipelineStage>()
  for (const s of stages) stageBy.set(s.name, s)
  let openCount = 0
  let openValue = 0
  for (const d of deals) {
    const s = stageBy.get(d.stage)
    if (!s || s.isWon || s.isLost) continue
    openCount++
    openValue += d.value ?? 0
  }
  if (openCount === 0) return null
  if (openValue >= 50_000) {
    const k = Math.round(openValue / 1_000)
    return {
      id: 'pipeline-strong',
      kind: 'pipeline_health',
      severity: 'positive',
      text: `${openCount} Deal${openCount === 1 ? '' : 's'} · ${k}k € offen — starkes Volumen, dranbleiben.`,
    }
  }
  return null
}

// ─── Severity ordering for display ──────────────────────────────────────────

const SEVERITY_ORDER: Record<InsightSeverity, number> = {
  urgent: 0, caution: 1, positive: 2, neutral: 3,
}

// ─── Main entrypoint ────────────────────────────────────────────────────────

export function computeInsights(input: ComputeInput): Insight[] {
  const touches = collectTouchTimes(input)
  const out: (Insight | null)[] = [
    dormancy(touches),
    overdueFollowups(input.activities),
    stageStall(input.deals, input.stages),
    birthdaySoon(input.contacts),
    touchTrend(touches),
    untouchedContact(input.contacts, input.notes, input.emails, input.customerId),
    pipelineHealth(input.deals, input.stages),
  ]
  return out
    .filter((i): i is Insight => i !== null)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-customer signals — surface relationship-level alerts across the whole
// workspace, for the Dashboard "Beziehungen brauchen Pflege" section.
//
// Scope intentionally narrow: dormancy + stage-stalls. Overdue follow-ups
// are already covered by the existing "Wer wartet auf dich" surface, so we
// don't double-surface them here.
// ─────────────────────────────────────────────────────────────────────────────

export interface AccountSignal {
  customerId:   string
  customerName: string
  insight:      Insight
}

interface AccountSignalsInput {
  customers:     Customer[]
  lastActivity:  AccountActivityDate[]
  followups:     FollowUp[]
  deals:         Deal[]
  stages:        PipelineStage[]
}

export function computeAccountSignals(input: AccountSignalsInput): AccountSignal[] {
  const lastByAcc = new Map<string, string>()
  for (const la of input.lastActivity) {
    if (la.lastActivityAt) lastByAcc.set(la.accountId, la.lastActivityAt)
  }

  const stageByName = new Map<string, PipelineStage>()
  for (const s of input.stages) stageByName.set(s.name, s)

  const dealsByCust = new Map<string, Deal[]>()
  for (const d of input.deals) {
    // Deal.accountId is the customer/account id in this codebase
    const key = d.accountId
    const list = dealsByCust.get(key) ?? []
    list.push(d)
    dealsByCust.set(key, list)
  }

  const out: AccountSignal[] = []

  for (const c of input.customers) {
    if (c.isPrivate) continue
    if (c.id === '__cynera_privat__') continue

    // ── Dormancy ────────────────────────────────────────────────────────
    const last = lastByAcc.get(c.id) ?? c.updatedAt
    const lastMs = last ? new Date(last).getTime() : null
    if (lastMs !== null && !Number.isNaN(lastMs)) {
      const days = Math.floor((Date.now() - lastMs) / DAY)
      if (days >= 30) {
        out.push({
          customerId:   c.id,
          customerName: c.name,
          insight: {
            id:       `dormancy-${c.id}`,
            kind:     'dormancy',
            severity: days >= 60 ? 'urgent' : 'caution',
            text:     `Letzter Touch vor ${pluralDays(days)}.`,
          },
        })
      }
    }

    // ── Stage stall ────────────────────────────────────────────────────
    const customerDeals = dealsByCust.get(c.id) ?? []
    let worstStall: { deal: Deal; stage: PipelineStage; days: number } | null = null
    for (const d of customerDeals) {
      const stage = stageByName.get(d.stage)
      if (!stage || stage.isWon || stage.isLost) continue
      const ts = toMs(d.updatedAt)
      if (ts === null) continue
      const days = Math.floor((Date.now() - ts) / DAY)
      if (days < 21) continue   // higher bar for dashboard than per-customer (14d)
      if (!worstStall || days > worstStall.days) worstStall = { deal: d, stage, days }
    }
    if (worstStall) {
      out.push({
        customerId:   c.id,
        customerName: c.name,
        insight: {
          id:       `stall-${c.id}-${worstStall.deal.id}`,
          kind:     'stage_stall',
          severity: worstStall.days >= 45 ? 'urgent' : 'caution',
          text:     `Deal "${worstStall.deal.title}" steckt in ${worstStall.stage.label} seit ${pluralDays(worstStall.days)}.`,
        },
      })
    }
  }

  out.sort((a, b) => {
    const s = SEVERITY_ORDER[a.insight.severity] - SEVERITY_ORDER[b.insight.severity]
    if (s !== 0) return s
    return a.customerName.localeCompare(b.customerName)
  })

  // Silence the "unused" warning for the followups param so a future expansion
  // (e.g. include overdue follow-up signals here) doesn't trip the linter today.
  void input.followups

  return out
}

