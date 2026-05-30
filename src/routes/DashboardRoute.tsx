import { useEffect, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Calendar as CalIcon, FileText, AlertTriangle, CheckCircle2, ArrowRight, Inbox, Bell } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import { useFinanceStore } from '@/store/finance.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useMailStore } from '@/store/mail.store'
import { useCalendarStore } from '@/store/calendar.store'
import { useTodosStore } from '@/store/todos.store'
import { useCrmStore } from '@/store/crm.store'

import { DayTimeline } from '@/components/dashboard/DayTimeline'
import { AccountSignals } from '@/components/dashboard/AccountSignals'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { Skeleton } from '@/components/ui/Skeleton'

import {
  computePriorities,
  upcomingTasks,
  type PriorityItem,
  type PriorityKind,
} from '@/lib/dailyPriorities'
import type { EmailHeader } from '@/types/mail.types'

// ─────────────────────────────────────────────────────────────────────────────
// helpers

const DAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

function getGreeting(): string {
  const h = new Date().getHours()
  if (h >= 5  && h < 11) return 'Guten Morgen'
  if (h >= 11 && h < 14) return 'Guten Mittag'
  if (h >= 14 && h < 18) return 'Guten Tag'
  if (h >= 18 && h < 22) return 'Guten Abend'
  return 'Gute Nacht'
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n)
}

function formatDue(iso: string): string {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  const d = new Date(iso)
  const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0)
  if (dayStart < today) return 'überfällig'
  if (dayStart.getTime() === today.getTime()) return 'heute'
  if (dayStart.getTime() === tomorrow.getTime()) return 'morgen'
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
}

// ─────────────────────────────────────────────────────────────────────────────
// PriorityCard — the three big cards at the top

const KIND_META: Record<PriorityKind, { label: string; icon: LucideIcon; tone: 'accent' | 'warn' | 'bad' | 'info' }> = {
  meeting:          { label: 'MEETING',     icon: CalIcon,      tone: 'accent' },
  overdue_task:     { label: 'TASK',        icon: AlertTriangle, tone: 'bad'    },
  today_task:       { label: 'TASK',        icon: CheckCircle2, tone: 'accent' },
  tomorrow_task:    { label: 'TASK MORGEN', icon: CheckCircle2, tone: 'info'   },
  overdue_invoice:  { label: 'RECHNUNG',    icon: FileText,     tone: 'warn'   },
  followup_due:     { label: 'FOLLOW-UP',   icon: Bell,         tone: 'info'   },
}

