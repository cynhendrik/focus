// ─────────────────────────────────────────────────────────────────────────────
// DashboardRoute "Mein Tag" — Tagesanker-Design: eine Spalte, randlose Karten.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'

import { filterMine } from '@/lib/todos/ownership'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import { useFinanceStore } from '@/store/finance.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useMailStore } from '@/store/mail.store'
import { useCalendarStore } from '@/store/calendar.store'
import { useTodosStore } from '@/store/todos.store'
import { useCrmStore } from '@/store/crm.store'
import { useReminderTrailHydration } from '@/hooks/useReminderTrailHydration'
import { isTodoForToday } from '@/lib/heute/due'
import { snoozedInvoiceIds } from '@/lib/heute/snooze'
import { extractMeetingLink, type MeetingLink } from '@/lib/calendar/meeting-link'
import { openExternal } from '@/lib/open-external'
import { maskEvent } from '@/lib/calendar/owner'
import { buildTodayLine } from '@/lib/notifications/briefing'
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState'
import { StapelSection } from '@/components/stapel/StapelSection'
import '@/styles/heute.css'

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

function initials(name: string): string {
  return (name.trim().split(/\s+/).map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase()) || '?'
}

function relTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '–'
  const hrs = Math.floor((Date.now() - d.getTime()) / 3_600_000)
  if (hrs < 1) return 'gerade'
  if (hrs < 24) return `${hrs} Std`
  const y = new Date(); y.setDate(y.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'gestern'
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

function eur0(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

// ─────────────────────────────────────────────────────────────────────────────
// WorkspaceView — Tagesanker + Puls-Leiste + Stapel + Tagesplan + Mails

function WorkspaceView() {
  const customers = useCustomersStore(s => s.customers)
  const invoices  = useFinanceStore(s => s.invoices)
  const todos     = useTodosStore(s => s.allTodos)
  const user      = useAuthStore(s => s.user)
  const myUserId  = user?.id
  const myTodos  = useMemo(() => filterMine(todos, myUserId), [todos, myUserId])
  const followUps = useCrmStore(s => s.allFollowUps)
  const events    = useCalendarStore(s => s.todayEvents)
  const setAppView = useUiStore(s => s.setAppView)
  const emails     = useMailStore(s => s.emails)

  useReminderTrailHydration()

  const [revRange, setRevRange] = useState<'week' | 'month'>('week')

  // Vorname aus user_metadata
  const firstName = (
    ((user?.user_metadata?.full_name as string | undefined)?.trim().split(' ')[0])
    || user?.email?.split('@')[0]
    || 'User'
  ).replace(/^./, c => c.toUpperCase())

  const now = new Date()
  const dateText = `${WEEKDAYS[now.getDay()]} · ${now.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}`

  // Workspace leer?
  const isWorkspaceEmpty = customers.length === 0 && todos.length === 0 && invoices.length === 0

  // Umsatz
  const paidNow = useMemo(() => {
    const now = new Date()
    const rangeStart = revRange === 'week' ? startOfWeek(now) : startOfMonth(now)
    let paid = 0
    for (const inv of invoices) {
      if (inv.status !== 'paid') continue
      const ts = new Date(inv.date)
      if (ts >= rangeStart && ts <= now) paid += inv.total
    }
    return paid
  }, [invoices, revRange])

  // Heute fällig
  const todayIso = todayLocalIso()
  const dueToday = useMemo(() => {
    const tasks = myTodos.filter(t => isTodoForToday(t, todayIso)).length
    const fus = followUps.filter(f => f.status === 'offen' && f.dueDate.slice(0, 10) <= todayIso).length
    return { tasks, fus, total: tasks + fus + events.length }
  }, [myTodos, followUps, events, todayIso])

  // Geld unterwegs
  const overdueInvoices = useMemo(() => {
    const snoozed = snoozedInvoiceIds()
    return invoices.filter(i => !snoozed.has(i.id) && i.status !== 'paid' && i.status !== 'cancelled' && i.status !== 'draft'
      && (i.status === 'overdue' || new Date(i.dueDate).getTime() < Date.now()))
  }, [invoices])
  const geldUnterwegs = useMemo(() => overdueInvoices.reduce((s, i) => s + i.total, 0), [overdueInvoices])

  // KORA-Zeile
  const koraLine = useMemo(() =>
    buildTodayLine({
      overdueCount: overdueInvoices.length,
      overdueSum: geldUnterwegs,
      fusDue: dueToday.fus,
      tasksDue: dueToday.tasks,
      eventsToday: events.length,
    }) || 'Heute steht nichts Dringendes an — ein guter Tag für Fokusarbeit.',
  [overdueInvoices, geldUnterwegs, dueToday.fus, dueToday.tasks, events.length])

  const recentMails = useMemo(() => [...emails].sort((a, b) => b.sentAt.localeCompare(a.sentAt)).slice(0, 4), [emails])
  const unreadCount = useMemo(() => emails.filter(e => !e.isRead).length, [emails])

  // Tagesplan-Zähler für den Eyebrow-Header
  const tagesplanCount = useMemo(() => buildTagesplan(events, myTodos).length, [events, myTodos])

  return (
    <div className="hd">
      {isWorkspaceEmpty && <DashboardEmptyState />}

      {/* ── Tagesanker + Puls-Leiste ─────────────────────────────────────── */}
      <div className="hd-anchor enter d1">
        <h1 className="greeting-title">{greeting()}, <span className="hd-name">{firstName}</span><em>.</em></h1>
        <div className="hd-anchor-date">{dateText}</div>
        <p className="hd-anchor-line">{koraLine}</p>

        <div className="hd-pulse">
          {/* Segment 1: Umsatz mit Woche/Monat-Toggle */}
          <div className="hd-pulse-stat">
            <div className="hd-pulse-k">
              UMSATZ · {revRange === 'week' ? 'WOCHE' : 'MONAT'}
              <WeekMonthToggle range={revRange} onChange={setRevRange} />
            </div>
            <div className="hd-pulse-v">
              {fmtKEur(paidNow)}<small>k€</small>
            </div>
          </div>

          {/* Segment 2: Geld unterwegs */}
          <div className={`hd-pulse-stat${geldUnterwegs > 0 ? ' hot' : ''}`}>
            <span className="hd-pulse-k">GELD UNTERWEGS</span>
            <span className="hd-pulse-v">{eur0(geldUnterwegs)}</span>
          </div>

          {/* Segment 3: Offen heute */}
          <div className="hd-pulse-stat">
            <span className="hd-pulse-k">OFFEN HEUTE</span>
            <span className="hd-pulse-v">{dueToday.total}</span>
          </div>
        </div>
      </div>

      {/* ── Stapel (inkl. eigenem Eyebrow in StapelSection) ──────────────── */}
      <div className="enter d2">
        <StapelSection />
      </div>

      {/* ── Tagesplan ────────────────────────────────────────────────────── */}
      <div className="enter d3">
        <div className="hd-eyebrow">
          <span className="t">MEIN TAGESPLAN</span>
          <span className="c">{tagesplanCount} {tagesplanCount === 1 ? 'Eintrag' : 'Einträge'}</span>
        </div>
        <TagesplanCard events={events} todos={myTodos} customers={customers} onOpen={() => setAppView('calendar')} hideHeader />
      </div>

      {/* ── Neueste Mails ─────────────────────────────────────────────────── */}
      <div className="enter d4">
        <div className="hd-eyebrow">
          <span className="t">NEUESTE MAILS</span>
          <span className="c">{unreadCount} ungelesen</span>
        </div>
        <div className="hd-fill">
          {recentMails.length === 0 && (
            <div style={{ padding: 20, fontSize: 13, color: 'var(--fg-dim)' }}>Keine Mails.</div>
          )}
          {recentMails.map(m => {
            const unread = !m.isRead
            return (
              <div key={m.id} className={`hd-mrow${unread ? ' unread' : ''}`} onClick={() => setAppView('mail')}>
                <span className="hd-av">{initials(m.fromName || m.fromAddr)}</span>
                <div className="hd-mbody">
                  <div className="hd-from">{unread && <span className="dot" />}<span className="nm">{m.fromName || m.fromAddr}</span></div>
                  <div className="hd-subj">{m.subject || '(Kein Betreff)'}</div>
                </div>
                {unread
                  ? <button className="hd-reply" onClick={e => { e.stopPropagation(); setAppView('mail') }}>Antworten</button>
                  : <span className="hd-mtime">{relTime(m.sentAt)}</span>}
              </div>
            )
          })}
          <div className="hd-lfoot">
            <span className="txt">Postfach</span>
            <button type="button" onClick={() => setAppView('mail')}>Öffnen →</button>
          </div>
        </div>
      </div>
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
          background: active ? 'var(--nav-active-bg)' : 'transparent',
          color: active ? 'var(--accent-text)' : 'var(--fg-muted)',
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
  meetingLink?: MeetingLink
}

function buildTagesplan(events: CalendarEvent[], todos: Todo[]): PlanItem[] {
  const now = new Date()
  const items: PlanItem[] = []

  // Termine heute → mit Zeit (fremde Privat-Termine als „Gebucht" maskiert)
  for (const raw of events) {
    const ev = maskEvent(raw)
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
      meetingLink: extractMeetingLink(ev) ?? undefined,
    })
  }

  // Heute fällige Tasks
  const todayIso = todayLocalIso()
  for (const t of todos) {
    if (t.status === 'done') continue
    if (t.dueDate !== todayIso && !(t.scheduledAt && t.scheduledAt.slice(0, 10) === todayIso)) continue
    items.push({
      id: `t-${t.id}`,
      time: '',
      title: t.title,
      subtitle: t.priority === 'p1' || t.priority === 'p2' ? 'Hohe Prio' : '',
      status: { kind: 'fokus', label: 'Fokus' },
    })
  }

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
    case 'block': return { ...base, background: 'oklch(72% 0.10 195 / 0.18)',     color: 'oklch(72% 0.10 195)' }
    case 'pause': return { ...base, background: 'var(--surface-2)',               color: 'var(--fg-muted)' }
    case 'live':  return { ...base, background: 'oklch(72% 0.18 25 / 0.15)',      color: 'oklch(72% 0.18 25)' }
    case 'fokus': return { ...base, background: 'oklch(82% 0.16 70 / 0.15)',      color: 'oklch(82% 0.16 70)' }
    case 'short': return { ...base, background: 'var(--surface-2)',               color: 'var(--fg-dim)' }
  }
}

