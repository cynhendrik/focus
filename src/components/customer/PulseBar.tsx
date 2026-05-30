import { useMemo } from 'react'
import { ArrowUpRight, ArrowDownRight, ArrowRight, Flame, CheckSquare } from 'lucide-react'
import { useActivitiesStore } from '@/store/activities.store'
import { useTodosStore } from '@/store/todos.store'
import { useNotesStore } from '@/store/notes.store'
import { useMailStore } from '@/store/mail.store'
import { useDealsStore } from '@/store/deals.store'
import { usePipelineStore } from '@/store/pipeline.store'

// ─────────────────────────────────────────────────────────────────────────────
// Pulse-Bar — surfaces the live account state in a single horizontal row.
//   Heat · Recency · Pipeline · Trend
// Replaces the bare "Letzte Aktivität" subline in CustomerRoute.
// ─────────────────────────────────────────────────────────────────────────────

interface Props { customerId: string }

const DAY = 86_400_000

// Five-bucket heat scale derived from touch count over the last 30 days.
function bucketHeat(touches: number): { dots: number; label: string; tone: 'cold' | 'cool' | 'warm' | 'hot' | 'fire' } {
  if (touches >= 10) return { dots: 5, label: 'Feuer',   tone: 'fire'  }
  if (touches >= 6)  return { dots: 4, label: 'Heiß',    tone: 'hot'   }
  if (touches >= 3)  return { dots: 3, label: 'Warm',    tone: 'warm'  }
  if (touches >= 1)  return { dots: 2, label: 'Kühlt',   tone: 'cool'  }
  return                  { dots: 0, label: 'Kalt',     tone: 'cold'  }
}

const TONE_COLOR: Record<'cold' | 'cool' | 'warm' | 'hot' | 'fire', string> = {
  cold: 'var(--fg-dim)',
  cool: 'var(--info)',
  warm: 'var(--accent)',
  hot:  'oklch(78% 0.18 60)',
  fire: 'oklch(72% 0.21 30)',
}