function PriorityCard({ item, index, onClick }: {
  item: PriorityItem
  index: number
  onClick: () => void
}) {
  const meta = KIND_META[item.kind]
  const Icon = meta.icon
  const isHero = index === 0
  return (
    <div
      className="prio-card"
      data-tone={isHero ? 'hero' : ''}
      onClick={onClick}
      style={{ animationDelay: `${60 + index * 70}ms` }}
    >
      <div className="prio-num">
        <Icon size={11} />
        <span style={{ marginLeft: 2 }}>{meta.label}</span>
      </div>
      <h3 className="prio-title">{item.title}</h3>
      {item.meta && <p className="prio-meta">{item.meta}</p>}
      <div className="prio-foot">
        {item.hint && <span className="prio-chip">{item.hint}</span>}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          öffnen <ArrowRight size={11} />
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SectionCard — a labelled card container

function SectionCard({
  title, count, children, empty, accent,
}: {
  title: string
  count?: number
  children: React.ReactNode
  empty?: string
  accent?: React.ReactNode
}) {
  const isEmpty = count === 0
  return (
    <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14.5, fontWeight: 600, margin: 0, letterSpacing: '-0.005em' }}>
          {title}
          {count !== undefined && count > 0 && (
            <span className="count" style={{
              fontFamily: 'var(--font-mono)', fontSize: 10.5,
              color: 'var(--fg-dim)', fontWeight: 500, letterSpacing: '0.06em',
              background: 'oklch(100% 0 0 / 0.04)', padding: '2px 7px', borderRadius: 99,
            }}>
              {String(count).padStart(2, '0')}
            </span>
          )}
        </h2>
        {accent}
      </div>
      {isEmpty
        ? <p className="empty" style={{ padding: '20px 0', fontSize: 12.5 }}>{empty ?? 'Alles klar.'}</p>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Row components

function TaskRow({ title, customerName, due, onClick }: {
  title: string
  customerName?: string
  due?: string
  onClick: () => void
}) {
  const dueLabel = due ? formatDue(due) : undefined
  const isOverdue = dueLabel === 'überfällig'
  const isToday   = dueLabel === 'heute'
  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid', gridTemplateColumns: '1fr auto',
        alignItems: 'center', gap: 12,
        padding: '9px 6px', borderRadius: 10,
        cursor: 'pointer',
        transition: 'background 180ms ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'oklch(100% 0 0 / 0.04)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </span>
        {customerName && (
          <span style={{ fontSize: 11.5, color: 'var(--fg-dim)', marginTop: 1 }}>{customerName}</span>
        )}
      </div>
      {dueLabel && (
        <span
          className="chip"
          data-tone={isOverdue ? 'bad' : isToday ? 'accent' : ''}
          style={{ flexShrink: 0 }}
        >
          {dueLabel}
        </span>
      )}
    </div>
  )
}

function MailRow({ email, customerName, onClick }: {
  email: EmailHeader
  customerName?: string
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
        display: 'grid', gridTemplateColumns: '1fr auto',
        alignItems: 'center', gap: 12,
        padding: '9px 6px', borderRadius: 10,
        cursor: 'pointer',
        transition: 'background 180ms ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'oklch(100% 0 0 / 0.04)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {customerName ?? email.fromName ?? email.fromAddr}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {email.subject || '(ohne Betreff)'}
        </span>
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-dim)', letterSpacing: '0.04em', flexShrink: 0 }}>
        {timeLabel}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton placeholders — shown during initial data load

function PrioritySkeleton() {
  return (
    <div className="priorities">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="prio-card"
          style={{ animation: 'none', cursor: 'default', pointerEvents: 'none' }}
        >
          <Skeleton width={80} height={11} radius={4} style={{ marginBottom: 16 }} />
          <Skeleton width="80%" height={22} radius={6} style={{ marginBottom: 8 }} />
          <Skeleton width="50%" height={13} radius={6} style={{ marginBottom: 16 }} />
          <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between' }}>
            <Skeleton width={70} height={18} radius={99} />
            <Skeleton width={50} height={11} radius={6} />
          </div>
        </div>
      ))}
    </div>
  )
}

function StatChipSkeleton() {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 8,
      padding: '8px 14px', borderRadius: 99,
      background: 'oklch(100% 0 0 / 0.04)',
      border: '1px solid var(--border)',
    }}>
      <Skeleton width={70} height={10} radius={4} />
      <Skeleton width={48} height={14} radius={6} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick stat chip (footer row)