function TagesplanCard({
  events, todos, customers: _customers, onOpen, hideHeader,
}: { events: CalendarEvent[]; todos: Todo[]; customers: unknown[]; onOpen?: () => void; hideHeader?: boolean }) {
  const items = useMemo(() => buildTagesplan(events, todos), [events, todos])

  return (
    <div style={{
      borderRadius: 'var(--radius)',
      background: 'var(--surface)', boxShadow: 'var(--card-shadow)', padding: '20px 22px',
    }}>
      {!hideHeader && (
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
      )}

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
            {items.slice(0, 6).map(item => <TagesplanRow key={item.id} item={item} onOpen={onOpen} />)}
            {items.length > 6 && (
              <button type="button" onClick={onOpen} style={{ marginTop: 6, background: 'none', border: 'none', color: 'var(--fg-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left', padding: '6px 0' }}>
                + {items.length - 6} weitere im Kalender →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TagesplanRow({ item, onOpen }: { item: PlanItem; onOpen?: () => void }) {
  const isNow = item.status.kind === 'now'
  return (
    <div
      onClick={onOpen}
      style={{
        display: 'grid', gridTemplateColumns: '60px 30px 1fr auto',
        alignItems: 'center', gap: 12, padding: '12px 0',
        cursor: onOpen ? 'pointer' : 'default',
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
          boxShadow: isNow ? '0 0 0 4px oklch(68% 0.16 41 / 0.16)' : 'none',
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifySelf: 'end' }}>
        {item.meetingLink && (
          <button
            type="button"
            title={`${item.meetingLink.label}-Meeting öffnen`}
            onClick={e => { e.stopPropagation(); void openExternal(item.meetingLink!.url) }}
            style={{
              fontSize: 11, fontWeight: 700, borderRadius: 99, padding: '4px 12px',
              border: 'none', background: 'var(--accent-gradient)', color: '#fff',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
            Beitreten →
          </button>
        )}
        <span style={statusPillStyle(item.status.kind)}>{item.status.label}</span>
      </div>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// Main route — kein PageHeader; Anker liegt in WorkspaceView

export function DashboardRoute() {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  const loadFinance = useFinanceStore(s => s.loadAll)
  const loadToday   = useCalendarStore(s => s.loadToday)
  useEffect(() => {
    if (!workspaceId) return
    loadFinance(workspaceId)
    loadToday(workspaceId)
  }, [workspaceId, loadFinance, loadToday])

  return (
    <div className="main-inner">
      <WorkspaceView />
    </div>
  )
}
