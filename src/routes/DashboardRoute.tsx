// ─────────────────────────────────────────────────────────────────────────────
// DashboardRoute "Heute" — drei View-Modi: Workspace / Sales / Client.
// Headerbereich ist gemeinsam (Greeting + Datum + Tab-Switcher),
// die Inhalte unterscheiden sich pro Tab.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import {
  Home, TrendingUp, ArrowRight, Reply, Target,
} from 'lucide-react'

import { useCustomersStore } from '@/store/customers.store'
import { useUiStore, type DashboardView } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import { useFinanceStore } from '@/store/finance.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useMailStore } from '@/store/mail.store'
import { useCalendarStore } from '@/store/calendar.store'
import { useTodosStore } from '@/store/todos.store'
import { useCrmStore } from '@/store/crm.store'
import { useDealsStore } from '@/store/deals.store'
import { usePipelineStore } from '@/store/pipeline.store'
import { useLeadsStore } from '@/store/leads.store'
import { useCompanyStore } from '@/store/company.store'

import type { EmailHeader } from '@/types/mail.types'
import type { CalendarEvent } from '@/types/calendar.types'
import type { Todo } from '@/types/todo.types'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

function greeting(): string {
  const h = new Date().getHours()
  if (h >= 5  && h < 11) return 'Guten Morgen'
  if (h >= 11 && h < 14) return 'Guten Mittag'
  if (h >= 14 && h < 18) return 'Guten Tag'
  if (h >= 18 && h < 22) return 'Guten Abend'
  return 'Gute Nacht'
}

function todayLocalIso(): string {
  return new Date().toLocaleDateString('sv')
}

