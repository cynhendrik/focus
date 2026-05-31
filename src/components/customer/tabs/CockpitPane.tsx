// ─────────────────────────────────────────────────────────────────────────────
// CockpitPane — Erster Tab im Customer-Detail. Schneller Lagebericht:
//   - KI-Briefing (BriefingCard)
//   - Lead Score (LeadScoreCard) — was treibt den Score gerade
//   - Quick-Stats — offene Tasks, offene Rechnungen, offene Deals, letzter Kontakt
//
// Keine eigene Logik, nur Komposition. Die einzelnen Cards holen ihre Daten
// selbst aus den entsprechenden Stores.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { useCustomersStore } from '@/store/customers.store'
import { useTodosStore } from '@/store/todos.store'
import { useDealsStore } from '@/store/deals.store'
import { useCrmStore } from '@/store/crm.store'
import { FinanceService } from '@/services/finance.service'
import type { Invoice } from '@/types/finance.types'
import { BriefingCard } from '@/components/customer/BriefingCard'
import { LeadScoreCard } from '@/components/customer/LeadScoreCard'
import { CheckSquare, FileText, TrendingUp, Clock } from 'lucide-react'

interface Props { customerId: string }

function fmtEuro(n: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n)
}

function relTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const days = Math.floor((Date.now() - t) / 86_400_000)
  if (days <= 0) return 'heute'
  if (days === 1) return 'vor 1 Tag'
  if (days < 30) return `vor ${days} Tagen`
  if (days < 365) return `vor ${Math.floor(days / 30)} Monaten`
  return `vor ${Math.floor(days / 365)} Jahren`
}

// ── Kleine Stat-Kachel ─────────────────────────────────────────────────────

function StatTile({
  icon, label, value, hint, tone,
}: {
  icon:  React.ReactNode
  label: string
  value: string | number
  hint?: string
  tone?: 'neutral' | 'accent' | 'warn'
}) {
  const ink =
    tone === 'accent' ? 'var(--accent)'
    : tone === 'warn' ? 'oklch(82% 0.17 80)'
    : 'var(--fg)'
  return (
    <div style={{
      borderRadius: 14, border: '1px solid var(--border)',
      background: 'var(--bg1)', padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: 'var(--font-mono)', fontSize: 10,
        letterSpacing: '0.16em', textTransform: 'uppercase',
        color: 'var(--fg-dim)', fontWeight: 600,
      }}>
        <span style={{ display: 'inline-flex', color: 'var(--fg-muted)' }}>{icon}</span>
        {label}
      </div>
      <div style={{
        fontSize: 22, fontWeight: 700, color: ink,
        fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.1,
      }}>
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
          {hint}
        </div>
      )}
    </div>
  )
}

// ── Pane ───────────────────────────────────────────────────────────────────

export function CockpitPane({ customerId }: Props) {
  const customer       = useCustomersStore(s => s.customers.find(c => c.id === customerId))
  const allTodos       = useTodosStore(s => s.allTodos)
  const loadTodos      = useTodosStore(s => s.loadForCustomer)
  const allDeals       = useDealsStore(s => s.deals)
  const lastActivity   = useCrmStore(s => s.lastActivity)

  // Invoices direkt via Service holen (analog zu FinanzPane), weil der
  // FinanceStore Workspace-weit laedt, aber im Customer-Detail-Tab nicht
  // garantiert initialisiert ist.
  const [invoices, setInvoices] = useState<Invoice[]>([])

  useEffect(() => {
    loadTodos(customerId)
    FinanceService.getInvoicesByAccount(customerId).then(setInvoices).catch(() => {})
  }, [customerId, loadTodos])

  const openTasks = useMemo(
    () => allTodos.filter(t => t.customerId === customerId && t.status !== 'done').length,
    [allTodos, customerId],
  )

  const openInvoices = useMemo(
    () => invoices.filter(i => i.status === 'open' || i.status === 'overdue'),
    [invoices],
  )

  const openDeals = useMemo(
    () => allDeals.filter(d => d.accountId === customerId && d.stage !== 'won' && d.stage !== 'lost'),
    [allDeals, customerId],
  )

  const openDealValue = openDeals.reduce((sum, d) => sum + (d.value ?? 0), 0)
  const openInvoiceTotal = openInvoices.reduce((sum, i) => sum + (i.total ?? 0), 0)

  const lastContact = useMemo(() => {
    const entry = lastActivity.find(a => a.accountId === customerId)
    return entry?.lastActivityAt ?? customer?.updatedAt ?? null
  }, [lastActivity, customerId, customer])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 16,
      padding: '20px 24px 32px', overflow: 'auto', height: '100%',
    }}>
      {/* ── KI-Briefing ─────────────────────────────────────────────────── */}
      <BriefingCard customerId={customerId} />

      {/* ── Quick-Stats ────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
      }}>
        <StatTile
          icon={<CheckSquare size={13} />}
          label="Offene Tasks"
          value={openTasks}
          hint={openTasks === 0 ? 'Alles erledigt' : undefined}
          tone={openTasks > 0 ? 'accent' : 'neutral'}
        />
        <StatTile
          icon={<TrendingUp size={13} />}
          label="Offene Deals"
          value={openDeals.length}
          hint={openDealValue > 0 ? fmtEuro(openDealValue) : '—'}
        />
        <StatTile
          icon={<FileText size={13} />}
          label="Offene Rechnungen"
          value={openInvoices.length}
          hint={openInvoiceTotal > 0 ? fmtEuro(openInvoiceTotal) : '—'}
          tone={openInvoices.some(i => i.status === 'overdue') ? 'warn' : 'neutral'}
        />
        <StatTile
          icon={<Clock size={13} />}
          label="Letzter Kontakt"
          value={relTime(lastContact)}
        />
      </div>

      {/* ── Lead Score ─────────────────────────────────────────────────── */}
      {customer && (
        <LeadScoreCard score={customer.leadScore} factors={customer.scoreFactors} />
      )}
    </div>
  )
}
