import { useMemo } from 'react'
import { useFinanceStore } from '@/store/finance.store'

function startOfWeek(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const m = new Date(d); m.setHours(0,0,0,0); m.setDate(d.getDate() + diff); return m
}

function fmtEur(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

export function WidgetRevenue() {
  const invoices = useFinanceStore(s => s.invoices)

  const { paidNow, trend, bars } = useMemo(() => {
    const now = new Date()
    const weekStart = startOfWeek(now)
    const prevWeekStart = new Date(weekStart); prevWeekStart.setDate(prevWeekStart.getDate() - 7)

    let paidNow = 0, paidPrev = 0
    for (const inv of invoices) {
      if (inv.status !== 'paid') continue
      const ts = new Date(inv.date)
      if (ts >= weekStart) paidNow += inv.total
      else if (ts >= prevWeekStart && ts < weekStart) paidPrev += inv.total
    }

    const trendPct = paidPrev === 0
      ? (paidNow > 0 ? 100 : 0)
      : Math.round(((paidNow - paidPrev) / paidPrev) * 100)

    const bars: number[] = []
    for (let w = 4; w >= 0; w--) {
      const ws = new Date(weekStart); ws.setDate(ws.getDate() - w * 7)
      const we = new Date(ws); we.setDate(we.getDate() + 7)
      const total = invoices
        .filter(i => i.status === 'paid' && new Date(i.date) >= ws && new Date(i.date) < we)
        .reduce((s, i) => s + i.total, 0)
      bars.push(total)
    }
    const maxBar = Math.max(...bars, 1)

    return { paidNow, trend: trendPct, bars: bars.map(b => b / maxBar) }
  }, [invoices])

  const overdueCount = invoices.filter(i => i.status === 'overdue').length

  return (
    <div style={{ textAlign: 'center', position: 'relative' }}>
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 300, height: 200, borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(59,109,244,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ fontSize: 9, color: 'rgba(59,109,244,0.5)', fontFamily: 'var(--font-mono)', letterSpacing: '0.18em', marginBottom: 16 }}>
        UMSATZ · DIESE WOCHE
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 40, justifyContent: 'center', marginBottom: 16 }}>
        {bars.map((h, i) => (
          <div key={i} style={{
            width: 14, borderRadius: '3px 3px 0 0',
            height: `${Math.max(h * 100, 4)}%`,
            background: i === bars.length - 1 ? 'var(--accent)' : 'rgba(59,109,244,0.18)',
            boxShadow: i === bars.length - 1 ? '0 0 8px rgba(59,109,244,0.5)' : 'none',
            transition: 'height 600ms ease',
          }} />
        ))}
      </div>

      <div style={{
        fontSize: 56, fontWeight: 900, color: 'var(--accent)',
        letterSpacing: '-0.04em', lineHeight: 1,
        textShadow: '0 0 48px rgba(59,109,244,0.3)',
      }}>
        {fmtEur(paidNow)}
      </div>

      <div style={{ width: 40, height: 1, background: 'rgba(59,109,244,0.2)', margin: '18px auto 14px' }} />

      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: trend >= 0 ? 'var(--accent)' : 'rgba(239,68,68,0.8)' }}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% vs Vorwoche
        </span>
        {overdueCount > 0 && (
          <>
            <span style={{ fontSize: 11, color: 'rgba(59,109,244,0.3)' }}>·</span>
            <span style={{ fontSize: 11, color: 'rgba(59,109,244,0.5)' }}>{overdueCount} offen</span>
          </>
        )}
      </div>
    </div>
  )
}
