import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import type { Customer } from '@/types/customer.types'
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart,
} from 'recharts'

// ── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: string
  label: string
  value: string | number
  sub: string
  warn?: boolean
}

function StatCard({ icon, label, value, sub, warn }: StatCardProps) {
  return (
    <div className="p-5 rounded-2xl bg-[var(--bg1)] border border-[var(--border)] flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[var(--text2)] text-xs">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="flex items-end gap-1.5">
        <span className={`text-2xl font-bold ${warn ? 'text-amber-400' : 'text-[var(--text)]'}`}>
          {value}
        </span>
      </div>
      <p className="text-xs text-[var(--text2)]">{sub}</p>
    </div>
  )
}

// ── Attention Score ───────────────────────────────────────────────────────────

function attentionScore(c: Customer): number {
  let score = 75
  if (c.priority === 'high') score -= 30
  if (c.status === 'inaktiv') score -= 20
  if (c.status === 'lead') score -= 10
  if (c.status === 'lost') score -= 40
  return Math.max(10, Math.min(99, score))
}

function scoreBadge(score: number): { label: string; cls: string } {
  if (score < 50) return { label: 'Urgent', cls: 'bg-red-500/15 text-red-400 border border-red-500/20' }
  return { label: 'Soon', cls: 'bg-amber-500/15 text-amber-400 border border-amber-500/20' }
}

interface AttentionRowProps {
  customer: Customer
  onClick: () => void
}

function AttentionRow({ customer, onClick }: AttentionRowProps) {
  const score = attentionScore(customer)
  const badge = scoreBadge(score)
  const descMap: Record<string, string> = {
    inaktiv: 'Kein Kontakt seit längerem',
    lead: 'Noch nicht konvertiert',
    lost: 'Kunde verloren — Nachfassen',
    aktiv: 'Hohe Priorität gesetzt',
  }

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-[var(--bg2)] transition-colors text-left"
    >
      {/* Score circle */}
      <div
        className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
        style={{
          background: `conic-gradient(#DC2626 ${score * 3.6}deg, #3A3A3F ${score * 3.6}deg)`,
        }}
      >
        <div className="w-8 h-8 rounded-full bg-[var(--bg1)] flex items-center justify-center text-xs font-bold text-[var(--text)]">
          {score}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-[var(--text)] truncate">{customer.name}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>
            {badge.label}
          </span>
        </div>
        <p className="text-xs text-[var(--text2)] mt-0.5 flex items-center gap-1">
          <span>⚠</span>
          <span>{descMap[customer.status] ?? 'Aufmerksamkeit erforderlich'}</span>
        </p>
      </div>

      <span className="text-[var(--text2)] text-sm">→</span>
    </button>
  )
}

// ── Revenue Chart (mock data) ─────────────────────────────────────────────────

const REVENUE_DATA = [
  { day: 'Mon', value: 1200 },
  { day: 'Tue', value: 1950 },
  { day: 'Wed', value: 2100 },
  { day: 'Thu', value: 2600 },
  { day: 'Fri', value: 1800 },
  { day: 'Sat', value: 900 },
  { day: 'Sun', value: 650 },
]
const TOTAL_REVENUE = REVENUE_DATA.reduce((s, d) => s + d.value, 0)

function RevenueChart() {
  return (
    <div className="p-5 rounded-2xl bg-[var(--bg1)] border border-[var(--border)] flex flex-col gap-4 h-full">
      <h2 className="text-sm font-semibold text-[var(--text)]">Revenue This Week</h2>
      <div className="flex-1" style={{ minHeight: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={REVENUE_DATA} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#DC2626" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#DC2626" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10, fill: 'var(--text2)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--text2)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--bg2)',
                border: '1px solid var(--border2)',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--text)',
              }}
              formatter={(v) => [`€${Number(v).toLocaleString('de-DE')}`, 'Revenue']}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#DC2626"
              strokeWidth={2}
              fill="url(#revGradient)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="border-t border-[var(--border)] pt-3">
        <p className="text-xs text-[var(--text2)]">Total this week</p>
        <p className="text-xl font-bold text-[var(--text)] mt-0.5">
          €{TOTAL_REVENUE.toLocaleString('de-DE')}
        </p>
      </div>
    </div>
  )
}

