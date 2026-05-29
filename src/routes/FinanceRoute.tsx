import { useEffect, useMemo, useState } from 'react'
import { Plus, FileText, Tag, Trash2, CheckCircle, ChevronRight, Download, Lightbulb, TrendingUp, Eye, XCircle, Package } from 'lucide-react'
import { useFinanceStore } from '@/store/finance.store'
import { useCompanyStore } from '@/store/company.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { InvoiceForm } from '@/components/finance/InvoiceForm'
import { OfferForm } from '@/components/finance/OfferForm'
import { InvoiceSuggestions } from '@/components/finance/InvoiceSuggestions'
import { InvoicePreview } from '@/components/finance/InvoicePreview'
import { downloadInvoicePDF, batchExportInvoicesPDF, getInvoicePdfBytes } from '@/components/finance/InvoicePDF'
import { downloadOfferPDF } from '@/components/finance/OfferPDF'
import { FinanceService } from '@/services/finance.service'
import type { Invoice, InvoiceStatus, InvoiceWithItems, Offer } from '@/types/finance.types'

// ── helpers ──────────────────────────────────────────────────────────────────

type Period = 'monat' | 'quartal' | 'jahr' | 'eigener'
type InvoiceFilter = InvoiceStatus | 'all'

function fmt(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}
function fmtShort(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')} M`
  if (n >= 1000)     return `${(n / 1000).toFixed(1).replace('.', ',')} k`
  return fmt(n)
}
function relDate(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
function inPeriod(iso: string, period: Period, from?: string, to?: string) {
  const d = new Date(iso), now = new Date()
  if (period === 'eigener') {
    const f = from ? new Date(from) : null
    const t = to   ? new Date(to)   : null
    if (f && d < f) return false
    if (t && d > t) return false
    return true
  }
  if (period === 'monat')
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  if (period === 'quartal') {
    const q = Math.floor(now.getMonth() / 3)
    return d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth() / 3) === q
  }
  return d.getFullYear() === now.getFullYear()
}
function periodLabel(period: Period, from?: string, to?: string) {
  const now = new Date()
  const mo = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']
  if (period === 'eigener') {
    if (from && to) return `${from} – ${to}`
    if (from)       return `ab ${from}`
    if (to)         return `bis ${to}`
    return 'Zeitraum'
  }
  if (period === 'monat')   return `${mo[now.getMonth()]} ${now.getFullYear()}`
  if (period === 'quartal') return `Q${Math.floor(now.getMonth() / 3) + 1} · ${now.getFullYear()}`
  return `${now.getFullYear()}`
}

const STATUS_TONE: Record<string, string> = {
  draft: '', open: 'warn', paid: 'ok', overdue: 'bad', cancelled: '',
  sent: 'accent', accepted: 'ok', rejected: 'bad',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Entwurf', open: 'Offen', paid: 'Bezahlt', overdue: 'Überfällig', cancelled: 'Storniert',
  sent: 'Versendet', accepted: 'Angenommen', rejected: 'Abgelehnt',
}
const INVOICE_FILTERS: { value: InvoiceFilter; label: string }[] = [
  { value: 'all',       label: 'Alle' },
  { value: 'open',      label: 'Offen' },
  { value: 'overdue',   label: 'Überfällig' },
  { value: 'paid',      label: 'Bezahlt' },
  { value: 'cancelled', label: 'Storniert' },
]
const td: React.CSSProperties = { padding: '11px 16px', verticalAlign: 'middle' }

// ── Gauge SVG ─────────────────────────────────────────────────────────────────

const GAUGE_R  = 74
const GAUGE_CX = 100
const GAUGE_CY = 98
const GAUGE_PATH = `M ${GAUGE_CX - GAUGE_R},${GAUGE_CY} A ${GAUGE_R},${GAUGE_R} 0 0,0 ${GAUGE_CX + GAUGE_R},${GAUGE_CY}`
const GAUGE_LEN  = Math.PI * GAUGE_R  // ≈ 232.5

