import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { useCustomersStore } from '@/store/customers.store'
import { useDealsStore } from '@/store/deals.store'
import { useActivitiesStore } from '@/store/activities.store'
import { useCrmStore } from '@/store/crm.store'
import { useUiStore } from '@/store/ui.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { FinanceService } from '@/services/finance.service'
import { paidAmount, remaining } from '@/lib/invoice-status'
import type { Invoice, Payment } from '@/types/finance.types'

// ─────────────────────────────────────────────────────────────────────────────
// CustomerKpiStrip — die Eckdaten des Kunden als EINE schmale Zeile über der
// Aktivitäten-Timeline. Bewusst klein: KPIs sind Kontext, nicht Inhalt.
// Disziplin: eine Zeile, vier Zahlen — wer mehr will, klickt auf Finanzen.
// ─────────────────────────────────────────────────────────────────────────────

function fmtEuroShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (Math.abs(n) >= 1000) {
    const k = n / 1000
    return k >= 10 ? `${Math.round(k)}k` : `${k.toFixed(1).replace('.', ',')}k`
  }
  return Math.round(n).toString()
}

function fmtEuro(n: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n)
}

function monthsBetween(iso: string): number {
  const start = new Date(iso)
  const now = new Date()
  return Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()))
}

function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((Date.now() - t) / 86_400_000)
}

function lastContactLabel(days: number | null): string {
  if (days === null) return '—'
  if (days === 0) return 'heute'
  if (days === 1) return 'gestern'
  return `vor ${days}T`
}

function Stat({ label, value, accent, muted }: {
  label: string; value: string; accent?: boolean; muted?: boolean
}) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap',
      opacity: muted ? 0.45 : 1,
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 9.5,
        letterSpacing: '0.14em', textTransform: 'uppercase',
        color: 'var(--fg-dim)', fontWeight: 600,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        color: accent ? 'var(--accent)' : muted ? 'var(--fg-dim)' : 'var(--fg)',
      }}>
        {value}
      </span>
    </span>
  )
}

function Dot() {
  return <span style={{ color: 'var(--border-strong)', fontSize: 11 }}>·</span>
}

interface Props { customerId: string }

export function CustomerKpiStrip({ customerId }: Props) {
  const customer     = useCustomersStore(s => s.customers.find(c => c.id === customerId))
  const deals        = useDealsStore(s => s.deals)
  const activities   = useActivitiesStore(s => s.activities)
  const lastActivity = useCrmStore(s => s.lastActivity)
  const setActiveTab = useUiStore(s => s.setActiveCustomerTab)
  const workspaceId  = useWorkspaceStore(s => s.activeWorkspaceId)

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  useEffect(() => {
    FinanceService.getInvoicesByAccount(customerId).then(setInvoices).catch(() => {})
  }, [customerId])
  useEffect(() => {
    if (!workspaceId) return
    FinanceService.getPaymentsByWorkspace(workspaceId).then(setPayments).catch(() => {})
  }, [workspaceId])

  const today = new Date().toLocaleDateString('sv')

  const worthTotal = useMemo(
    () => invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0),
    [invoices],
  )

  const inSpielValue = useMemo(
    () => deals
      .filter(d =>
        (d.accountId === customerId || d.customerId === customerId) &&
        d.stage !== 'won' && d.stage !== 'lost',
      )
      .reduce((s, d) => s + (d.value ?? 0), 0),
    [deals, customerId],
  )

  const overdueList = useMemo(
    () => invoices.filter(i =>
      i.status === 'overdue' || (i.status === 'open' && i.dueDate && i.dueDate < today),
    ),
    [invoices, today],
  )
  // Restbetrag, nicht Brutto — Teilzahlungen reduzieren das offene Geld.
  const overdueTotal = overdueList.reduce((s, i) => s + remaining(i, paidAmount(payments, i.id)), 0)

  const lastContactDays = useMemo(() => {
    const fromCrm = lastActivity.find(a => a.accountId === customerId)?.lastActivityAt
    const fromAct = activities
      .filter(a => (a.accountId === customerId || a.customerId === customerId) && a.createdAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.createdAt
    const candidates = [fromCrm, fromAct, customer?.updatedAt].filter(Boolean) as string[]
    candidates.sort((a, b) => b.localeCompare(a))
    return daysAgo(candidates[0] ?? null)
  }, [lastActivity, activities, customer, customerId])

  if (!customer) return null

  const months = monthsBetween(customer.createdAt)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Eine Zeile, vier Zahlen */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        padding: '10px 14px 12px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        boxShadow: 'var(--card-shadow)',
      }}>
        <Stat label="Kunde seit" value={`${months} Mo.`} muted={months === 0} />
        <Dot />
        <Stat label="Worth" value={`${fmtEuroShort(worthTotal)} €`} muted={worthTotal === 0} />
        <Dot />
        <Stat label="Im Spiel" value={`${fmtEuroShort(inSpielValue)} €`} muted={inSpielValue === 0} />
        <Dot />
        <Stat
          label="Letzter Kontakt"
          value={lastContactLabel(lastContactDays)}
          accent={lastContactDays !== null && lastContactDays <= 7}
          muted={lastContactDays === null}
        />
      </div>

      {/* Überfällig-Alert — das ist Geld, das fehlt. Bleibt prominent. */}
      {overdueList.length > 0 && (
        <button
          onClick={() => setActiveTab('finanzen')}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%',
            padding: '10px 14px', borderRadius: 'var(--radius-sm)',
            background: 'oklch(72% 0.18 25 / 0.10)',
            border: '1px solid oklch(72% 0.18 25 / 0.30)',
            color: 'oklch(80% 0.16 25)', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 12.5, textAlign: 'left',
            transition: 'background 140ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'oklch(72% 0.18 25 / 0.15)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'oklch(72% 0.18 25 / 0.10)' }}
        >
          <AlertTriangle size={14} />
          <span style={{ flex: 1, fontWeight: 600 }}>
            {overdueList.length} {overdueList.length === 1 ? 'überfällige Rechnung' : 'überfällige Rechnungen'} · {fmtEuro(overdueTotal)}
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.08em',
            textTransform: 'uppercase', fontWeight: 700,
          }}>
            Zu Finanzen <ArrowRight size={11} />
          </span>
        </button>
      )}
    </div>
  )
}