// ── High Priority Task Card ───────────────────────────────────────────────────

function TaskCard({ customer, onClick }: { customer: Customer; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col gap-2 p-4 rounded-xl bg-[var(--bg1)] border border-[var(--border)] hover:border-primary/30 text-left transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-[var(--text)] leading-snug flex-1">
          {customer.name} — Aufmerksamkeit erforderlich
        </p>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium flex-shrink-0 border border-primary/20">
          Heute
        </span>
      </div>
      {customer.company && (
        <span className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--bg2)] text-[var(--text2)] w-fit">
          {customer.company}
        </span>
      )}
      <p className="text-xs text-[var(--text2)] flex items-center gap-1">
        <span>→</span>
        <span>Zum Kunden</span>
      </p>
    </button>
  )
}

// ── Dashboard Route ───────────────────────────────────────────────────────────

export function DashboardRoute() {
  const customers = useCustomersStore(s => s.customers)
  const setSelected = useUiStore(s => s.setSelectedCustomer)

  const aktiv = customers.filter(c => c.status === 'aktiv').length
  const highPrio = customers.filter(c => c.priority === 'high')

  const attention = [...customers]
    .sort((a, b) => attentionScore(a) - attentionScore(b))
    .slice(0, 3)

  const taskItems = highPrio.slice(0, 4)

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="px-8 pt-7 pb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Willkommen zurück</h1>
          <p className="text-sm text-[var(--text2)] mt-1">Hier ist, was heute deine Aufmerksamkeit braucht</p>
        </div>
        <div className="flex gap-2">
          <button className="w-9 h-9 rounded-xl bg-[var(--bg1)] border border-[var(--border)] flex items-center justify-center text-[var(--text2)] hover:text-[var(--text)] transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button className="w-9 h-9 rounded-xl bg-[var(--bg1)] border border-[var(--border)] flex items-center justify-center text-[var(--text2)] hover:text-[var(--text)] transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </button>
        </div>
      </div>

      <div className="px-8 pb-8 flex flex-col gap-6">
        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            icon="⏱"
            label="Time Today"
            value="—"
            sub="Zeiterfassung starten"
          />
          <StatCard
            icon="€"
            label="This Week"
            value={`€${(TOTAL_REVENUE / 1000).toFixed(1)}K`}
            sub="+18% vs last week"
          />
          <StatCard
            icon="◎"
            label="Active Clients"
            value={aktiv}
            sub={`Needs attention: ${highPrio.length}`}
          />
          <StatCard
            icon="⚠"
            label="Open Tasks"
            value={highPrio.length}
            sub={`High priority: ${highPrio.length}`}
            warn={highPrio.length > 0}
          />
        </div>

        {/* Middle section */}
        <div className="grid grid-cols-5 gap-5">
          {/* Clients needing attention */}
          <div className="col-span-3 p-5 rounded-2xl bg-[var(--bg1)] border border-[var(--border)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[var(--text)]">Clients Needing Attention</h2>
              {attention.length > 0 && (
                <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold">
                  {attention.length}
                </span>
              )}
            </div>

            {attention.length === 0 ? (
              <p className="text-sm text-[var(--text2)] text-center py-8">Alles im grünen Bereich ✓</p>
            ) : (
              <div className="flex flex-col divide-y divide-[var(--border)]">
                {attention.map(c => (
                  <AttentionRow
                    key={c.id}
                    customer={c}
                    onClick={() => setSelected(c.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Revenue chart */}
          <div className="col-span-2">
            <RevenueChart />
          </div>
        </div>

        {/* High priority tasks */}
        {taskItems.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[var(--text)]">High Priority Tasks</h2>
              <button
                onClick={() => useUiStore.getState().setAppView('clients')}
                className="text-xs text-[var(--text2)] hover:text-primary transition-colors flex items-center gap-1"
              >
                View All <span>→</span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {taskItems.map(c => (
                <TaskCard key={c.id} customer={c} onClick={() => setSelected(c.id)} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