function GaugeArc({ animPct, revenue, periodLabel: label }: { animPct: number; revenue: number; periodLabel: string }) {
  const filled   = animPct * GAUGE_LEN
  const tipAngle = Math.PI * (1 - animPct)
  const tipX     = GAUGE_CX + GAUGE_R * Math.cos(tipAngle)
  const tipY     = GAUGE_CY - GAUGE_R * Math.sin(tipAngle)
  const showTip  = animPct > 0.03

  return (
    <div style={{ position: 'relative', width: 220, flexShrink: 0 }}>
      <svg viewBox="0 0 200 106" width={220} height={116}>
        <defs>
          <filter id="arc-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="dot-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          {/* Subtle background gradient for the track */}
          <linearGradient id="track-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--border)" stopOpacity="0.6" />
            <stop offset="100%" stopColor="var(--border)" stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* Outer decorative ring (very subtle) */}
        <path
          d={GAUGE_PATH}
          fill="none"
          stroke="var(--border)"
          strokeWidth="1"
          strokeOpacity="0.3"
          strokeDasharray="4 6"
          transform={`translate(0, -10) scale(1.18) translate(${-(GAUGE_CX * 0.18)}, 0)`}
          style={{ opacity: 0.4 }}
        />

        {/* Background track */}
        <path
          d={GAUGE_PATH}
          fill="none"
          stroke="var(--border)"
          strokeWidth="16"
          strokeLinecap="round"
          strokeOpacity="0.5"
        />

        {/* Inactive track fill (dark inner) */}
        <path
          d={GAUGE_PATH}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth="12"
          strokeLinecap="round"
        />

        {/* Progress arc — glowing accent */}
        <path
          d={GAUGE_PATH}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${GAUGE_LEN}`}
          style={{
            transition: 'stroke-dasharray 800ms cubic-bezier(0.4, 0, 0.2, 1)',
            filter: 'url(#arc-glow)',
          }}
        />

        {/* Bright inner accent line */}
        <path
          d={GAUGE_PATH}
          fill="none"
          stroke="oklch(96% 0.15 125)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${GAUGE_LEN}`}
          style={{ transition: 'stroke-dasharray 800ms cubic-bezier(0.4, 0, 0.2, 1)', opacity: 0.7 }}
        />

        {/* Tip glow dot */}
        {showTip && (
          <>
            <circle cx={tipX} cy={tipY} r={10} fill="var(--accent)" opacity={0.25}
              style={{ filter: 'url(#dot-glow)' }} />
            <circle cx={tipX} cy={tipY} r={5} fill="var(--accent)"
              style={{ filter: 'url(#dot-glow)' }} />
            <circle cx={tipX} cy={tipY} r={2.5} fill="oklch(96% 0.15 125)" />
          </>
        )}

        {/* Percentage label — dead center inside the arc opening */}
        <text
          x={GAUGE_CX} y={GAUGE_CY + 4}
          textAnchor="middle"
          style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fill: 'var(--fg-dim)', fontWeight: 600, letterSpacing: '0.05em' }}
        >
          {Math.round(animPct * 100)}%
        </text>
      </svg>

      {/* Revenue number sits below the arc opening */}
      <div style={{ marginTop: -2, textAlign: 'center' }}>
        <div style={{
          fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em',
          color: 'var(--fg)', fontVariantNumeric: 'tabular-nums', lineHeight: 1,
        }}>
          {fmt(revenue)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 5, fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
          {label} · bezahlt
        </div>
      </div>
    </div>
  )
}

// ── Bar Chart ─────────────────────────────────────────────────────────────────

interface BarEntry { label: string; revenue: number; isCurrent: boolean }

