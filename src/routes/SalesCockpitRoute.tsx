// ─────────────────────────────────────────────────────────────────────────────
// SalesCockpitRoute — Übersicht über alle Leads/Kunden aus Score-Perspektive.
// Drei Bausteine:
//   - Header: Bucket-Counts + Ø-Score
//   - Verteilungs-Histogramm (10er-Buckets)
//   - Hottest Leads (Top nach Score)
//   - Cooling Down (Score ≥ 40 und > 14 Tage kein Kontakt — verdient Aktion)
//
// Klick auf eine Zeile öffnet den Customer-Detail mit der vollen LeadScoreCard.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react'
import { ArrowRight, Flame, Snowflake } from 'lucide-react'
import { useCustomersStore } from '@/store/customers.store'
import { useCrmStore } from '@/store/crm.store'
import { useUiStore } from '@/store/ui.store'
import { isPrivateCustomer } from '@/types/customer.types'
import type { Customer } from '@/types/customer.types'
import {
  scoreColor, scoreBucket, bucketLabel, scoreHistogram, prettyFactor,
} from '@/lib/lead-score'

const DAY = 86_400_000

interface LeadRow {
  customer:        Customer
  score:           number
  lastContactDays: number | null
  topFactor:       string | null
}

function dormancyLabel(days: number | null): string {
  if (days === null)   return 'Kein Kontakt'
  if (days <= 0)       return 'heute'
  if (days < 7)        return `vor ${days} Tagen`
  if (days < 30)       return `vor ${Math.floor(days / 7)} Wochen`
  return `vor ${Math.floor(days / 30)} Monaten`
}

function topFactorOf(factors: Record<string, number>): string | null {
  let bestKey: string | null = null
  let bestAbs = 0
  for (const [k, v] of Object.entries(factors)) {
    if (Math.abs(v) > bestAbs) { bestAbs = Math.abs(v); bestKey = k }
  }
  return bestKey ? prettyFactor(bestKey) : null
}

// ── Histogramm-Bar (eine Saeule pro 10er-Bucket) ─────────────────────────────
function Histogram({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 96 }}>
      {counts.map((n, i) => {
        const midpoint = i * 10 + 5
        const color = scoreColor(midpoint)
        const h = (n / max) * 100
        return (
          <div
            key={i}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
            title={`${i * 10}–${i === 9 ? 100 : i * 10 + 9}: ${n} Kunden`}
          >
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: n > 0 ? 'var(--fg)' : 'var(--fg-dim)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {n}
            </div>
            <div style={{
              width: '100%', height: `${Math.max(2, h)}%`,
              background: n > 0 ? color : 'var(--surface-2)',
              opacity: n > 0 ? 0.85 : 0.5,
              borderRadius: 4,
              transition: 'height 360ms ease-out',
            }} />
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 9,
              color: 'var(--fg-dim)', letterSpacing: '0.05em',
            }}>
              {i * 10}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Zeile in den Top-Listen ──────────────────────────────────────────────────
function LeadRowItem({ row, onOpen }: { row: LeadRow; onOpen: () => void }) {
  const c = scoreColor(row.score)
  return (
    <button
      onClick={onOpen}
      style={{
        display: 'grid', gridTemplateColumns: '44px 1fr 1fr auto 16px',
        alignItems: 'center', gap: 14, width: '100%',
        padding: '12px 16px', borderRadius: 12,
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        cursor: 'pointer', color: 'var(--fg)', textAlign: 'left',
        fontFamily: 'inherit',
        transition: 'border-color 140ms, background 140ms',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'oklch(100% 0 0 / 0.18)'
        e.currentTarget.style.background = 'oklch(100% 0 0 / 0.03)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.background = 'var(--surface-2)'
      }}
    >
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 40, height: 28, borderRadius: 8,
        background: `color-mix(in oklch, ${c} 14%, transparent)`,
        border: `1px solid color-mix(in oklch, ${c} 32%, transparent)`,
        color: c, fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {row.score}
      </span>

      <span style={{
        fontSize: 14, fontWeight: 600,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {row.customer.name}
      </span>

      <span style={{
        fontSize: 12, color: 'var(--fg-muted)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {row.topFactor ?? '—'}
      </span>

      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 11,
        color: 'var(--fg-dim)', whiteSpace: 'nowrap',
      }}>
        {dormancyLabel(row.lastContactDays)}
      </span>

      <ArrowRight size={14} style={{ color: 'var(--fg-dim)' }} />
    </button>
  )
}

function SectionTitle({ icon, label, count }: {
  icon: React.ReactNode
  label: string
  count: number
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '0 4px 12px',
    }}>
      {icon}
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 11,
        letterSpacing: '0.18em', textTransform: 'uppercase',
        color: 'var(--fg-dim)', fontWeight: 600,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 11,
        color: 'var(--fg-muted)',
      }}>
        {count}
      </span>
    </div>
  )
}