function formatRecency(ms: number | null): { value: string; sub: string; cold: boolean } {
  if (ms == null) return { value: '—',     sub: 'kein Touch', cold: true  }
  const days = Math.floor((Date.now() - ms) / DAY)
  if (days <= 0) return { value: 'Heute',  sub: 'still',      cold: false }
  if (days === 1) return { value: '1d',     sub: 'still',     cold: false }
  if (days < 30)  return { value: `${days}d`, sub: 'still',   cold: days > 14 }
  if (days < 365) return { value: `${Math.round(days / 30)}mo`, sub: 'still', cold: true }
  return { value: `${Math.round(days / 365)}y`, sub: 'still', cold: true }
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M €`
  if (value >= 1_000)     return `${Math.round(value / 1_000)} k €`
  return `${Math.round(value)} €`
}

export function PulseBar({ customerId }: Props) {
  const activities  = useActivitiesStore(s => s.activities)
  const todos       = useTodosStore(s => s.todos)
  const notes       = useNotesStore(s => s.notes)
  const allEmails   = useMailStore(s => s.emails)
  const customerDeals = useDealsStore(s => s.customerDeals)
  const stages      = usePipelineStore(s => s.stages)

  const stageById = useMemo(() => {
    const m = new Map<string, { isWon: boolean; isLost: boolean }>()
    for (const s of stages) m.set(s.name, { isWon: s.isWon, isLost: s.isLost })
    return m
  }, [stages])

  // ── Collect touch timestamps for THIS customer ─────────────────────────
  const touchTimes = useMemo<number[]>(() => {
    const out: number[] = []
    for (const a of activities) {
      const ts = a.createdAt
      if (ts) {
        const t = new Date(ts).getTime()
        if (!Number.isNaN(t)) out.push(t)
      }
    }
    for (const t of todos) {
      const ts = new Date(t.createdAt).getTime()
      if (!Number.isNaN(ts)) out.push(ts)
    }
    for (const n of notes) {
      const ts = new Date(n.createdAt).getTime()
      if (!Number.isNaN(ts)) out.push(ts)
    }
    for (const e of allEmails) {
      if (e.customerId !== customerId) continue
      const ts = new Date(e.sentAt).getTime()
      if (!Number.isNaN(ts)) out.push(ts)
    }
    return out
  }, [activities, todos, notes, allEmails, customerId])

  // ── Heat (touches in last 30d) ────────────────────────────────────────
  const now = Date.now()
  const window30 = now - 30 * DAY
  const window60 = now - 60 * DAY

  const touchesNow  = touchTimes.filter(t => t >= window30).length
  const touchesPrev = touchTimes.filter(t => t >= window60 && t < window30).length
  const heat = bucketHeat(touchesNow)

  // ── Recency ───────────────────────────────────────────────────────────
  const newest = touchTimes.length > 0 ? Math.max(...touchTimes) : null
  const recency = formatRecency(newest)

  // ── Pipeline ──────────────────────────────────────────────────────────
  const openDeals = useMemo(() => customerDeals.filter(d => {
    const s = stageById.get(d.stage)
    return !s?.isWon && !s?.isLost
  }), [customerDeals, stageById])
  const openValue = openDeals.reduce((sum, d) => sum + (d.value ?? 0), 0)

  // ── Tasks ─────────────────────────────────────────────────────────────
  const openTodos = useMemo(
    () => todos.filter(t => t.status !== 'done' && t.customerId === customerId),
    [todos, customerId],
  )
  const overdueTodos = useMemo(
    () => openTodos.filter(t => t.dueDate && new Date(t.dueDate).getTime() < Date.now()),
    [openTodos],
  )

  // ── Trend (touches this 30d vs prior 30d) ─────────────────────────────
  const trend = useMemo(() => {
    if (touchesPrev === 0 && touchesNow === 0) {
      return { pct: 0, dir: 'flat' as const }
    }
    if (touchesPrev === 0) {
      return { pct: 100, dir: 'up' as const }
    }
    const delta = (touchesNow - touchesPrev) / touchesPrev
    const pct = Math.round(delta * 100)
    if (pct > 10)  return { pct, dir: 'up'   as const }
    if (pct < -10) return { pct, dir: 'down' as const }
    return { pct, dir: 'flat' as const }
  }, [touchesNow, touchesPrev])

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center',
        gap: 0,
        marginTop: 10,
        flexWrap: 'wrap',
      }}
    >
      {/* HEAT */}
      <Cell>
        <HeatDots dots={heat.dots} tone={heat.tone} />
        <CellLabel>{heat.label}</CellLabel>
        {heat.tone === 'fire' && (
          <Flame size={11} style={{ color: TONE_COLOR.fire, marginLeft: -2 }} />
        )}
      </Cell>

      <Sep />

      {/* RECENCY */}
      <Cell>
        <CellValue tone={recency.cold ? 'dim' : 'normal'}>{recency.value}</CellValue>
        <CellLabel>{recency.sub}</CellLabel>
      </Cell>

      <Sep />

      {/* PIPELINE */}
      <Cell>
        {openDeals.length === 0 ? (
          <>
            <CellValue tone="dim">—</CellValue>
            <CellLabel>keine Deals</CellLabel>
          </>
        ) : (
          <>
            <CellValue>{openDeals.length} {openDeals.length === 1 ? 'Deal' : 'Deals'}</CellValue>
            <CellLabel>· {formatCurrency(openValue)} offen</CellLabel>
          </>
        )}
      </Cell>

      <Sep />

      {/* TASKS */}
      <Cell>
        <CheckSquare size={11} strokeWidth={2.4} style={{
          color: overdueTodos.length > 0 ? 'var(--danger)' : openTodos.length > 0 ? 'var(--accent)' : 'var(--fg-dim)',
        }} />
        {openTodos.length === 0 ? (
          <>
            <CellValue tone="dim">—</CellValue>
            <CellLabel>keine Tasks</CellLabel>
          </>
        ) : (
          <>
            <CellValue>{openTodos.length} {openTodos.length === 1 ? 'Task' : 'Tasks'}</CellValue>
            <CellLabel>
              {overdueTodos.length > 0 ? (
                <span style={{ color: 'var(--danger)' }}>
                  · {overdueTodos.length} überfällig
                </span>
              ) : (
                'offen'
              )}
            </CellLabel>
          </>
        )}
      </Cell>

      <Sep />

      {/* TREND */}
      <Cell>
        <TrendIcon dir={trend.dir} />
        <CellValue tone={trend.dir === 'flat' ? 'dim' : 'normal'}>
          {trend.dir === 'flat' ? 'stabil' : `${trend.pct > 0 ? '+' : ''}${trend.pct}%`}
        </CellValue>
        <CellLabel>30 Tage</CellLabel>
      </Cell>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Visual primitives
// ─────────────────────────────────────────────────────────────────────────────

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '4px 12px',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </div>
  )
}

function Sep() {
  return (
    <span style={{
      width: 1, height: 14,
      background: 'var(--border)',
      flexShrink: 0,
    }} />
  )
}

function CellLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: 'var(--fg-dim)',
      fontWeight: 500,
    }}>
      {children}
    </span>
  )
}

function CellValue({ children, tone = 'normal' }: { children: React.ReactNode; tone?: 'normal' | 'dim' }) {
  return (
    <span style={{
      fontSize: 13,
      letterSpacing: '-0.01em',
      color: tone === 'dim' ? 'var(--fg-dim)' : 'var(--fg)',
      fontWeight: 500,
    }}>
      {children}
    </span>
  )
}

function HeatDots({ dots, tone }: { dots: number; tone: 'cold' | 'cool' | 'warm' | 'hot' | 'fire' }) {
  const color = TONE_COLOR[tone]
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
      {[0, 1, 2, 3, 4].map(i => (
        <span
          key={i}
          style={{
            width: 5, height: 5, borderRadius: '50%',
            background: i < dots ? color : 'oklch(100% 0 0 / 0.08)',
            boxShadow: i < dots && tone === 'fire'
              ? `0 0 6px ${color}`
              : 'none',
            transition: 'background 200ms ease',
          }}
        />
      ))}
    </span>
  )
}

function TrendIcon({ dir }: { dir: 'up' | 'down' | 'flat' }) {
  const common = { size: 12, strokeWidth: 2.4 as const }
  if (dir === 'up')   return <ArrowUpRight   {...common} style={{ color: 'var(--ok)' }} />
  if (dir === 'down') return <ArrowDownRight {...common} style={{ color: 'var(--danger)' }} />
  return <ArrowRight {...common} style={{ color: 'var(--fg-dim)' }} />
}