function RevenueBarChart({ bars, maxRevenue }: { bars: BarEntry[]; maxRevenue: number }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const t = setTimeout(() => setMounted(true), 80); return () => clearTimeout(t) }, [])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 6, height: 90,
        padding: '0 4px',
      }}>
        {bars.map((bar, i) => {
          const pct = maxRevenue > 0 ? (bar.revenue / maxRevenue) * 100 : 0
          const h   = mounted ? pct : 0

          return (
            <div
              key={i}
              title={bar.revenue > 0 ? fmt(bar.revenue) : 'Kein Umsatz'}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'flex-end', height: '100%',
                gap: 4,
              }}
            >
              {/* Amount label on hover via title; small value label for current */}
              {bar.isCurrent && bar.revenue > 0 && (
                <span style={{
                  fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--accent)',
                  fontWeight: 700, letterSpacing: '0.02em', whiteSpace: 'nowrap',
                }}>
                  {fmtShort(bar.revenue)}
                </span>
              )}

              <div style={{
                width: '100%',
                height: `${h}%`,
                minHeight: bar.revenue > 0 ? 3 : 0,
                background: bar.isCurrent
                  ? 'var(--accent)'
                  : 'var(--surface-2)',
                border: `1px solid ${bar.isCurrent ? 'oklch(92% 0.2 125 / 0.5)' : 'var(--border)'}`,
                borderRadius: '4px 4px 0 0',
                transition: 'height 700ms cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: bar.isCurrent ? '0 0 12px oklch(92% 0.2 125 / 0.35)' : 'none',
              }} />
            </div>
          )
        })}
      </div>

      {/* Month labels */}
      <div style={{ display: 'flex', gap: 6, padding: '0 4px' }}>
        {bars.map((bar, i) => (
          <div key={i} style={{
            flex: 1, textAlign: 'center',
            fontSize: 9, fontFamily: 'var(--font-mono)',
            color: bar.isCurrent ? 'var(--accent)' : 'var(--fg-dim)',
            fontWeight: bar.isCurrent ? 700 : 400,
            letterSpacing: '0.04em',
          }}>
            {bar.label}
          </div>
        ))}
      </div>

      {/* Axis line */}
      <div style={{ height: 1, background: 'var(--border)', margin: '0 4px', opacity: 0.5 }} />
    </div>
  )
}

// ── Row helpers ───────────────────────────────────────────────────────────────

function RowBtn({ icon, label, onClick, tone }: {
  icon: React.ReactNode; label: string; onClick: () => void; tone?: string
}) {
  const colors: Record<string, string> = { ok: 'var(--ok)', bad: 'var(--danger)', accent: 'var(--accent)' }
  return (
    <button
      onClick={onClick} title={label}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: tone ? (colors[tone] ?? 'var(--fg-muted)') : 'var(--fg-muted)',
        display: 'flex', alignItems: 'center', gap: 3,
        fontSize: 11, padding: '3px 7px', borderRadius: 6,
      }}
    >
      {icon} <span>{label}</span>
    </button>
  )
}

function StatPill({ label, value, count, tone }: {
  label: string; value: number; count?: number; tone?: 'warn' | 'bad'
}) {
  const col = tone === 'bad' ? 'var(--danger)' : tone === 'warn' ? 'var(--warn)' : 'var(--fg-muted)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: col, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
          {fmtShort(value)}
        </span>
        {count !== undefined && count > 0 && (
          <span style={{ fontSize: 11, color: col, fontWeight: 600, opacity: 0.8 }}>{count}×</span>
        )}
      </div>
    </div>
  )
}

// ── Main Route ────────────────────────────────────────────────────────────────

