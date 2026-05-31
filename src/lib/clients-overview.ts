// ─────────────────────────────────────────────────────────────────────────────
// Clients overview — per-customer aggregations for the Clients dashboard.
// Picks ONE primary signal per customer (the most urgent one), sums open
// pipeline value, finds the next renewal (closest open deal expectedClose),
// and derives a stable hue from the customer id for the avatar squircle.
// ─────────────────────────────────────────────────────────────────────────────

import type { Customer } from '@/types/customer.types'
import { isPrivateCustomer } from '@/types/customer.types'
import type { Deal, PipelineStage } from '@/types/pipeline.types'
import type { Invoice, Offer } from '@/types/finance.types'
import type { AccountActivityDate } from '@/types/crm.types'

const DAY = 86_400_000

export type ClientSignalKind =
  | 'rechnung_ueberfaellig'
  | 'deal_stockt'
  | 'zusage_offen'
  | 'lange_kein_kontakt'
  | 'ruhig'

export type ClientSignalTone = 'bad' | 'warn' | 'ok'

export interface ClientSignal {
  kind:  ClientSignalKind
  tone:  ClientSignalTone
  label: string
}

const SIGNALS: Record<ClientSignalKind, ClientSignal> = {
  rechnung_ueberfaellig: { kind: 'rechnung_ueberfaellig', tone: 'bad',  label: 'Rechnung überfällig' },
  deal_stockt:           { kind: 'deal_stockt',           tone: 'bad',  label: 'Deal stockt'         },
  zusage_offen:          { kind: 'zusage_offen',          tone: 'warn', label: 'Zusage offen'        },
  lange_kein_kontakt:    { kind: 'lange_kein_kontakt',    tone: 'warn', label: 'Lange kein Kontakt'  },
  ruhig:                 { kind: 'ruhig',                 tone: 'ok',   label: 'Ruhig'               },
}

// Priority order — first match wins.
const SIGNAL_PRIORITY: ClientSignalKind[] = [
  'rechnung_ueberfaellig',
  'deal_stockt',
  'zusage_offen',
  'lange_kein_kontakt',
  'ruhig',
]

export interface ClientRow {
  customer:        Customer
  signal:          ClientSignal
  openDealValue:   number       // sum of value for non-won/lost deals
  renewalInDays:   number | null // days until next open deal's expectedClose
  lastContactAt:   string | null
  variation:       number       // 0..1, stable per customer (Avatar-Chroma)
}

interface ComputeInput {
  customers:     Customer[]
  deals:         Deal[]
  stages:        PipelineStage[]
  invoices:      Invoice[]
  offers:        Offer[]
  lastActivity:  AccountActivityDate[]
}

function toMs(iso: string | undefined | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? null : t
}

// FNV-1a 32-bit — deterministic small hash, normalisiert auf 0..1.
// Wird als Chroma-Faktor benutzt: ein Kunde liegt entweder naeher an
// Grau (Variation nahe 0) oder naeher an Lime (Variation nahe 1).
function hashUnit(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (Math.abs(h) % 10000) / 10000
}

/**
 * Stabile Variation pro Kunde, 0..1. Wird in ClientsRoute zur Avatar-
 * Einfaerbung als Chroma-Multiplier verwendet (gleicher Lime-Hue fuer alle,
 * nur Saettigung varriert) — gibt der Liste einen einheitlichen Look statt
 * Konfetti, jeder Kunde aber trotzdem visuell wiedererkennbar.
 */
export function clientVariation(customer: Pick<Customer, 'id' | 'name'>): number {
  return hashUnit(customer.id || customer.name)
}

// Deals werden primaer ueber accountId zugeordnet; customerId ist ein
// Legacy-Fallback fuer Datensaetze ohne gesetztes accountId. Niemals beide
// matchen — sonst kann derselbe Deal bei zwei Kunden auftauchen, wenn die
// Felder unterschiedliche IDs enthalten.
function customerDealsOf(customerId: string, deals: Deal[]): Deal[] {
  return deals.filter(d =>
    d.accountId
      ? d.accountId === customerId
      : d.customerId === customerId,
  )
}

function isStageOpen(stageName: string, stageByName: Map<string, PipelineStage>): boolean {
  const stage = stageByName.get(stageName)
  if (!stage) return true // unknown stage → treat as open, less surprising than dropping
  return !stage.isWon && !stage.isLost
}

// "sv" liefert YYYY-MM-DD im LOKALEN Kalendertag — wichtig, damit z.B.
// abends um 23:00 (DE) nicht schon UTC-morgens als "heute" gilt und
// Rechnungen einen Tag zu frueh als faellig erscheinen.
function todayIso(): string {
  return new Date().toLocaleDateString('sv')
}

// ─── Per-customer signal computation ───────────────────────────────────────

function hasOverdueInvoice(customerId: string, invoices: Invoice[]): boolean {
  const today = todayIso()
  return invoices.some(i => {
    if (i.accountId !== customerId) return false
    if (i.status === 'overdue') return true
    // Leerer dueDate-String wuerde lexikographisch unter heute liegen
    // ('' < '2026-05-31') und Rechnungen faelschlich als faellig markieren.
    return i.status === 'open' && !!i.dueDate && i.dueDate < today
  })
}

function hasStuckDeal(customerId: string, deals: Deal[], stageByName: Map<string, PipelineStage>): boolean {
  const customerDeals = customerDealsOf(customerId, deals)
  const cutoff = Date.now() - 30 * DAY
  return customerDeals.some(d => {
    if (!isStageOpen(d.stage, stageByName)) return false
    const updated = toMs(d.updatedAt)
    return updated !== null && updated < cutoff
  })
}

