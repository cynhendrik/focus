// ─────────────────────────────────────────────────────────────────────────────
// DashboardRoute "Mein Tag" — persönliche View (KPI-Kacheln + CORRA-Queue), auf assignee=ich gefiltert.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'

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
import { useToastStore } from '@/store/toast.store'
import { useHeuteQueue } from '@/hooks/useHeuteQueue'
import { useReminderTrailHydration } from '@/hooks/useReminderTrailHydration'
import { isTodoForToday } from '@/lib/heute/due'
import { snoozeInvoice } from '@/lib/heute/snooze'
import { HeuteTile } from '@/components/heute/HeuteTile'
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState'
import { useLeadsStore } from '@/store/leads.store'
import { useAccountsStore } from '@/store/accounts.store'
import type { HeuteQueueItem } from '@/lib/ai/heute-queue'
import '@/styles/heute.css'

import type { EmailHeader } from '@/types/mail.types'
import type { CalendarEvent } from '@/types/calendar.types'
import type { Todo } from '@/types/todo.types'
import type { UpsertTodoPayload } from '@/types/todo.types'

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

function joinDe(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} und ${parts[parts.length - 1]}`
}


// ─────────────────────────────────────────────────────────────────────────────
// KPI Card (gemeinsam fuer alle Views)

function KpiCard({
  label, value, hint, accentValue, action, children,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  accentValue?: boolean   // groesse Zahl in blau statt fg
  action?: { label?: string; onClick: () => void }
  children?: React.ReactNode  // Header-Toolbar (z.B. Woche/Monat-Toggle)
}) {
  return (
    <div style={{
      borderRadius: 'var(--radius)', border: '1px solid var(--border)',
      background: 'var(--surface)', padding: '18px 20px',
      boxShadow: 'var(--card-shadow)',
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
  const myUserId = useAuthStore(s => s.user?.id)
  const myTodos  = useMemo(() => filterMine(todos, myUserId), [todos, myUserId])
  const followUps = useCrmStore(s => s.allFollowUps)
  const events    = useCalendarStore(s => s.todayEvents)
  const setAppView = useUiStore(s => s.setAppView)
  const upsertTodo = useTodosStore(s => s.upsert)
  const crmUpsert  = useCrmStore(s => s.upsert)
  const showToast  = useToastStore(s => s.show)
  const emails     = useMailStore(s => s.emails)
  const leads      = useLeadsStore(s => s.leads)
  const accounts   = useAccountsStore(s => s.accounts)

  useReminderTrailHydration()

  const [revRange, setRevRange] = useState<'week' | 'month'>('week')

  // Heute-Cockpit queue
  const { items: queueItems, loading: queueLoading, reshuffle } = useHeuteQueue()
  const [queueIndex, setQueueIndex] = useState(0)
  const [direction, setDirection]   = useState<1 | -1>(1)

  const advance = useCallback(() => {
    setDirection(1)
    setQueueIndex(prev => prev + 1)
  }, [])

  const handleDone = useCallback(async () => {
    const item = queueItems[queueIndex]
    if (!item) return
    try {
      if (item.type === 'todo' || item.type === 'mail_reply' || item.type === 'followup') {
        const todo = todos.find(t => t.id === item.id)
        if (todo) {
          const payload: UpsertTodoPayload = {
            id: todo.id, title: todo.title, status: 'done', bucket: 'done',
            priority: todo.priority, customerId: todo.customerId,
            actionType: todo.actionType, sourceRef: todo.sourceRef,
            notes: todo.notes, checklist: todo.checklist, tags: todo.tags,
          }
          await upsertTodo(payload)
        }
      } else if (item.type === 'lead_followup') {
        // CRM-Follow-up als erledigt markieren (sonst kommt es wieder).
        const fu = followUps.find(f => f.id === item.id)
        if (fu) {
          await crmUpsert({
            id: fu.id, customerId: fu.customerId, title: fu.title,
            dueDate: fu.dueDate, status: 'erledigt', priority: fu.priority,
          })
        }
      } else if (item.type === 'invoice_reminder') {
        // Rechnung wird nicht „erledigt" (das entscheidet die Zahlung), aber nach
        // dem Senden einer Erinnerung 7 Tage ruhen lassen — sonst steht sie morgen
        // wieder auf #1 (Broken-Record). Mahn-Cooldown respektiert.
        snoozeInvoice(item.id, 7)
      }
    } catch {
      showToast({ message: 'Konnte Aufgabe nicht als erledigt markieren.', variant: 'error' })
    }
    advance()
  }, [queueItems, queueIndex, todos, upsertTodo, followUps, crmUpsert, advance, showToast])

  const handleSkip = useCallback(() => advance(), [advance])

  // „Später erinnern" für eine Rechnung: 7 Tage ruhen lassen (persistiert), damit
  // eine bewusst liegengelassene Rechnung kein Broken-Record wird.
  const handleSnooze = useCallback(() => {
    const item = queueItems[queueIndex]
    if (item?.type === 'invoice_reminder') snoozeInvoice(item.id, 7)
    advance()
  }, [queueItems, queueIndex, advance])

  const currentItem = queueItems[queueIndex]

  // Workspace leer?  (keine Kunden + keine Todos + keine Rechnungen)
  const isWorkspaceEmpty = customers.length === 0 && todos.length === 0 && invoices.length === 0

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
    const tasks = myTodos.filter(t => isTodoForToday(t, todayIso)).length
    const fus = followUps.filter(f => f.status === 'offen' && f.dueDate <= todayIso).length
    return { tasks, fus, total: tasks + fus + events.length }
  }, [myTodos, followUps, events, todayIso])

  // ── Fokus+ abgeleitete Werte ────────────────────────────────────────────────
  const overdueInvoices = useMemo(
    () => invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled' && i.status !== 'draft'
      && (i.status === 'overdue' || new Date(i.dueDate).getTime() < Date.now())),
    [invoices],
  )
  const geldUnterwegs = useMemo(() => overdueInvoices.reduce((s, i) => s + i.total, 0), [overdueInvoices])
  const koraLine = useMemo(() => {
    const parts: string[] = []
    if (overdueInvoices.length) parts.push(`${overdueInvoices.length} ${overdueInvoices.length === 1 ? 'Rechnung' : 'Rechnungen'} (${eur0(geldUnterwegs)})`)
    if (dueToday.fus) parts.push(`${dueToday.fus} Follow-up${dueToday.fus === 1 ? '' : 's'}`)
    if (events.length) parts.push(`${events.length} Termin${events.length === 1 ? '' : 'e'}`)
    return parts.length ? `Heute drängen ${joinDe(parts)}.` : 'Heute drängt nichts Akutes — ein guter Tag für Fokusarbeit.'
  }, [overdueInvoices, geldUnterwegs, dueToday.fus, events.length])
  const now = new Date()
  const dateLine = `${WEEKDAYS[now.getDay()].slice(0, 2)} · ${String(now.getDate()).padStart(2, '0')}. ${now.toLocaleDateString('de-DE', { month: 'long' })} · ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const recentMails = useMemo(() => [...emails].sort((a, b) => b.sentAt.localeCompare(a.sentAt)).slice(0, 4), [emails])
  const unreadCount = useMemo(() => emails.filter(e => !e.isRead).length, [emails])

  const invById  = useMemo(() => new Map(invoices.map(i => [i.id, i])), [invoices])
  const fuById   = useMemo(() => new Map(followUps.map(f => [f.id, f])), [followUps])
  const todoById = useMemo(() => new Map(todos.map(t => [t.id, t])), [todos])
  const contactName = useCallback(
    (id: string) => leads.find(l => l.id === id)?.name ?? accounts.find(a => a.id === id)?.name ?? 'Kontakt',
    [leads, accounts],
  )

  const completeItem = useCallback(async (item: HeuteQueueItem) => {
    try {
      if (item.type === 'lead_followup') {
        const fu = fuById.get(item.id)
        if (fu) await crmUpsert({ id: fu.id, customerId: fu.customerId, title: fu.title, dueDate: fu.dueDate, status: 'erledigt', priority: fu.priority })
      } else {
        const t = todoById.get(item.id)
        if (t) await upsertTodo({ id: t.id, title: t.title, status: 'done', bucket: 'done', priority: t.priority, customerId: t.customerId, actionType: t.actionType, sourceRef: t.sourceRef, notes: t.notes, checklist: t.checklist, tags: t.tags })
      }
      setQueueIndex(0); reshuffle()
    } catch {
      showToast({ message: 'Konnte nicht als erledigt markieren.', variant: 'error' })
    }
  }, [fuById, todoById, crmUpsert, upsertTodo, reshuffle, showToast])

  const snoozeItem = useCallback((item: HeuteQueueItem) => {
    snoozeInvoice(item.id, 7); setQueueIndex(0); reshuffle()
  }, [reshuffle])

  const listAll   = queueItems.slice(queueIndex + 1)
  const listShown = listAll.slice(0, 6)
  const hidden    = listAll.slice(6)
  const hInv  = hidden.filter(x => x.type === 'invoice_reminder').length
  const hFu   = hidden.filter(x => x.type === 'lead_followup').length
  const hTodo = hidden.length - hInv - hFu
  const hiddenBreak = [hTodo ? `${hTodo} To-dos` : '', hFu ? `${hFu} Follow-ups` : '', hInv ? `${hInv} Rechn.` : ''].filter(Boolean).join(', ')
  const listFootTxt = hidden.length > 0
    ? `Noch ${hidden.length} weitere${hiddenBreak ? ` — ${hiddenBreak}` : ''}. Nichts fällt still weg.`
    : 'Alles Aktuelle im Blick — nichts fällt still weg.'

  return (
    <div className="hd">
      {isWorkspaceEmpty && <DashboardEmptyState />}

      {/* Kopf: Gruß + KORA-Zeile */}
      <div className="hd-greet">
        <div>
          <h1>{greeting()}<em>.</em></h1>
          <p className="hd-kora">{koraLine}</p>
        </div>
        <div className="hd-date">{dateLine}</div>
      </div>

      {/* KPIs */}
      <div className="hd-kpis">
        <KpiCard
          label="Umsatz"
          value={<span>{fmtKEur(paidNow)}<span style={{ fontSize: 22, color: 'var(--fg-dim)', marginLeft: 2, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>k€</span></span>}
          hint={<><span style={{ color: paidNow >= paidPrev ? 'var(--accent)' : 'oklch(72% 0.18 25)', fontWeight: 600 }}>{paidPrev === 0 ? (paidNow > 0 ? '+100%' : '—') : pct(paidNow - paidPrev, paidPrev)}</span><span style={{ color: 'var(--fg-dim)' }}>·</span><span>{hintPrevLabel}</span><span style={{ color: 'var(--fg-dim)', marginLeft: 'auto' }}>{label}</span></>}
        >
          <WeekMonthToggle range={revRange} onChange={setRevRange} />
        </KpiCard>

        <KpiCard
          label="Geld unterwegs"
          value={<span>{eur0(geldUnterwegs)}</span>}
          accentValue={geldUnterwegs > 0}
          hint={<><span style={{ color: overdueInvoices.length > 0 ? 'var(--accent)' : 'var(--fg-dim)', fontWeight: 600 }}>{overdueInvoices.length}</span><span>überfällige {overdueInvoices.length === 1 ? 'Rechnung' : 'Rechnungen'}</span></>}
          action={{ label: 'Zu Rechnungen', onClick: () => setAppView('invoices') }}
        />

        <KpiCard
          label="Offen heute"
          value={String(dueToday.total)}
          accentValue={dueToday.total > 0}
          hint={<><span style={{ color: 'var(--accent)', fontWeight: 600 }}>{dueToday.tasks} Tasks</span><span style={{ color: 'var(--fg-dim)' }}>·</span><span style={{ color: 'var(--accent)', fontWeight: 600 }}>{dueToday.fus} FU</span><span style={{ color: 'var(--fg-dim)' }}>·</span><span>{events.length} Termine</span></>}
          action={{ label: 'Zum Kalender', onClick: () => setAppView('calendar') }}
        />
      </div>

      {/* 2 gleich hohe Spalten */}
      <div className="hd-main">

        {/* Links: Fokus-Karte + Interleave-Liste */}
        <div className="hd-col">
          {!queueLoading && currentItem && (
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div key={`${currentItem.id}-${queueIndex}`} custom={direction}
                initial={{ opacity: 0, x: direction * 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: direction * -24 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
                <HeuteTile item={currentItem} index={queueIndex} total={queueItems.length} onDone={handleDone} onSkip={handleSkip} onSnooze={handleSnooze} />
              </motion.div>
            </AnimatePresence>
          )}
          {!queueLoading && !currentItem && !isWorkspaceEmpty && (
            <div className="card" style={{ borderLeft: '3px solid var(--ok)', padding: '22px 24px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--ok)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--ok)' }}>HEUTE</span>
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.025em', margin: 0, color: 'var(--fg)' }}>
                {queueItems.length === 0 ? 'Heute ist frei für Fokus.' : 'Alles Dringende erledigt.'}
              </h2>
              <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '9px 0 0', lineHeight: 1.55 }}>
                Kein dringender Zug. Ein guter Moment für Tiefarbeit — oder plane deinen Tag.
              </p>
              <button type="button" onClick={() => { setQueueIndex(0); reshuffle() }}
                style={{ marginTop: 14, background: 'none', border: 'none', color: 'var(--accent-text)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                Neu prüfen →
              </button>
            </div>
          )}

          {(currentItem || listShown.length > 0) && (
            <div className="hd-fill">
              <div className="hd-lhead"><span className="t">Als nächstes</span><span className="c">Geld &amp; Beziehung im Wechsel</span></div>
              {listShown.map(item => {
                const isMoney = item.type === 'invoice_reminder'
                const isFollow = item.type === 'lead_followup' || item.type === 'followup'
                const kindLabel = isMoney ? 'Mahnung' : isFollow ? 'Follow-up' : item.type === 'mail_reply' ? 'Mail' : 'To-do'
                const kindClass = isMoney ? 'mahnung' : isFollow ? 'followup' : 'todo'
                let title = ''
                let meta = item.reason
                if (isMoney) {
                  const inv = invById.get(item.id)
                  const c = inv ? accounts.find(a => a.id === inv.accountId)?.name : undefined
                  title = inv ? ([c, inv.number].filter(Boolean).join(' · ') || 'Rechnung') : 'Rechnung'
                } else if (item.type === 'lead_followup') {
                  const fu = fuById.get(item.id)
                  title = contactName(fu?.customerId ?? '')
                  meta = fu?.title ?? item.reason
                } else {
                  const t = todoById.get(item.id)
                  title = t?.title ?? item.reason
                }
                return (
                  <div key={item.id} className={`hd-row${isMoney ? ' mny' : ''}`}>
                    {isMoney
                      ? <span className="hd-mmark">€</span>
                      : <button className="hd-check" title="Als erledigt markieren" onClick={() => completeItem(item)} />}
                    <span className={`hd-kind ${kindClass}`}>{kindLabel}</span>
                    <div className="hd-body"><div className="hd-ti">{title}</div><div className="hd-mt">{meta}</div></div>
                    <div className="hd-quick">
                      {isMoney
                        ? <button className="hd-qbtn" onClick={() => snoozeItem(item)}>7 Tage ruhen</button>
                        : <button className="hd-qbtn" onClick={() => completeItem(item)}>Erledigt</button>}
                    </div>
                  </div>
                )
              })}
              <div className="hd-lfoot">
                <span className="txt">{listFootTxt}</span>
                <button type="button" onClick={() => setAppView('leverage_inbox')}>Alle anzeigen →</button>
              </div>
            </div>
          )}
        </div>

        {/* Rechts: Tagesplan + Neueste Mails */}
        <div className="hd-col">
          <TagesplanCard events={events} todos={myTodos} customers={customers} />
          <div className="hd-fill">
            <div className="hd-lhead"><span className="t">Neueste Mails</span><span className="c">{unreadCount} ungelesen</span></div>
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
    // Aufgabe zählt für heute, wenn fällig ODER für heute eingeplant (Composer
    // setzt scheduledAt, nicht dueDate) — sonst verschwinden getippte Tasks.
    if (t.dueDate !== todayIso && !(t.scheduledAt && t.scheduledAt.slice(0, 10) === todayIso)) continue
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
    case 'block': return { ...base, background: 'oklch(72% 0.10 195 / 0.18)',     color: 'oklch(72% 0.10 195)' }
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
      borderRadius: 'var(--radius)', border: '1px solid var(--border)',
      background: 'var(--surface)', boxShadow: 'var(--card-shadow)', padding: '20px 22px',
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
    () => [...emails].sort((a, b) =>
      (Number(!!a.isRead) - Number(!!b.isRead)) ||   // ungelesene zuerst
      (b.sentAt || '').localeCompare(a.sentAt || ''),
    ),
    [emails],
  )
  const unreadCount = useMemo(() => emails.filter(e => !e.isRead).length, [emails])

  return (
    <div style={{
      borderRadius: 'var(--radius)', border: '1px solid var(--border)',
      background: 'var(--surface)', boxShadow: 'var(--card-shadow)',
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
            fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.04em',
            color: unreadCount > 0 ? 'var(--accent)' : 'var(--fg-dim)',
            fontWeight: unreadCount > 0 ? 700 : 400,
          }}>
            {unreadCount > 0 ? `${unreadCount} ungelesen` : `${sorted.length} ${sorted.length === 1 ? 'Mail' : 'Mails'}`}
          </span>
          <button
            onClick={() => setAppView('mail')}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              color: 'var(--fg)', cursor: 'pointer',
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

  const unread = !email.isRead

  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid', gridTemplateColumns: '8px 1fr auto', gap: 10,
        alignItems: 'center', padding: '10px 8px', borderRadius: 10,
        cursor: 'pointer', transition: 'background 140ms',
        opacity: unread ? 1 : 0.6,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: unread ? 'var(--accent)' : 'transparent',
      }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{
          fontSize: 13, fontWeight: unread ? 700 : 500,
          color: unread ? 'var(--fg)' : 'var(--fg-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {customerName ?? email.fromName ?? email.fromAddr}
        </span>
        <span style={{
          fontSize: 11.5, color: unread ? 'var(--fg-muted)' : 'var(--fg-dim)',
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
// Main route

export function DashboardRoute() {
  const user        = useAuthStore(s => s.user)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  // Data loads — sind in App.tsx schon in den beiden Init-Wellen,
  // hier nur Finance ergaenzen, weil das nicht workspace-weit geladen wird.
  const loadFinance = useFinanceStore(s => s.loadAll)
  const loadToday   = useCalendarStore(s => s.loadToday)
  useEffect(() => {
    if (!workspaceId) return
    loadFinance(workspaceId)
    loadToday(workspaceId)
  }, [workspaceId, loadFinance, loadToday])

  const firstName = (
    ((user?.user_metadata?.full_name as string | undefined)?.trim().split(' ')[0])
    || user?.email?.split('@')[0]
    || 'User'
  ).replace(/^./, c => c.toUpperCase())
  const now = new Date()
  const dateLine = `${WEEKDAYS[now.getDay()]} · ${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`

  return (
    <div className="main-inner">
      <PageHeader
        title={<>{greeting()}, <span style={{ color: 'var(--accent-text)' }}>{firstName}</span></>}
        right={
          <div className="greeting-sub">
            <span>{dateLine}</span>
          </div>
        }
      />
      <WorkspaceView />
    </div>
  )
}