export function FinanceRoute() {
  const loadAll               = useFinanceStore(s => s.loadAll)
  const invoices              = useFinanceStore(s => s.invoices)
  const offers                = useFinanceStore(s => s.offers)
  const deleteInvoice         = useFinanceStore(s => s.deleteInvoice)
  const deleteOffer           = useFinanceStore(s => s.deleteOffer)
  const approveInvoiceSuggestion  = useFinanceStore(s => s.approveInvoiceSuggestion)
  const convertOfferToInvoice     = useFinanceStore(s => s.convertOfferToInvoice)
  const updateInvoiceStatus       = useFinanceStore(s => s.updateInvoiceStatus)
  const createInvoice             = useFinanceStore(s => s.createInvoice)
  const isLoading             = useFinanceStore(s => s.isLoading)

  const isAdmin     = useCompanyStore(s => s.isAdmin)
  const profile     = useCompanyStore(s => s.profile)
  const accounts    = useAccountsStore(s => s.accounts)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const user        = useAuthStore(s => s.user)

  const [period,        setPeriod]        = useState<Period>('monat')
  const [customFrom,    setCustomFrom]    = useState('')
  const [customTo,      setCustomTo]      = useState('')
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter>('all')
  const [showInvoiceForm,  setShowInvoiceForm]  = useState(false)
  const [showOfferForm,    setShowOfferForm]    = useState(false)
  const [showSuggestions,  setShowSuggestions]  = useState(false)
  const [previewData,      setPreviewData]      = useState<{ data: InvoiceWithItems; account: NonNullable<ReturnType<typeof accounts['find']>> } | null>(null)
  const [previewLoading,   setPreviewLoading]   = useState<string | null>(null)
  const [stornoInv,        setStornoInv]        = useState<Invoice | null>(null)
  const [showBatchExport,  setShowBatchExport]  = useState(false)

  // Gauge animation — go from 0 to real value after mount/change
  const [animPct, setAnimPct] = useState(0)

  useEffect(() => { if (workspaceId) loadAll(workspaceId) }, [workspaceId, loadAll])

  const accountName    = (id: string) => accounts.find(a => a.id === id)?.name ?? '—'
  const realInvoices   = useMemo(() => invoices.filter(i => !i.isSuggestion), [invoices])
  const suggestionCount = invoices.filter(i => i.isSuggestion).length

  const openPreview = async (inv: Invoice) => {
    setPreviewLoading(inv.id)
    try {
      const full = await FinanceService.getInvoice(inv.id)
      const acc = accounts.find(a => a.id === inv.accountId)
      if (acc) setPreviewData({ data: full, account: acc })
    } finally {
      setPreviewLoading(null)
    }
  }

  const handleReleaseInvoice = async (inv: Invoice) => {
    await updateInvoiceStatus(inv.id, 'open')
    await loadAll(workspaceId)
  }

  // KPIs
  const periodRevenue = useMemo(() =>
    realInvoices.filter(i => i.status === 'paid' && inPeriod(i.date, period, customFrom, customTo))
      .reduce((s, i) => s + i.total, 0),
    [realInvoices, period, customFrom, customTo],
  )
  const openInvoices    = useMemo(() => realInvoices.filter(i => i.status === 'open'), [realInvoices])
  const overdueInvoices = useMemo(() => realInvoices.filter(i => i.status === 'overdue'), [realInvoices])
  const yearRevenue     = useMemo(() =>
    realInvoices.filter(i => i.status === 'paid' && inPeriod(i.date, 'jahr'))
      .reduce((s, i) => s + i.total, 0),
    [realInvoices],
  )

  // Monthly bars — last 12 months
  const monthlyBars: BarEntry[] = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
      const revenue = realInvoices
        .filter(inv => {
          if (inv.status !== 'paid') return false
          const id = new Date(inv.date)
          return id.getFullYear() === d.getFullYear() && id.getMonth() === d.getMonth()
        })
        .reduce((s, inv) => s + inv.total, 0)
      return {
        label: d.toLocaleDateString('de-DE', { month: 'short' }).replace('.', ''),
        revenue,
        isCurrent: i === 11,
      }
    })
  }, [realInvoices])

  const maxBarRevenue = useMemo(() => Math.max(...monthlyBars.map(b => b.revenue), 1), [monthlyBars])

  // Gauge pct = current period vs max monthly revenue
  const gaugePct = useMemo(() => Math.min(periodRevenue / maxBarRevenue, 1), [periodRevenue, maxBarRevenue])

  useEffect(() => {
    setAnimPct(0)
    const t = setTimeout(() => setAnimPct(gaugePct), 120)
    return () => clearTimeout(t)
  }, [gaugePct])

  // Filtered invoices (exclude cancelled and draft from 'all' unless explicitly selected)
  const filteredInvoices = useMemo(() => {
    const base = realInvoices.filter(i => i.status !== 'cancelled' && i.status !== 'draft')
    if (invoiceFilter === 'all') return base
    return realInvoices.filter(i => i.status === invoiceFilter && i.status !== 'draft')
  }, [realInvoices, invoiceFilter])

  // Active offers (pipeline)
  const activeOffers = useMemo(() =>
    offers.filter(o => o.status === 'draft' || o.status === 'sent'),
    [offers],
  )

  // Draft invoices for Onboarding section
  const draftInvoices = useMemo(() => realInvoices.filter(i => i.status === 'draft'), [realInvoices])

  return (
    <div className="main-inner" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h1 className="greeting-title">Finanzen<em>.</em></h1>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-muted)', marginTop: 8 }}>
            {realInvoices.length} Rechnungen · {offers.length} Angebote
          </div>
        </div>
        {isAdmin && suggestionCount > 0 && (
          <button className="btn-ghost" onClick={() => setShowSuggestions(true)}>
            <Lightbulb size={14} />
            Vorschläge
            <span style={{ background: 'var(--warn)', color: '#000', borderRadius: 99, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>
              {suggestionCount}
            </span>
          </button>
        )}
      </div>

      {/* ── Umsatz ─────────────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: '24px 28px', overflow: 'hidden', position: 'relative' }}>

        {/* Subtle background glow blob */}
        <div style={{
          position: 'absolute', top: -60, right: -40, width: 280, height: 280,
          background: 'radial-gradient(circle, oklch(92% 0.2 125 / 0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Card header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={14} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>Umsatz</span>
          </div>
          {/* Period toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {(['monat', 'quartal', 'jahr', 'eigener'] as Period[]).map(p => (
                <button key={p} onClick={() => setPeriod(p)} style={{
                  padding: '5px 14px', fontSize: 12, fontWeight: 500,
                  border: 'none', cursor: 'pointer',
                  background: period === p ? 'var(--accent)' : 'none',
                  color: period === p ? 'var(--accent-ink)' : 'var(--fg-muted)',
                  transition: 'background 150ms, color 150ms',
                }}>
                  {p === 'eigener' ? 'Eigener' : p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
            {period === 'eigener' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                  style={{ padding: '4px 8px', fontSize: 12, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--fg)', outline: 'none' }} />
                <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>–</span>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                  style={{ padding: '4px 8px', fontSize: 12, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--fg)', outline: 'none' }} />
              </div>
            )}
          </div>
        </div>

        {/* Gauge + Bars */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <GaugeArc animPct={animPct} revenue={periodRevenue} periodLabel={periodLabel(period, customFrom, customTo)} />

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* Chart label */}
            <div style={{ fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4 }}>
              Bezahlte Rechnungen · letzte 12 Monate
            </div>
            <RevenueBarChart bars={monthlyBars} maxRevenue={maxBarRevenue} />
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border)', margin: '20px 0', opacity: 0.6 }} />

        {/* Secondary metrics */}
        <div style={{ display: 'flex', gap: 40 }}>
          <StatPill
            label="Offen"
            value={openInvoices.reduce((s, i) => s + i.total, 0)}
            count={openInvoices.length}
            tone="warn"
          />
          <StatPill
            label="Überfällig"
            value={overdueInvoices.reduce((s, i) => s + i.total, 0)}
            count={overdueInvoices.length}
            tone="bad"
          />
          {period !== 'jahr' && (
            <StatPill label="Jahr gesamt" value={yearRevenue} />
          )}
          <StatPill label="Ø Rechnung" value={realInvoices.length > 0 ? yearRevenue / Math.max(realInvoices.filter(i => i.status === 'paid' && inPeriod(i.date, 'jahr')).length, 1) : 0} />
        </div>
      </div>

      {/* ── Onboarding & Entwürfe ─────────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tag size={14} style={{ color: 'var(--fg-muted)' }} />
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>Onboarding & Entwürfe</h3>
            {(activeOffers.length + draftInvoices.length) > 0 && <span className="chip">{activeOffers.length + draftInvoices.length}</span>}
          </div>
          <button className="btn-ghost" onClick={() => setShowOfferForm(true)}>
            <Plus size={13} /> Neues Angebot
          </button>
        </div>

        {activeOffers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--fg-dim)', fontSize: 12, borderBottom: draftInvoices.length > 0 ? '1px solid var(--border)' : 'none' }}>
            Keine offenen Angebote
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Nummer', 'Titel', 'Kunde', 'Gültig bis', 'Betrag', 'Status', ''].map((h, i) => (
                  <th key={i} className="card-label" style={{ padding: '9px 16px', fontWeight: 500, textAlign: h === 'Betrag' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeOffers.map(offer => (
                <tr key={offer.id}
                  style={{ borderBottom: '1px solid var(--border)', transition: 'background 80ms' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'oklch(100% 0 0 / 0.025)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td style={td}><span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{offer.number ?? '—'}</span></td>
                  <td style={{ ...td, fontWeight: 500 }}>{offer.title}</td>
                  <td style={td}>{accountName(offer.accountId)}</td>
                  <td style={{ ...td, color: 'var(--fg-dim)', fontSize: 12 }}>{relDate(offer.validUntil)}</td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(offer.total)}</td>
                  <td style={td}><span className="chip" data-tone={STATUS_TONE[offer.status] ?? ''}>{STATUS_LABEL[offer.status] ?? offer.status}</span></td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                      <RowBtn icon={<Download size={12} />} label="PDF" onClick={async () => {
                        const full = await FinanceService.getOffer(offer.id)
                        const acc = accounts.find(a => a.id === offer.accountId)
                        if (acc) await downloadOfferPDF(full, profile, acc)
                      }} />
                      <RowBtn icon={<ChevronRight size={12} />} label="→ Rechnung" tone="accent"
                        onClick={() => convertOfferToInvoice(offer.id, workspaceId, user?.id ?? '')} />
                      <RowBtn icon={<Trash2 size={12} />} label="Löschen" tone="bad" onClick={() => deleteOffer(offer.id)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Draft Invoices */}
        {draftInvoices.length > 0 && (
          <>
            <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              Rechnungsentwürfe ({draftInvoices.length})
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Kunde', 'Datum', 'Betrag', ''].map((h, i) => (
                    <th key={i} className="card-label" style={{ padding: '9px 16px', fontWeight: 500, textAlign: h === 'Betrag' ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {draftInvoices.map(inv => (
                  <tr key={inv.id}
                    style={{ borderBottom: '1px solid var(--border)', transition: 'background 80ms' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'oklch(100% 0 0 / 0.025)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ ...td, fontWeight: 500 }}>{accountName(inv.accountId)}</td>
                    <td style={{ ...td, color: 'var(--fg-dim)', fontSize: 12 }}>{relDate(inv.date)}</td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(inv.total)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                        {isAdmin && (
                          <RowBtn icon={<CheckCircle size={12} />} label="Freigeben" tone="ok"
                            onClick={() => handleReleaseInvoice(inv)} />
                        )}
                        {isAdmin && (
                          <RowBtn icon={<Trash2 size={12} />} label="Löschen" tone="bad"
                            onClick={() => deleteInvoice(inv.id)} />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {offers.filter(o => o.status === 'accepted' || o.status === 'rejected').length > 0 && (
          <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--fg-dim)', display: 'flex', gap: 12 }}>
            <span>{offers.filter(o => o.status === 'accepted').length} angenommen</span>
            <span>·</span>
            <span>{offers.filter(o => o.status === 'rejected').length} abgelehnt</span>
          </div>
        )}
      </div>

      {/* ── Rechnungen ─────────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={14} style={{ color: 'var(--fg-muted)' }} />
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>Rechnungen</h3>
              {filteredInvoices.length > 0 && <span className="chip">{filteredInvoices.length}</span>}
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              {INVOICE_FILTERS.map(f => (
                <button key={f.value} onClick={() => setInvoiceFilter(f.value)}
                  className="chip" data-tone={invoiceFilter === f.value ? 'accent' : ''}
                  style={{ cursor: 'pointer' }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-ghost" onClick={() => setShowBatchExport(true)}>
              <Package size={13} /> Batch Export
            </button>
            {isAdmin && (
              <button className="btn-primary" onClick={() => setShowInvoiceForm(true)}>
                <Plus size={13} /> Neue Rechnung
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--fg-dim)', fontSize: 13 }}>Laden…</div>
        ) : filteredInvoices.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--fg-dim)', fontSize: 13 }}>Keine Rechnungen</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Nummer', 'Kunde', 'Datum', 'Fällig', 'Betrag', 'Status', ''].map((h, i) => (
                  <th key={i} className="card-label" style={{ padding: '9px 16px', fontWeight: 500, textAlign: h === 'Betrag' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map(inv => (
                <tr key={inv.id}
                  style={{
                    borderBottom: '1px solid var(--border)', transition: 'background 80ms',
                    opacity: inv.status === 'cancelled' ? 0.5 : 1,
                    textDecoration: inv.status === 'cancelled' ? 'line-through' : 'none',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'oklch(100% 0 0 / 0.025)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td style={td}><span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{inv.number ?? '—'}</span></td>
                  <td style={{ ...td, fontWeight: 500 }}>{accountName(inv.accountId)}</td>
                  <td style={{ ...td, color: 'var(--fg-dim)', fontSize: 12 }}>{relDate(inv.date)}</td>
                  <td style={{ ...td, fontSize: 12 }}>
                    <span style={{ color: inv.status === 'overdue' ? 'var(--danger)' : 'var(--fg-dim)' }}>
                      {relDate(inv.dueDate)}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(inv.total)}</td>
                  <td style={td}><span className="chip" data-tone={STATUS_TONE[inv.status] ?? ''}>{STATUS_LABEL[inv.status] ?? inv.status}</span></td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                      <RowBtn
                        icon={previewLoading === inv.id ? <span style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid var(--fg-dim)', borderTopColor: 'transparent', display: 'inline-block', animation: 'spin 0.6s linear infinite' }} /> : <Eye size={12} />}
                        label="Vorschau"
                        onClick={() => openPreview(inv)}
                      />
                      <RowBtn icon={<Download size={12} />} label="PDF" onClick={async () => {
                        const full = await FinanceService.getInvoice(inv.id)
                        const acc = accounts.find(a => a.id === inv.accountId)
                        if (acc) await downloadInvoicePDF(full, profile, acc)
                      }} />
                      {isAdmin && inv.isSuggestion && (
                        <RowBtn icon={<CheckCircle size={12} />} label="Freigeben" tone="ok"
                          onClick={() => approveInvoiceSuggestion(inv.id, user?.id ?? '', workspaceId)} />
                      )}
                      {isAdmin && inv.status === 'open' && (
                        <RowBtn icon={<CheckCircle size={12} />} label="Bezahlt" tone="ok"
                          onClick={() => updateInvoiceStatus(inv.id, 'paid')} />
                      )}
                      {isAdmin && inv.status !== 'cancelled' && (
                        <RowBtn icon={<XCircle size={12} />} label="Stornieren" tone="bad"
                          onClick={() => setStornoInv(inv)} />
                      )}
                      {isAdmin && inv.status === 'cancelled' && (
                        <RowBtn icon={<Trash2 size={12} />} label="Löschen" tone="bad"
                          onClick={() => deleteInvoice(inv.id)} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showInvoiceForm && (
        <InvoiceForm onClose={() => setShowInvoiceForm(false)}
          onSaved={() => { setShowInvoiceForm(false); loadAll(workspaceId) }} />
      )}
      {showOfferForm && (
        <OfferForm onClose={() => setShowOfferForm(false)}
          onSaved={() => { setShowOfferForm(false); loadAll(workspaceId) }} />
      )}
      {showSuggestions && (
        <InvoiceSuggestions
          suggestions={invoices.filter(i => i.isSuggestion)}
          onClose={() => { setShowSuggestions(false); loadAll(workspaceId) }}
        />
      )}
      {showBatchExport && profile && (
        <BatchExportModal
          invoices={realInvoices}
          accounts={accounts}
          profile={profile}
          onClose={() => setShowBatchExport(false)}
        />
      )}
      {previewData && profile && (
        <InvoicePreview
          data={previewData.data}
          profile={profile}
          account={previewData.account}
          onClose={() => setPreviewData(null)}
        />
      )}
      {stornoInv && (
        <StornoModal
          invoice={stornoInv}
          onCancel={() => setStornoInv(null)}
          onConfirm={async (reason, createGutschrift) => {
            await updateInvoiceStatus(stornoInv.id, 'cancelled')
            if (createGutschrift) {
              const full = await FinanceService.getInvoice(stornoInv.id)
              await createInvoice({
                workspaceId,
                createdBy: user?.id ?? '',
                accountId: stornoInv.accountId,
                date: new Date().toISOString().slice(0, 10),
                dueDate: new Date().toISOString().slice(0, 10),
                status: 'open',
                taxMode: stornoInv.taxMode,
                subtotal: -stornoInv.subtotal,
                taxAmount: -stornoInv.taxAmount,
                total: -stornoInv.total,
                notes: `Gutschrift zu ${stornoInv.number ?? 'Rechnung'}${reason ? '. Grund: ' + reason : ''}`,
                items: full.items.map(item => ({
                  title: item.title,
                  description: item.description,
                  quantity: -item.quantity,
                  unitPrice: item.unitPrice,
                  taxRate: item.taxRate,
                  total: -item.total,
                  sortOrder: item.sortOrder,
                })),
              })
            }
            await loadAll(workspaceId)
            setStornoInv(null)
          }}
        />
      )}
    </div>
  )
}

// ── Storno Modal ──────────────────────────────────────────────────────────────

interface StornoModalProps {
  invoice: Invoice
  onCancel: () => void
  onConfirm: (reason: string, createGutschrift: boolean) => Promise<void>
}

function StornoModal({ invoice, onCancel, onConfirm }: StornoModalProps) {
  const [reason,           setReason]           = useState('')
  const [createGutschrift, setCreateGutschrift] = useState(invoice.status !== 'draft')
  const [loading,          setLoading]          = useState(false)

  const isDraft = invoice.status === 'draft'

  const handleConfirm = async () => {
    setLoading(true)
    try { await onConfirm(reason, createGutschrift) } finally { setLoading(false) }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'oklch(0% 0 0 / 0.55)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div className="card" style={{ width: 420, padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700 }}>Rechnung stornieren</h3>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)' }}>
            {isDraft
              ? `Entwurf ${invoice.number ?? ''} wird gelöscht / storniert. Da noch nicht versendet, ist keine Gutschrift nötig.`
              : `Rechnung ${invoice.number ?? ''} wird storniert.`}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, color: 'var(--fg-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Grund (optional)
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="z.B. Auftrag zurückgezogen, Doppelbuchung…"
            rows={2}
            style={{
              width: '100%', padding: '8px 10px', fontSize: 13,
              borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--surface-2)', color: 'var(--fg)',
              resize: 'none', outline: 'none', boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {!isDraft && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={createGutschrift}
              onChange={e => setCreateGutschrift(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <span>
              Gutschrift erstellen{' '}
              <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
                (negative Gegenrechnung, erhält eigene Nummer)
              </span>
            </span>
          </label>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onCancel} disabled={loading}>Abbrechen</button>
          <button
            className="btn-ghost"
            onClick={handleConfirm}
            disabled={loading}
            style={{ background: 'var(--danger)', color: '#fff', border: 'none' }}
          >
            {loading ? 'Wird storniert…' : 'Stornieren'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Batch Export Modal ────────────────────────────────────────────────────────

import type { Account } from '@/types/account.types'
import type { CompanyProfile } from '@/types/company.types'

interface BatchExportModalProps {
  invoices: Invoice[]
  accounts: Account[]
  profile: CompanyProfile
  onClose: () => void
}

function BatchExportModal({ invoices, accounts, profile, onClose }: BatchExportModalProps) {
  const today = new Date().toISOString().slice(0, 10)
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

  const [from,    setFrom]    = useState(firstOfMonth)
  const [to,      setTo]      = useState(today)
  const [loading, setLoading] = useState(false)

  const eligible = useMemo(() => {
    if (!from && !to) return invoices.filter(i => i.number && i.status !== 'cancelled')
    return invoices.filter(i => {
      if (!i.number || i.status === 'cancelled') return false
      const d = new Date(i.date)
      if (from && d < new Date(from)) return false
      if (to   && d > new Date(to))   return false
      return true
    })
  }, [invoices, from, to])

  const handleExport = async () => {
    if (eligible.length === 0) return
    setLoading(true)
    try {
      const loaded: Array<{ data: InvoiceWithItems; account: Account }> = []
      for (const inv of eligible) {
        const full = await FinanceService.getInvoice(inv.id)
        const acc  = accounts.find((a: Account) => a.id === inv.accountId)
        if (acc) loaded.push({ data: full, account: acc })
      }
      const zipName = `Rechnungen_${from}_bis_${to}.zip`
      await batchExportInvoicesPDF(loaded, profile, zipName)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'oklch(0% 0 0 / 0.55)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 440, padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700 }}>Batch PDF Export</h3>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-muted)' }}>
            Rechnungen als ZIP exportieren — benannt nach Rechnungsnummer + Kundenname.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', letterSpacing: '0.04em', display: 'block', marginBottom: 5 }}>Von</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', letterSpacing: '0.04em', display: 'block', marginBottom: 5 }}>Bis</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)', outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>

        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 13 }}>
          {eligible.length === 0
            ? <span style={{ color: 'var(--fg-dim)' }}>Keine Rechnungen in diesem Zeitraum</span>
            : <span><strong>{eligible.length}</strong> Rechnung{eligible.length !== 1 ? 'en' : ''} werden exportiert</span>
          }
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose} disabled={loading}>Abbrechen</button>
          <button className="btn-primary" onClick={handleExport} disabled={loading || eligible.length === 0}>
            {loading ? 'Exportiere…' : `Als ZIP speichern (${eligible.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}