function QuickStat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 8,
      padding: '8px 14px', borderRadius: 99,
      background: accent ? 'var(--accent-soft)' : 'oklch(100% 0 0 / 0.04)',
      border: '1px solid var(--border)',
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10.5,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--fg-dim)', fontWeight: 600,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14,
        color: accent ? 'var(--accent)' : 'var(--fg)',
        letterSpacing: '-0.01em',
      }}>
        {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main route

export function DashboardRoute() {
  const customers   = useCustomersStore(s => s.customers)
  const setSelected = useUiStore(s => s.setSelectedCustomer)
  const setAppView  = useUiStore(s => s.setAppView)
  const user        = useAuthStore(s => s.user)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  // Finance
  const kpis      = useFinanceStore(s => s.kpis)
  const invoices  = useFinanceStore(s => s.invoices)
  const loadKpis  = useFinanceStore(s => s.loadKpis)
  const loadFinance = useFinanceStore(s => s.loadAll)

  // Mail
  const emails            = useMailStore(s => s.emails)
  const loadEmails        = useMailStore(s => s.loadEmails)
  const selectEmail       = useMailStore(s => s.selectEmail)
  const selectedAccountId = useMailStore(s => s.selectedAccountId)

  // Calendar
  const todayEvents    = useCalendarStore(s => s.todayEvents)
  const isTodayLoading = useCalendarStore(s => s.isTodayLoading)
  const loadToday      = useCalendarStore(s => s.loadToday)

  // Todos & follow-ups
  const todos        = useTodosStore(s => s.allTodos)
  const allFollowUps = useCrmStore(s => s.allFollowUps)
  const loadFollowUps = useCrmStore(s => s.loadAll)

  // ── Initial loads ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!workspaceId) return
    loadKpis(workspaceId)
    loadFinance(workspaceId)
    loadToday(workspaceId)
    loadFollowUps(workspaceId)
  }, [workspaceId])

  useEffect(() => {
    if (selectedAccountId && emails.length === 0) loadEmails()
  }, [selectedAccountId, emails.length, loadEmails])

  // ── Derived data ────────────────────────────────────────────────────────
  const now = new Date()
  const dateStr = `${DAYS[now.getDay()]} · ${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`
  const firstName = user?.email?.split('@')[0] ?? 'User'

  const priorities = useMemo(
    () => computePriorities({
      customers,
      todos,
      events: todayEvents,
      invoices,
      followups: allFollowUps,
    }),
    [customers, todos, todayEvents, invoices, allFollowUps],
  )
  const top3 = priorities.slice(0, 3)

  const usedTaskIds = useMemo(() => new Set(top3.filter(p => p.id.startsWith('task:')).map(p => p.id)), [top3])
  const upcoming = useMemo(
    () => upcomingTasks(todos, customers, usedTaskIds, 5),
    [todos, customers, usedTaskIds],
  )

  const customerByEmail = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of customers) if (c.email) map.set(c.email.toLowerCase(), c.name)
    return map
  }, [customers])

  const waitingEmails = useMemo<EmailHeader[]>(
    () => emails
      .filter(e => !e.isRead)
      .filter(e => {
        // Prefer mails linked to a customer (or whose sender domain matches one)
        if (e.customerId) return true
        if (e.fromAddr && customerByEmail.has(e.fromAddr.toLowerCase())) return true
        return true  // fall through: still show, all unread mails count as waiting
      })
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
      .slice(0, 5),
    [emails, customerByEmail],
  )

  const overdueFollowups = useMemo(
    () => allFollowUps
      .filter(f => f.status === 'offen')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 5),
    [allFollowUps],
  )

  // We treat "kpis still null" as the initial-load signal — finance is the last
  // store we wait for. Once it returns (even with all zeros), the UI is ready.
  const loading = kpis === null

  // ── Click handlers ──────────────────────────────────────────────────────
  function openPriority(item: PriorityItem) {
    if (item.customerId) {
      setSelected(item.customerId)
    } else if (item.kind === 'meeting') {
      setAppView('calendar')
    }
  }

  function openEmail(email: EmailHeader) {
    selectEmail(email)
    setAppView('mail')
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="main-inner">

      {/* Greeting */}
      <div className="greeting">
        <h1 className="greeting-title">
          {getGreeting()},<br /><em>{firstName}.</em>
        </h1>
        <div className="greeting-sub">
          <span>{dateStr}</span>
          <span>
            <strong>{top3.length} {top3.length === 1 ? 'Sache' : 'Sachen'}</strong> heute
          </span>
          {waitingEmails.length > 0 && (
            <span>{waitingEmails.length} ungelesene Mails</span>
          )}
        </div>
      </div>

      {/* DREI SACHEN HEUTE */}
      <div className="section-head" style={{ marginTop: 0 }}>
        <h2>
          Drei Sachen heute
          {top3.length > 0 && <span className="count">{String(top3.length).padStart(2, '0')}</span>}
        </h2>
      </div>

      {loading ? (
        <PrioritySkeleton />
      ) : top3.length === 0 ? (
        <div className="card" style={{
          padding: '32px 28px', display: 'flex', alignItems: 'center', gap: 14,
          marginBottom: 24,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'var(--accent-soft)', color: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Nichts Dringendes heute.</div>
            <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', marginTop: 2 }}>
              Zeit für strategische Arbeit oder einen Kaffee.
            </div>
          </div>
        </div>
      ) : (
        <div className="priorities">
          <AnimatePresence initial={false}>
            {top3.map((item, i) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.28, delay: i * 0.06, ease: [0.2, 0.7, 0.1, 1] }}
                style={{ display: 'flex' }}
              >
                <PriorityCard item={item} index={i} onClick={() => openPriority(item)} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* NICHT VERGESSEN + WER WARTET */}
      <div className="row" style={{ marginTop: 24 }}>
        <SectionCard
          title="Nicht vergessen"
          count={upcoming.length}
          empty="Keine offenen Tasks in den nächsten 7 Tagen."
        >
          {upcoming.map(({ todo, customerName }) => (
            <TaskRow
              key={todo.id}
              title={todo.title}
              customerName={customerName}
              due={todo.dueDate}
              onClick={() => {
                if (todo.customerId) setSelected(todo.customerId)
                else setAppView('tasks')
              }}
            />
          ))}
        </SectionCard>

        <SectionCard
          title="Wer wartet auf dich"
          count={waitingEmails.length + overdueFollowups.length}
          empty="Keine offenen Antworten."
          accent={
            waitingEmails.length > 0
              ? <Inbox size={14} style={{ color: 'var(--fg-muted)' }} />
              : undefined
          }
        >
          {waitingEmails.map(email => (
            <MailRow
              key={`mail-${email.id}`}
              email={email}
              customerName={
                email.customerId
                  ? customers.find(c => c.id === email.customerId)?.name
                  : customerByEmail.get((email.fromAddr ?? '').toLowerCase())
              }
              onClick={() => openEmail(email)}
            />
          ))}
          {overdueFollowups.map(fu => {
            const cust = customers.find(c => c.id === fu.customerId)
            return (
              <TaskRow
                key={`fu-${fu.id}`}
                title={fu.title}
                customerName={cust?.name ?? 'Follow-Up'}
                due={fu.dueDate}
                onClick={() => fu.customerId && setSelected(fu.customerId)}
              />
            )
          })}
        </SectionCard>
      </div>

      {/* BEZIEHUNGEN BRAUCHEN PFLEGE */}
      <AccountSignals />

      {/* TAGESPLAN */}
      <div style={{ marginTop: 24 }}>
        <DayTimeline />
      </div>

      {/* Stats Footer Chips */}
      <div style={{
        marginTop: 28,
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
      }}>
        {loading ? (
          <>
            <StatChipSkeleton />
            <StatChipSkeleton />
            <StatChipSkeleton />
          </>
        ) : (
          <>
            <QuickStat label="Aktive Clients" value={customers.filter(c => c.status === 'aktiv').length} />
            {kpis && <QuickStat label="Offen" value={fmtCurrency(kpis.openTotal)} />}
            {kpis && kpis.overdueCount > 0 && (
              <QuickStat label={`${kpis.overdueCount} Überfällig`} value={fmtCurrency(kpis.overdueTotal)} accent />
            )}
            {kpis && <QuickStat label="Monatsumsatz" value={fmtCurrency(kpis.monthRevenue)} />}
          </>
        )}
      </div>

    </div>
  )
}