function hasOpenOffer(customerId: string, offers: Offer[]): boolean {
  // "Zusage offen" — Angebot raus, noch keine Reaktion.
  return offers.some(o => o.accountId === customerId && o.status === 'sent')
}

function isDormant(lastContactMs: number | null): boolean {
  if (lastContactMs === null) return true
  const days = Math.floor((Date.now() - lastContactMs) / DAY)
  return days >= 30
}

function pickSignal(
  customer: Customer,
  deals: Deal[],
  stageByName: Map<string, PipelineStage>,
  invoices: Invoice[],
  offers: Offer[],
  lastContactMs: number | null,
): ClientSignal {
  for (const kind of SIGNAL_PRIORITY) {
    switch (kind) {
      case 'rechnung_ueberfaellig':
        if (hasOverdueInvoice(customer.id, invoices)) return SIGNALS.rechnung_ueberfaellig
        break
      case 'deal_stockt':
        if (hasStuckDeal(customer.id, deals, stageByName)) return SIGNALS.deal_stockt
        break
      case 'zusage_offen':
        if (hasOpenOffer(customer.id, offers)) return SIGNALS.zusage_offen
        break
      case 'lange_kein_kontakt':
        if (isDormant(lastContactMs)) return SIGNALS.lange_kein_kontakt
        break
      case 'ruhig':
        return SIGNALS.ruhig
    }
  }
  return SIGNALS.ruhig
}

// ─── Aggregations ──────────────────────────────────────────────────────────

function sumOpenDealValue(customerId: string, deals: Deal[], stageByName: Map<string, PipelineStage>): number {
  return customerDealsOf(customerId, deals).reduce((sum, d) => {
    if (!isStageOpen(d.stage, stageByName)) return sum
    return sum + (d.value ?? 0)
  }, 0)
}

function daysUntilNextRenewal(customerId: string, deals: Deal[], stageByName: Map<string, PipelineStage>): number | null {
  const now = Date.now()
  let nearest: number | null = null
  for (const d of customerDealsOf(customerId, deals)) {
    if (!isStageOpen(d.stage, stageByName)) continue
    const t = toMs(d.expectedClose)
    if (t === null || t < now) continue
    if (nearest === null || t < nearest) nearest = t
  }
  if (nearest === null) return null
  return Math.max(0, Math.floor((nearest - now) / DAY))
}

// ─── Main entrypoint ───────────────────────────────────────────────────────

export function computeClientRows(input: ComputeInput): ClientRow[] {
  const stageByName = new Map<string, PipelineStage>()
  for (const s of input.stages) stageByName.set(s.name, s)

  const lastByAcc = new Map<string, string>()
  for (const la of input.lastActivity) {
    if (la.lastActivityAt) lastByAcc.set(la.accountId, la.lastActivityAt)
  }

  return input.customers
    .filter(c => !isPrivateCustomer(c))
    .map<ClientRow>(c => {
      const lastContactAt = lastByAcc.get(c.id) ?? c.updatedAt ?? null
      const lastContactMs = toMs(lastContactAt)
      const signal = pickSignal(c, input.deals, stageByName, input.invoices, input.offers, lastContactMs)
      return {
        customer:      c,
        signal,
        openDealValue: sumOpenDealValue(c.id, input.deals, stageByName),
        renewalInDays: daysUntilNextRenewal(c.id, input.deals, stageByName),
        lastContactAt,
        variation:     clientVariation(c),
      }
    })
}

// ─── Sorting / formatting helpers used by the route ────────────────────────

export type ClientSortKey = 'brauchen' | 'wert' | 'zuletzt' | 'name'

const SIGNAL_RANK: Record<ClientSignalKind, number> = {
  rechnung_ueberfaellig: 0,
  deal_stockt:           1,
  zusage_offen:          2,
  lange_kein_kontakt:    3,
  ruhig:                 4,
}

export function sortClientRows(rows: ClientRow[], key: ClientSortKey): ClientRow[] {
  const copy = [...rows]
  switch (key) {
    case 'brauchen':
      copy.sort((a, b) => {
        const s = SIGNAL_RANK[a.signal.kind] - SIGNAL_RANK[b.signal.kind]
        if (s !== 0) return s
        return a.customer.name.localeCompare(b.customer.name, 'de')
      })
      break
    case 'wert':
      copy.sort((a, b) => b.openDealValue - a.openDealValue || a.customer.name.localeCompare(b.customer.name, 'de'))
      break
    case 'zuletzt':
      copy.sort((a, b) => (toMs(b.lastContactAt) ?? 0) - (toMs(a.lastContactAt) ?? 0))
      break
    case 'name':
      copy.sort((a, b) => a.customer.name.localeCompare(b.customer.name, 'de'))
      break
  }
  return copy
}

export function countNeedsAttention(rows: ClientRow[]): number {
  return rows.filter(r => r.signal.kind !== 'ruhig').length
}

export function formatEuroShort(n: number): string {
  if (n >= 1000) {
    const k = n / 1000
    return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k €`
  }
  return `${Math.round(n)} €`
}

export function customerInitials(name: string): string {
  return name
    .split(/\s+/)
    .map(w => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function relContactLabel(iso: string | null): string {
  if (!iso) return '—'
  const t = toMs(iso)
  if (t === null) return '—'
  const days = Math.floor((Date.now() - t) / DAY)
  if (days <= 0) return 'heute'
  if (days === 1) return 'vor 1 Tag'
  if (days < 30) return `vor ${days} Tagen`
  if (days < 365) return `vor ${Math.floor(days / 30)} Monaten`
  return `vor ${Math.floor(days / 365)} Jahren`
}