function startOfWeek(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const m = new Date(d)
  m.setHours(0, 0, 0, 0)
  m.setDate(d.getDate() + diff)
  return m
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function fmtKEur(n: number): string {
  if (Math.abs(n) >= 1000) {
    const k = n / 1000
    return k >= 10 ? `${Math.round(k)}` : k.toFixed(1).replace('.', ',')
  }
  return n.toLocaleString('de-DE')
}

function pct(delta: number, base: number): string {
  if (base === 0) return delta > 0 ? '+∞%' : '0%'
  const v = Math.round((delta / base) * 100)
  return `${v > 0 ? '+' : ''}${v}%`
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero + Tab-Switcher

function DashboardHero({ name }: { name: string }) {
  const view             = useUiStore(s => s.dashboardView)
  const setDashboardView = useUiStore(s => s.setDashboardView)
  const salesEnabled     = useCompanyStore(s => s.modules.sales !== false)

  const now = new Date()
  const dateLine = `${WEEKDAYS[now.getDay()]} · ${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      gap: 24, padding: '8px 4px 24px',
    }}>
      <div>
        <h1 style={{
          fontSize: 42, fontWeight: 700, letterSpacing: '-0.025em',
          lineHeight: 1.05, color: 'var(--fg)', margin: 0,
        }}>
          {greeting()}, <span style={{ color: 'var(--accent)' }}>{name}.</span>
        </h1>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginTop: 10,
          fontFamily: 'var(--font-mono)', fontSize: 10.5,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--fg-dim)', fontWeight: 600,
        }}>
          <span>{dateLine}</span>
          <span style={{
            padding: '4px 9px', borderRadius: 99,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            color: 'var(--fg-muted)',
          }}>
            Alles. Jeder Kunde.
          </span>
        </div>
      </div>

      <DashboardTabs view={view} onChange={setDashboardView} salesEnabled={salesEnabled} />
    </div>
  )
}

function DashboardTabs({
  view, onChange, salesEnabled,
}: {
  view: DashboardView
  onChange: (v: DashboardView) => void
  salesEnabled: boolean
}) {
  // Wenn Sales-Modul aus ist, hat der Tab-Switcher nur einen Eintrag — dann
  // gibt's nichts zu schalten und wir blenden ihn ganz aus (weniger Noise).
  if (!salesEnabled) return null

  const tab = (id: DashboardView, label: string, Icon: typeof Home) => {
    const active = view === id
    return (
      <button
        key={id}
        onClick={() => onChange(id)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '8px 14px', borderRadius: 999,
          background: active ? 'var(--accent)' : 'transparent',
          color: active ? 'var(--accent-ink)' : 'var(--fg-muted)',
          border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
          transition: 'background 140ms, color 140ms',
        }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--fg)' }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--fg-muted)' }}
      >
        <Icon size={13} />
        {label}
      </button>
    )
  }

  return (
    <div style={{
      display: 'inline-flex', padding: 3, gap: 0,
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      borderRadius: 999, flexShrink: 0,
    }}>
      {tab('workspace', 'Workspace', Home)}
      {tab('sales',     'Sales',     TrendingUp)}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Card (gemeinsam fuer alle Views)

function KpiCard({
  label, value, hint, accentValue, action, children,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  accentValue?: boolean   // groesse Zahl in lime statt fg
  action?: { label?: string; onClick: () => void }
  children?: React.ReactNode  // Header-Toolbar (z.B. Woche/Monat-Toggle)
}) {
  return (
    <div style={{
      borderRadius: 16, border: '1px solid var(--border)',
      background: 'var(--bg-2)', padding: '18px 20px',
      display: 'flex', flexDirection: 'column', gap: 12,
      position: 'relative', minHeight: 152,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--fg-dim)', fontWeight: 600,
        }}>
          {label}
        </span>
        {children}
        {action && (
          <button
            onClick={action.onClick}
            title={action.label}
            style={{
              width: 26, height: 26, borderRadius: 99,
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--fg-dim)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 140ms, border-color 140ms',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'var(--fg)'
              e.currentTarget.style.borderColor = 'var(--border-strong)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--fg-dim)'
              e.currentTarget.style.borderColor = 'var(--border)'
            }}
          >
            <ArrowRight size={12} />
          </button>
        )}
      </div>

      <div style={{
        fontSize: 48, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.04em',
        color: accentValue ? 'var(--accent)' : 'var(--fg)',
        fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>

      {hint && (
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {hint}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// WorkspaceView — KPIs + Tagesplan + Inbox

function WorkspaceView() {
  const customers = useCustomersStore(s => s.customers)
  const invoices  = useFinanceStore(s => s.invoices)
  const todos     = useTodosStore(s => s.allTodos)
  const followUps = useCrmStore(s => s.allFollowUps)
  const events    = useCalendarStore(s => s.todayEvents)
  const setAppView = useUiStore(s => s.setAppView)

  const [revRange, setRevRange] = useState<'week' | 'month'>('week')

  // Umsatz
  const { paidNow, paidPrev, label, hintPrevLabel } = useMemo(() => {
    const now = new Date()
    let rangeStart: Date
    let prevStart: Date
    let prevEnd:   Date
    let label:     string
    let hintPrevLabel: string

    if (revRange === 'week') {
      rangeStart = startOfWeek(now)
      const prevWeek = new Date(rangeStart); prevWeek.setDate(prevWeek.getDate() - 7)
      prevStart = prevWeek
      prevEnd   = new Date(rangeStart)
      label = 'diese Woche'
      hintPrevLabel = 'vs Vorwoche'
    } else {
      rangeStart = startOfMonth(now)
      const prevMonth = new Date(rangeStart); prevMonth.setMonth(prevMonth.getMonth() - 1)
      prevStart = prevMonth
      prevEnd   = new Date(rangeStart)
      label = 'diesen Monat'
      hintPrevLabel = 'vs Vormonat'
    }

    let paidNow = 0
    let paidPrev = 0
    for (const inv of invoices) {
      if (inv.status !== 'paid') continue
      const ts = new Date(inv.date)
      if (ts >= rangeStart && ts <= now) paidNow += inv.total
      else if (ts >= prevStart && ts < prevEnd) paidPrev += inv.total
    }
    return { paidNow, paidPrev, label, hintPrevLabel }
  }, [invoices, revRange])

  // Aktive Kunden — alle nicht-privaten, +Anzahl der diese Woche neu erstellten
  const activeCount = useMemo(
    () => customers.filter(c => !c.isPrivate).length,
    [customers],
  )
  const newThisWeek = useMemo(() => {
    const sow = startOfWeek(new Date()).toISOString()
    return customers.filter(c => !c.isPrivate && c.createdAt && c.createdAt >= sow).length
  }, [customers])

  // Heute faellig
  const todayIso = todayLocalIso()
  const dueToday = useMemo(() => {
    const tasks = todos.filter(t => t.status !== 'done' && t.dueDate === todayIso).length
    const fus = followUps.filter(f => f.status === 'offen' && f.dueDate <= todayIso).length
    return { tasks, fus, total: tasks + fus + events.length }
  }, [todos, followUps, events, todayIso])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18,
      }}>
        <KpiCard
          label="Umsatz"
          value={
            <span>
              {fmtKEur(paidNow)}
              <span style={{
                fontSize: 22, color: 'var(--fg-dim)', marginLeft: 2,
                fontFamily: 'var(--font-mono)', fontWeight: 600,
              }}>
                k€
              </span>
            </span>
          }
          hint={
            <>
              <span style={{ color: paidNow >= paidPrev ? 'var(--accent)' : 'oklch(72% 0.18 25)', fontWeight: 600 }}>
                {paidPrev === 0 ? (paidNow > 0 ? '+100%' : '—') : pct(paidNow - paidPrev, paidPrev)}
              </span>
              <span style={{ color: 'var(--fg-dim)' }}>·</span>
              <span>{hintPrevLabel}</span>
              <span style={{ color: 'var(--fg-dim)', marginLeft: 'auto' }}>{label}</span>
            </>
          }
        >
          <WeekMonthToggle range={revRange} onChange={setRevRange} />
        </KpiCard>

        <KpiCard
          label="Aktive Kunden"
          value={String(activeCount)}
          hint={
            <>
              <span style={{ color: newThisWeek > 0 ? 'var(--accent)' : 'var(--fg-dim)', fontWeight: 600 }}>
                {newThisWeek > 0 ? `+${newThisWeek}` : '0'}
              </span>
              <span style={{ color: 'var(--fg-dim)' }}>·</span>
              <span>diese Woche</span>
            </>
          }
          action={{ label: 'Zu Clients', onClick: () => setAppView('clients') }}
        />

        <KpiCard
          label="Heute fällig"
          value={String(dueToday.total)}
          accentValue={dueToday.total > 0}
          hint={
            <>
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{dueToday.tasks} Tasks</span>
              <span style={{ color: 'var(--fg-dim)' }}>·</span>
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{dueToday.fus} FU</span>
              <span style={{ color: 'var(--fg-dim)' }}>·</span>
              <span>{events.length} Termine</span>
            </>
          }
          action={{ label: 'Zum Kalender', onClick: () => setAppView('calendar') }}
        />
      </div>

      <TagesplanCard events={events} todos={todos} customers={customers} />

      <InboxCard />
    </div>
  )
}

function WeekMonthToggle({
  range, onChange,
}: { range: 'week' | 'month'; onChange: (r: 'week' | 'month') => void }) {
  const btn = (id: 'week' | 'month', label: string) => {
    const active = range === id
    return (
      <button
        onClick={() => onChange(id)}
        style={{
          padding: '4px 11px', borderRadius: 99,
          background: active ? 'var(--accent)' : 'transparent',
          color: active ? 'var(--accent-ink)' : 'var(--fg-muted)',
          border: 'none', cursor: 'pointer',
          fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700,
          letterSpacing: '0.10em', textTransform: 'uppercase',
        }}
      >
        {label}
      </button>
    )
  }
  return (
    <div style={{
      display: 'inline-flex', padding: 2, gap: 2,
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      borderRadius: 99,
    }}>
      {btn('week', 'Woche')}
      {btn('month', 'Monat')}
    </div>
  )
}

// ── Tagesplan ───────────────────────────────────────────────────────────────

interface PlanItem {
  id:       string
  time:     string     // HH:MM
  title:    string
  subtitle: string
  status:   { kind: 'now' | 'block' | 'pause' | 'live' | 'fokus' | 'short'; label: string }
}

function buildTagesplan(events: CalendarEvent[], todos: Todo[]): PlanItem[] {
  const now = new Date()
  const items: PlanItem[] = []

  // Termine heute → mit Zeit
  for (const ev of events) {
    const start = new Date(ev.startAt)
    const end = ev.endAt ? new Date(ev.endAt) : new Date(start.getTime() + 60 * 60_000)
    const isNow = start <= now && end >= now
    const minutes = Math.round((end.getTime() - start.getTime()) / 60_000)
    let status: PlanItem['status']
    if (isNow) status = { kind: 'now', label: 'Jetzt' }
    else if (minutes >= 60) status = { kind: 'block', label: `Block · ${Math.round(minutes / 60)}h` }
    else status = { kind: 'short', label: `${minutes}m` }

    items.push({
      id: `ev-${ev.id}`,
      time: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
      title: ev.title || '(Termin)',
      subtitle: ev.location || ev.description || '',
      status,
    })
  }

  // Heute fällige Tasks (ohne Uhrzeit → ohne Zeit-Label)
  const todayIso = todayLocalIso()
  for (const t of todos) {
    if (t.status === 'done') continue
    if (t.dueDate !== todayIso) continue
    items.push({
      id: `t-${t.id}`,
      time: '',
      title: t.title,
      subtitle: t.priority === 'p1' || t.priority === 'p2' ? 'Hohe Prio' : '',
      status: { kind: 'fokus', label: 'Fokus' },
    })
  }

  // Sortieren: Termine mit Zeit aufsteigend, Tasks ohne Zeit ans Ende
  return items.sort((a, b) => {
    if (!a.time && b.time) return 1
    if (a.time && !b.time) return -1
    return a.time.localeCompare(b.time)
  })
}

function statusPillStyle(kind: PlanItem['status']['kind']): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '4px 11px', borderRadius: 99,
    fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700,
    letterSpacing: '0.12em', textTransform: 'uppercase',
  }
  switch (kind) {
    case 'now':   return { ...base, background: 'var(--accent)',                  color: 'var(--accent-ink)' }
    case 'block': return { ...base, background: 'oklch(78% 0.13 235 / 0.18)',     color: 'oklch(78% 0.13 235)' }
    case 'pause': return { ...base, background: 'var(--surface-2)',               color: 'var(--fg-muted)' }
    case 'live':  return { ...base, background: 'oklch(72% 0.18 25 / 0.15)',      color: 'oklch(72% 0.18 25)' }
    case 'fokus': return { ...base, background: 'oklch(82% 0.16 70 / 0.15)',      color: 'oklch(82% 0.16 70)' }
    case 'short': return { ...base, background: 'var(--surface-2)',               color: 'var(--fg-dim)' }
  }
}

function TagesplanCard({
  events, todos, customers: _customers,
}: { events: CalendarEvent[]; todos: Todo[]; customers: unknown[] }) {
  const items = useMemo(() => buildTagesplan(events, todos), [events, todos])

  return (
    <div style={{
      borderRadius: 16, border: '1px solid var(--border)',
      background: 'var(--bg-2)', padding: '20px 22px',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 16,
      }}>
        <h2 style={{
          margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--fg)',
          letterSpacing: '-0.01em',
        }}>
          Mein Tagesplan
        </h2>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5,
          color: 'var(--fg-dim)', letterSpacing: '0.04em',
        }}>
          {items.length} {items.length === 1 ? 'Eintrag' : 'Einträge'} · heute
        </span>
      </div>

      {items.length === 0 ? (
        <div style={{
          padding: '20px 8px', textAlign: 'center', color: 'var(--fg-dim)', fontSize: 12.5,
        }}>
          Keine Termine, keine fälligen Tasks. Tag offen.
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          {/* Spine */}
          <div style={{
            position: 'absolute', left: 75, top: 6, bottom: 6, width: 1,
            background: 'var(--border)',
          }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {items.map(item => <TagesplanRow key={item.id} item={item} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function TagesplanRow({ item }: { item: PlanItem }) {
  const isNow = item.status.kind === 'now'
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '60px 30px 1fr auto',
      alignItems: 'center', gap: 12, padding: '12px 0',
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 11,
        color: isNow ? 'var(--accent)' : 'var(--fg-dim)',
        fontWeight: isNow ? 700 : 500, letterSpacing: '0.04em',
      }}>
        {item.time || '—'}
      </span>
      <div style={{ display: 'flex', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
        <span style={{
          width: 10, height: 10, borderRadius: 99,
          background: isNow ? 'var(--accent)' : 'transparent',
          border: `1.5px solid ${isNow ? 'var(--accent)' : 'var(--border-strong)'}`,
          boxShadow: isNow ? '0 0 0 4px oklch(92% 0.2 125 / 0.16)' : 'none',
        }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{
          fontSize: 13.5, fontWeight: 600, color: 'var(--fg)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.title}
        </span>
        {item.subtitle && (
          <span style={{
            fontSize: 11.5, color: 'var(--fg-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {item.subtitle}
          </span>
        )}
      </div>
      <span style={statusPillStyle(item.status.kind)}>{item.status.label}</span>
    </div>
  )
}

// ── Inbox-Card ──────────────────────────────────────────────────────────────

function InboxCard() {
  const emails            = useMailStore(s => s.emails)
  const loadEmails        = useMailStore(s => s.loadEmails)
  const selectEmail       = useMailStore(s => s.selectEmail)
  const selectedAccountId = useMailStore(s => s.selectedAccountId)
  const setAppView        = useUiStore(s => s.setAppView)
  const customers         = useCustomersStore(s => s.customers)

  useEffect(() => {
    if (selectedAccountId && emails.length === 0) loadEmails()
  }, [selectedAccountId, emails.length, loadEmails])

  const customerByEmail = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of customers) if (c.email) m.set(c.email.toLowerCase(), c.name)
    return m
  }, [customers])

  const sorted = useMemo(
    () => [...emails].sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || '')),
    [emails],
  )

  return (
    <div style={{
      borderRadius: 16, border: '1px solid var(--border)',
      background: 'var(--bg-2)',
      display: 'flex', flexDirection: 'column', minHeight: 0,
      maxHeight: 480, overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        padding: '20px 22px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <h2 style={{
          margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--fg)',
          letterSpacing: '-0.01em',
        }}>
          Inbox
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10.5,
            color: 'var(--fg-dim)', letterSpacing: '0.04em',
          }}>
            {sorted.length} {sorted.length === 1 ? 'Mail' : 'Mails'}
          </span>
          <button
            onClick={() => setAppView('mail')}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 8,
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--fg-muted)', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 11.5,
            }}
          >
            Alle <ArrowRight size={11} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '6px 14px 12px' }}>
        {sorted.length === 0 ? (
          <div style={{ padding: '28px 12px', textAlign: 'center', color: 'var(--fg-dim)', fontSize: 12.5 }}>
            {selectedAccountId ? 'Inbox leer' : 'Kein Mail-Konto verbunden'}
          </div>
        ) : (
          sorted.map(e => (
            <InboxRow
              key={e.id}
              email={e}
              customerName={customerByEmail.get(e.fromAddr?.toLowerCase() ?? '') ?? null}
              onClick={() => { selectEmail(e); setAppView('mail') }}
            />
          ))
        )}
      </div>
    </div>
  )
}

function InboxRow({
  email, customerName, onClick,
}: {
  email: EmailHeader
  customerName: string | null
  onClick: () => void
}) {
  const time = new Date(email.sentAt)
  const today = new Date()
  const isToday = time.toDateString() === today.toDateString()
  const timeLabel = isToday
    ? `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
    : time.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })

  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid', gridTemplateColumns: '1fr auto', gap: 12,
        alignItems: 'center', padding: '10px 8px', borderRadius: 10,
        cursor: 'pointer', transition: 'background 140ms',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{
          fontSize: 13, fontWeight: 600, color: 'var(--fg)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {customerName ?? email.fromName ?? email.fromAddr}
        </span>
        <span style={{
          fontSize: 11.5, color: 'var(--fg-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {email.subject || '(ohne Betreff)'}
        </span>
      </div>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10.5,
        color: 'var(--fg-dim)', letterSpacing: '0.04em', flexShrink: 0,
      }}>
        {timeLabel}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SalesView — Pipeline, Follow-Ups, Neue Leads

function SalesView() {
  const deals     = useDealsStore(s => s.deals)
  const stages    = usePipelineStore(s => s.stages)
  const followUps = useCrmStore(s => s.allFollowUps)
  const leads     = useLeadsStore(s => s.leads)
  const setAppView = useUiStore(s => s.setAppView)

  const openDeals = useMemo(() => {
    const byName = new Map(stages.map(s => [s.name, s]))
    return deals.filter(d => {
      const s = byName.get(d.stage)
      return !s || (!s.isWon && !s.isLost)
    })
  }, [deals, stages])
  const pipelineValue = openDeals.reduce((s, d) => s + (d.value ?? 0), 0)
  const wonValue = useMemo(() => {
    const wonName = stages.find(s => s.isWon)?.name
    if (!wonName) return 0
    return deals.filter(d => d.stage === wonName).reduce((s, d) => s + (d.value ?? 0), 0)
  }, [deals, stages])

  // Stage-Breakdown (nur offene Stages)
  const stageBreakdown = useMemo(() => {
    const open = stages.filter(s => !s.isWon && !s.isLost).sort((a, b) => a.orderIndex - b.orderIndex)
    return open.map(s => ({
      stage: s,
      count: deals.filter(d => d.stage === s.name).length,
      value: deals.filter(d => d.stage === s.name).reduce((sum, d) => sum + (d.value ?? 0), 0),
    }))
  }, [stages, deals])

  const todayIso = todayLocalIso()
  const fuDueOrOverdue = useMemo(
    () => followUps
      .filter(f => f.status === 'offen' && f.dueDate <= todayIso)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 8),
    [followUps, todayIso],
  )

  const newLeadsThisWeek = useMemo(() => {
    const sow = startOfWeek(new Date()).toISOString()
    return leads
      .filter(l => l.createdAt >= sow)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 8)
  }, [leads])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPI-Zeile */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18,
      }}>
        <KpiCard
          label="Pipeline-Wert"
          value={
            <span>
              {fmtKEur(pipelineValue)}
              <span style={{ fontSize: 22, color: 'var(--fg-dim)', marginLeft: 2, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>k€</span>
            </span>
          }
          hint={<><span style={{ color: 'var(--accent)', fontWeight: 600 }}>{openDeals.length}</span><span>offene Deals</span></>}
          action={{ label: 'Zur Pipeline', onClick: () => setAppView('pipeline') }}
        />
        <KpiCard
          label="Gewonnen"
          value={
            <span>
              {fmtKEur(wonValue)}
              <span style={{ fontSize: 22, color: 'var(--fg-dim)', marginLeft: 2, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>k€</span>
            </span>
          }
          hint={<span>kumuliert</span>}
        />
        <KpiCard
          label="Fällige Follow-Ups"
          value={String(fuDueOrOverdue.length)}
          accentValue={fuDueOrOverdue.length > 0}
          hint={<span>heute oder überfällig</span>}
          action={{ label: 'Zu Follow-Ups', onClick: () => setAppView('followups') }}
        />
      </div>

      {/* Pipeline-Stage-Breakdown */}
      <div style={{
        borderRadius: 16, border: '1px solid var(--border)',
        background: 'var(--bg-2)', padding: '20px 22px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.01em' }}>
            Pipeline-Verteilung
          </h2>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-dim)' }}>
            {stageBreakdown.length} Stages
          </span>
        </div>

        {stageBreakdown.length === 0 ? (
          <div style={{ padding: '20px 8px', textAlign: 'center', color: 'var(--fg-dim)', fontSize: 12.5 }}>
            Noch keine Stages konfiguriert.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stageBreakdown.length}, 1fr)`, gap: 10 }}>
            {stageBreakdown.map(({ stage, count, value }) => (
              <div
                key={stage.id}
                onClick={() => setAppView('pipeline')}
                style={{
                  padding: 14, borderRadius: 12,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', gap: 6,
                  transition: 'border-color 140ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.10em',
                  textTransform: 'uppercase', color: 'var(--fg-dim)', fontWeight: 700,
                }}>
                  {stage.label}
                </span>
                <span style={{
                  fontSize: 28, fontWeight: 700, color: 'var(--fg)',
                  fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                }}>
                  {count}
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
                  {value > 0 ? `${fmtKEur(value)} k€` : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Zwei-Spalten: Follow-Ups + Neue Leads */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div style={{
          borderRadius: 16, border: '1px solid var(--border)',
          background: 'var(--bg-2)', padding: '20px 22px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>
              Fällige Follow-Ups
            </h2>
            <Reply size={13} style={{ color: 'var(--fg-dim)' }} />
          </div>
          {fuDueOrOverdue.length === 0 ? (
            <div style={{ padding: '10px 4px', color: 'var(--fg-dim)', fontSize: 12.5 }}>
              Keine offenen Follow-Ups.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {fuDueOrOverdue.map(f => {
                const isOverdue = f.dueDate < todayIso
                return (
                  <div
                    key={f.id}
                    onClick={() => setAppView('followups')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 12px', borderRadius: 10,
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{
                      width: 6, height: 6, borderRadius: 99,
                      background: isOverdue ? 'oklch(72% 0.18 25)' : 'var(--accent)',
                      flexShrink: 0,
                    }} />
                    <span style={{
                      flex: 1, fontSize: 13, color: 'var(--fg)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {f.title}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10.5,
                      color: isOverdue ? 'oklch(72% 0.18 25)' : 'var(--fg-dim)',
                    }}>
                      {isOverdue ? 'überfällig' : 'heute'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div style={{
          borderRadius: 16, border: '1px solid var(--border)',
          background: 'var(--bg-2)', padding: '20px 22px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>
              Neue Leads · diese Woche
            </h2>
            <Target size={13} style={{ color: 'var(--fg-dim)' }} />
          </div>
          {newLeadsThisWeek.length === 0 ? (
            <div style={{ padding: '10px 4px', color: 'var(--fg-dim)', fontSize: 12.5 }}>
              Keine neuen Leads.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {newLeadsThisWeek.map(l => (
                <div
                  key={l.id}
                  onClick={() => setAppView('leads')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px', borderRadius: 10,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{
                    flex: 1, fontSize: 13, color: 'var(--fg)', fontWeight: 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {l.name}
                  </span>
                  {l.companyName && (
                    <span style={{
                      fontSize: 11.5, color: 'var(--fg-muted)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      · {l.companyName}
                    </span>
                  )}
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10.5,
                    color: 'var(--fg-dim)', letterSpacing: '0.04em', flexShrink: 0,
                  }}>
                    {new Date(l.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main route

export function DashboardRoute() {
  const view             = useUiStore(s => s.dashboardView)
  const setDashboardView = useUiStore(s => s.setDashboardView)
  const user             = useAuthStore(s => s.user)
  const workspaceId      = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const salesEnabled     = useCompanyStore(s => s.modules.sales !== false)

  // Data loads — sind in App.tsx schon in den beiden Init-Wellen,
  // hier nur Finance ergaenzen, weil das nicht workspace-weit geladen wird.
  const loadFinance = useFinanceStore(s => s.loadAll)
  const loadToday   = useCalendarStore(s => s.loadToday)
  useEffect(() => {
    if (!workspaceId) return
    loadFinance(workspaceId)
    loadToday(workspaceId)
  }, [workspaceId, loadFinance, loadToday])

  // Falls Sales-Modul deaktiviert ist, aber dashboardView='sales' persistiert,
  // korrigieren wir das beim ersten Render.
  useEffect(() => {
    if (view === 'sales' && !salesEnabled) setDashboardView('workspace')
  }, [view, salesEnabled, setDashboardView])

  const firstName = (user?.email?.split('@')[0] ?? 'User').replace(/^./, c => c.toUpperCase())

  return (
    <div className="main-inner" style={{
      maxWidth: 1240, margin: '0 auto', padding: '24px 28px 64px',
    }}>
      <DashboardHero name={firstName} />

      {view === 'sales' && salesEnabled
        ? <SalesView />
        : <WorkspaceView />}
    </div>
  )
}