// ── Route ────────────────────────────────────────────────────────────────────
export function SalesCockpitRoute() {
  const customers   = useCustomersStore(s => s.customers)
  const lastActivity = useCrmStore(s => s.lastActivity)
  const openCustomerAt = useUiStore(s => s.openCustomerAt)

  const rows = useMemo<LeadRow[]>(() => {
    const lastByAcc = new Map<string, string>()
    for (const la of lastActivity) {
      if (la.lastActivityAt) lastByAcc.set(la.accountId, la.lastActivityAt)
    }
    return customers
      .filter(c => !isPrivateCustomer(c))
      .map<LeadRow>(c => {
        const lastIso = lastByAcc.get(c.id) ?? c.updatedAt ?? null
        const lastMs  = lastIso ? new Date(lastIso).getTime() : null
        const days    = (lastMs && !Number.isNaN(lastMs))
          ? Math.floor((Date.now() - lastMs) / DAY)
          : null
        return {
          customer:        c,
          score:           c.leadScore,
          lastContactDays: days,
          topFactor:       topFactorOf(c.scoreFactors),
        }
      })
  }, [customers, lastActivity])

  const stats = useMemo(() => {
    let hot = 0, warm = 0, cold = 0, sum = 0
    for (const r of rows) {
      sum += r.score
      const b = scoreBucket(r.score)
      if (b === 'hot')  hot++
      else if (b === 'warm') warm++
      else cold++
    }
    const avg = rows.length ? Math.round(sum / rows.length) : 0
    return { hot, warm, cold, avg, total: rows.length }
  }, [rows])

  const histogram = useMemo(
    () => scoreHistogram(rows.map(r => r.score)),
    [rows],
  )

  const hottest = useMemo(
    () => [...rows].sort((a, b) => b.score - a.score).slice(0, 8),
    [rows],
  )

  // Cooling = warmer/heisser Kunde (Score ≥ 40), aber > 14 Tage kein Kontakt.
  // Sortiert nach Score desc — die teuersten Vernachlaessigten zuerst.
  const cooling = useMemo(
    () =>
      rows
        .filter(r => r.score >= 40 && (r.lastContactDays ?? 0) > 14)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6),
    [rows],
  )

  return (
    <div className="main-inner" style={{ padding: 24, overflow: 'auto', height: '100%' }}>
      <div className="greeting" style={{ marginBottom: 20 }}>
        <h1 className="greeting-title">Sales Cockpit<em>.</em></h1>
        <div className="greeting-sub" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <span><strong style={{ color: scoreColor(75) }}>{stats.hot}</strong> {bucketLabel('hot')}</span>
          <span><strong style={{ color: scoreColor(50) }}>{stats.warm}</strong> {bucketLabel('warm')}</span>
          <span><strong style={{ color: scoreColor(20) }}>{stats.cold}</strong> {bucketLabel('cold')}</span>
          <span>Ø Score <strong style={{ fontFamily: 'var(--font-mono)' }}>{stats.avg}</strong></span>
          <span>{stats.total} Kunden gesamt</span>
        </div>
      </div>

      {/* ── Verteilungs-Histogramm ─────────────────────────────────────────── */}
      <div style={{
        borderRadius: 16, border: '1px solid var(--border)',
        background: 'var(--bg1)', padding: 18, marginBottom: 20,
      }}>
        <SectionTitle
          icon={<span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--fg-muted)' }} />}
          label="Score-Verteilung"
          count={stats.total}
        />
        <Histogram counts={histogram} />
      </div>

      {/* ── Hottest Leads ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <SectionTitle
          icon={<Flame size={14} style={{ color: scoreColor(80) }} />}
          label="Hottest Leads"
          count={hottest.length}
        />
        {hottest.length === 0 ? (
          <EmptyState text="Noch keine Leads im System." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {hottest.map(row => (
              <LeadRowItem
                key={row.customer.id}
                row={row}
                onOpen={() => openCustomerAt(row.customer.id, 'historie')}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Cooling Down ───────────────────────────────────────────────────── */}
      <div>
        <SectionTitle
          icon={<Snowflake size={14} style={{ color: scoreColor(50) }} />}
          label="Cooling Down"
          count={cooling.length}
        />
        {cooling.length === 0 ? (
          <EmptyState text="Alle warmen Kunden hatten in den letzten 14 Tagen Kontakt." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cooling.map(row => (
              <LeadRowItem
                key={row.customer.id}
                row={row}
                onOpen={() => openCustomerAt(row.customer.id, 'historie')}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{
      padding: '18px 16px', borderRadius: 12,
      background: 'var(--surface-2)', border: '1px dashed var(--border)',
      color: 'var(--fg-muted)', fontSize: 12,
    }}>
      {text}
    </div>
  )
}
