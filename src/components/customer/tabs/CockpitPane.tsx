// ─────────────────────────────────────────────────────────────────────────────
// CockpitPane — Customer-Lagebericht auf einen Blick.
//
// Layout:
//   1) 4 KPI-Tiles  — Kunde seit / Worth / Im Spiel / Letzter Kontakt
//   2) Alert-Strip  — nur wenn ueberfaellige Rechnungen
//   3) Naechster-Zug-Card — KI-Vorschlag (generateBriefing), Action-Buttons
//   4) Verlauf-Mini-Liste — letzte 4-5 Events + Link zum vollen Verlauf
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import {
  Calendar, Wallet, TrendingUp, Phone, ArrowRight, AlertTriangle,
  Sparkles, RefreshCw, EyeOff, Mail as MailIcon, Clock as ClockIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useCustomersStore } from '@/store/customers.store'
import { useDealsStore } from '@/store/deals.store'
import { useActivitiesStore } from '@/store/activities.store'
import { useMailStore } from '@/store/mail.store'
import { useNotebookStore } from '@/store/notebook.store'
import { useTodosStore } from '@/store/todos.store'
import { useCalendarStore } from '@/store/calendar.store'
import { useFinanceStore } from '@/store/finance.store'
import { useCrmStore } from '@/store/crm.store'
import { useUiStore } from '@/store/ui.store'
import { FinanceService } from '@/services/finance.service'
import type { Invoice } from '@/types/finance.types'
import {
  generateBriefing, MissingApiKeyError, type CustomerBriefing,
} from '@/lib/ai/briefing'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers

function fmtEuroShort(n: number): string {
  if (Math.abs(n) >= 1000) {
    const k = n / 1000
    return k >= 10 ? `${Math.round(k)}k` : `${k.toFixed(1).replace('.', ',')}k`
  }
  return Math.round(n).toString()
}

function fmtEuro(n: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n)
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function todayIso(): string {
  return new Date().toLocaleDateString('sv')
}

function monthsBetween(iso: string): number {
  const start = new Date(iso)
  const now = new Date()
  return Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()))
}

function fmtMonthYear(iso: string): string {
  const d = new Date(iso)
  const months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
  return `${months[d.getMonth()]} ${d.getFullYear()}`
}

function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((Date.now() - t) / 86_400_000)
}

function relTimeShort(iso: string): string {
  const t = new Date(iso).getTime()
  const min = Math.floor((Date.now() - t) / 60_000)
  if (min < 1)  return 'gerade eben'
  if (min < 60) return `vor ${min} Min.`
  const h = Math.floor(min / 60)
  if (h < 24)   return h === 1 ? 'vor 1 Std.' : `vor ${h} Std.`
  const d = Math.floor(h / 24)
  if (d === 1)  return 'gestern'
  if (d < 30)   return `vor ${d} Tagen`
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI-Cell — keine eigene Card, lebt im KPI-Strip mit Trennlinien zwischen Zellen.

function KpiCell({
  icon: Icon, label, value, sub, accent,
}: {
  icon:   LucideIcon
  label:  string
  value:  React.ReactNode
  sub?:   React.ReactNode
  accent?: boolean
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      padding: '4px 20px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        fontFamily: 'var(--font-mono)', fontSize: 9.5,
        letterSpacing: '0.18em', textTransform: 'uppercase',
        color: 'var(--fg-dim)', fontWeight: 600,
      }}>
        <Icon size={11} />
        {label}
      </div>
      <div style={{
        fontSize: 28, fontWeight: 700, color: accent ? 'var(--accent)' : 'var(--fg)',
        fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.05, letterSpacing: '-0.02em',
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
          {sub}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Alert-Strip

function OverdueAlert({ count, total, onClick }: {
  count: number; total: number; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%',
        padding: '11px 16px', borderRadius: 12,
        background: 'oklch(72% 0.18 25 / 0.10)',
        border: '1px solid oklch(72% 0.18 25 / 0.30)',
        color: 'oklch(80% 0.16 25)', cursor: 'pointer',
        fontFamily: 'inherit', fontSize: 12.5, textAlign: 'left',
        transition: 'background 140ms',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'oklch(72% 0.18 25 / 0.15)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'oklch(72% 0.18 25 / 0.10)' }}
    >
      <AlertTriangle size={14} />
      <span style={{ flex: 1, fontWeight: 600 }}>
        {count} {count === 1 ? 'überfällige Rechnung' : 'überfällige Rechnungen'} · {fmtEuro(total)}
      </span>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.08em',
        textTransform: 'uppercase', fontWeight: 700,
      }}>
        Zur Übersicht <ArrowRight size={11} />
      </span>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Nächster Zug — KI

type BriefingState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; briefing: CustomerBriefing }
  | { kind: 'error'; missingKey?: boolean; message: string }

function NextMoveCard({
  customerId,
  state, onRegenerate, onSkip,
}: {
  customerId: string
  state: BriefingState
  onRegenerate: () => void
  onSkip: () => void
}) {
  const customer = useCustomersStore(s => s.customers.find(c => c.id === customerId))
  const setAppView = useUiStore(s => s.setAppView)

  const card: React.CSSProperties = {
    borderRadius: 16, border: '1px solid var(--accent-soft)',
    background: 'linear-gradient(180deg, oklch(92% 0.2 125 / 0.04) 0%, var(--bg-2) 70%)',
    padding: '18px 22px 20px',
    boxShadow: '0 0 0 1px oklch(92% 0.2 125 / 0.08) inset',
  }

  const sectionLabel: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    fontFamily: 'var(--font-mono)', fontSize: 10,
    letterSpacing: '0.18em', textTransform: 'uppercase',
    color: 'var(--accent)', fontWeight: 700,
    marginBottom: 10,
  }

  if (state.kind === 'idle' || state.kind === 'loading') {
    return (
      <div style={card}>
        <div style={sectionLabel}>
          <Sparkles size={11} /> Dein nächster Zug
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--fg-muted)', fontSize: 13 }}>
          {state.kind === 'loading' ? (
            <>
              <RefreshCw size={13} className="animate-spin" style={{ animation: 'spin 1.4s linear infinite' }} />
              Cy denkt nach …
            </>
          ) : (
            <>
              <Sparkles size={13} style={{ color: 'var(--accent)' }} />
              Drueck auf „Cy fragen", damit ich dir einen Vorschlag mache.
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button
            onClick={onRegenerate}
            disabled={state.kind === 'loading' || !customer}
            style={btnPrimaryStyle}
          >
            <Sparkles size={12} />
            {state.kind === 'loading' ? 'Cy denkt …' : 'Cy fragen'}
          </button>
        </div>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div style={{ ...card, borderColor: 'oklch(72% 0.18 25 / 0.30)' }}>
        <div style={sectionLabel}>
          <Sparkles size={11} /> Dein nächster Zug
        </div>
        <div style={{ fontSize: 13, color: 'oklch(80% 0.16 25)', marginBottom: 14 }}>
          {state.missingKey ? 'Kein API-Key konfiguriert. ' : 'Cy konnte gerade nicht antworten: '}
          <span style={{ color: 'var(--fg-muted)' }}>{state.message}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {state.missingKey ? (
            <button onClick={() => setAppView('settings')} style={btnPrimaryStyle}>
              Zu den Einstellungen
            </button>
          ) : (
            <button onClick={onRegenerate} style={btnPrimaryStyle}>
              <RefreshCw size={12} /> Nochmal versuchen
            </button>
          )}
        </div>
      </div>
    )
  }

  // state.kind === 'ready'
  const nextStep = state.briefing.nextSteps[0]
  const supportSteps = state.briefing.nextSteps.slice(1, 3)
  const headline = state.briefing.headline

  return (
    <div style={card}>
      <div style={sectionLabel}>
        <Sparkles size={11} /> Dein nächster Zug
      </div>

      {nextStep ? (
        <>
          <h2 style={{
            margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--fg)',
            letterSpacing: '-0.02em', lineHeight: 1.2,
          }}>
            {nextStep.action}
          </h2>
          {nextStep.reason && (
            <p style={{
              margin: '8px 0 0', fontSize: 13, color: 'var(--fg-muted)',
              lineHeight: 1.55, maxWidth: 720,
            }}>
              {nextStep.reason}
            </p>
          )}

          {supportSteps.length > 0 && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {supportSteps.map((s, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  fontSize: 12.5, color: 'var(--fg-muted)',
                }}>
                  <span style={{ color: 'var(--fg-dim)', marginTop: 2 }}>·</span>
                  <span>{s.action}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: 14, color: 'var(--fg)' }}>
          {headline || 'Aktuell keine konkrete Empfehlung — alles im grünen Bereich.'}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 18, alignItems: 'center' }}>
        <button onClick={() => setAppView('mail')} style={btnPrimaryStyle}>
          <MailIcon size={12} /> E-Mail schreiben
        </button>
        <button onClick={onRegenerate} style={btnGhostStyle}>
          <RefreshCw size={11} /> Cy neu
        </button>
        <button onClick={onSkip} style={btnGhostStyle}>
          <EyeOff size={11} /> Überspringen
        </button>
      </div>
    </div>
  )
}

const btnPrimaryStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7,
  padding: '9px 16px', borderRadius: 10,
  background: 'var(--accent)', color: 'var(--accent-ink)',
  border: 'none', cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
}

const btnGhostStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '7px 12px', borderRadius: 10,
  background: 'transparent', color: 'var(--fg-muted)',
  border: '1px solid var(--border)', cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 11.5,
}

// ─────────────────────────────────────────────────────────────────────────────
// Posteingang-Mini-Liste

function InboxMini({ customerId }: { customerId: string }) {
  const emails       = useMailStore(s => s.emails)
  const selectEmail  = useMailStore(s => s.selectEmail)
  const setAppView   = useUiStore(s => s.setAppView)

  const list = useMemo(
    () => emails
      .filter(e => e.customerId === customerId)
      .sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || ''))
      .slice(0, 4),
    [emails, customerId],
  )
  const unreadTotal = useMemo(
    () => emails.filter(e => e.customerId === customerId && !e.isRead).length,
    [emails, customerId],
  )

  return (
    <div style={{
      borderRadius: 16, border: '1px solid var(--border)',
      background: 'var(--bg-2)', padding: '18px 22px 16px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontFamily: 'var(--font-mono)', fontSize: 10,
        letterSpacing: '0.18em', textTransform: 'uppercase',
        color: 'var(--fg-dim)', fontWeight: 600, marginBottom: 4,
      }}>
        <span>Posteingang</span>
        <span style={{ fontWeight: 500, color: 'var(--fg-dim)' }}>
          {unreadTotal > 0
            ? <><span style={{ color: 'var(--accent)', fontWeight: 700 }}>{unreadTotal}</span> ungelesen</>
            : 'alles gelesen'}
        </span>
      </div>

      {list.length === 0 ? (
        <div style={{
          padding: '18px 0 4px', color: 'var(--fg-dim)', fontSize: 12.5,
        }}>
          Keine E-Mails von diesem Kunden.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {list.map((e, i) => (
            <button
              key={e.id}
              onClick={() => { selectEmail(e); setAppView('mail') }}
              style={{
                display: 'grid', gridTemplateColumns: '14px 1fr auto',
                alignItems: 'center', gap: 12,
                padding: '11px 0', textAlign: 'left',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--fg)', fontFamily: 'inherit',
                borderTop: i === 0 ? 'none' : '1px solid var(--border)',
              }}
            >
              <span style={{
                width: 8, height: 8, borderRadius: 99,
                background: e.isRead ? 'transparent' : 'var(--accent)',
                border: e.isRead ? '1px solid var(--border-strong)' : 'none',
                margin: '0 auto',
              }} />
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: e.isRead ? 500 : 700,
                  color: 'var(--fg)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {e.subject || '(ohne Betreff)'}
                </div>
                <div style={{
                  fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {e.fromName || e.fromAddr}
                </div>
              </div>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 10.5,
                color: 'var(--fg-dim)', letterSpacing: '0.04em',
              }}>
                {relTimeShort(e.sentAt)}
              </span>
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => setAppView('mail')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          marginTop: 14, padding: 0,
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--accent)', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
        }}
      >
        Mail-Inbox öffnen <ArrowRight size={12} />
      </button>
    </div>
  )
}

// ACTIVITY_LABEL — fuer die "Letzter Kontakt"-Tile (Kanal-Label).
const ACTIVITY_LABEL: Record<string, string> = {
  call: 'Anruf', meeting: 'Meeting', email: 'E-Mail',
  note: 'Notiz', followup: 'Follow-Up', todo: 'Task',
}

// ─────────────────────────────────────────────────────────────────────────────
// Pane

interface Props { customerId: string }

export function CockpitPane({ customerId }: Props) {
  const customer       = useCustomersStore(s => s.customers.find(c => c.id === customerId))
  const deals          = useDealsStore(s => s.deals)
  const activities     = useActivitiesStore(s => s.activities)
  const lastActivity   = useCrmStore(s => s.lastActivity)
  const setActiveTab   = useUiStore(s => s.setActiveCustomerTab)

  // Invoices direkt vom Service (analog FinanzPane).
  const [invoices, setInvoices] = useState<Invoice[]>([])
  useEffect(() => {
    FinanceService.getInvoicesByAccount(customerId).then(setInvoices).catch(() => {})
  }, [customerId])

  // Worth
  const today = todayIso()
  const monthStart = startOfMonth(new Date())
  const worthTotal = useMemo(
    () => invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0),
    [invoices],
  )
  const worthMonth = useMemo(
    () => invoices
      .filter(i => i.status === 'paid' && new Date(i.date) >= monthStart)
      .reduce((s, i) => s + i.total, 0),
    [invoices, monthStart],
  )

  // Im Spiel
  const openDeals = useMemo(
    () => deals.filter(d =>
      (d.accountId === customerId || d.customerId === customerId) &&
      d.stage !== 'won' && d.stage !== 'lost',
    ),
    [deals, customerId],
  )
  const inSpielValue = openDeals.reduce((s, d) => s + (d.value ?? 0), 0)

  // Ueberfaellige Rechnungen
  const overdueList = useMemo(
    () => invoices.filter(i =>
      i.status === 'overdue' || (i.status === 'open' && i.dueDate && i.dueDate < today),
    ),
    [invoices, today],
  )
  const overdueTotal = overdueList.reduce((s, i) => s + i.total, 0)

  // Letzter Kontakt — aus lastActivity oder neuester activity
  const lastContact = useMemo(() => {
    const fromCrm = lastActivity.find(a => a.accountId === customerId)?.lastActivityAt
    const fromActs = activities
      .filter(a => (a.accountId === customerId || a.customerId === customerId) && a.createdAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    const fromAct = fromActs?.createdAt
    const channelType = fromActs?.type ?? ''
    const candidates = [fromCrm, fromAct, customer?.updatedAt].filter(Boolean) as string[]
    candidates.sort((a, b) => b.localeCompare(a))
    return {
      iso: candidates[0] ?? null,
      channel: channelType,
    }
  }, [lastActivity, activities, customer, customerId])

  const lastDays = daysAgo(lastContact.iso)
  const channelLabel = lastContact.channel
    ? (ACTIVITY_LABEL[lastContact.channel] ?? '—')
    : '—'

  // KI-Briefing — laed nur bei expliziter Anfrage
  const allTodos     = useTodosStore(s => s.allTodos)
  const allEvents    = useCalendarStore(s => s.events)
  const allInvoices  = useFinanceStore(s => s.invoices)
  const notes        = useNotebookStore(s => s.entries)
  const noteBooks    = useNotebookStore(s => s.books)
  const emails       = useMailStore(s => s.emails)
  const followUps    = useCrmStore(s => s.allFollowUps)
  const [briefState, setBriefState] = useState<BriefingState>({ kind: 'idle' })
  const [skipped, setSkipped] = useState(false)

  const runBriefing = async () => {
    if (!customer) return
    setBriefState({ kind: 'loading' })
    try {
      const briefing = await generateBriefing({
        customer, notes, noteBooks,
        todos: allTodos, events: allEvents, invoices: allInvoices,
        deals, activities, emails, followUps,
      })
      setBriefState({ kind: 'ready', briefing })
      setSkipped(false)
    } catch (err) {
      const e = err as { message?: string }
      if (err instanceof MissingApiKeyError) {
        setBriefState({ kind: 'error', missingKey: true, message: e.message ?? 'Kein API-Key' })
      } else {
        setBriefState({ kind: 'error', message: e.message ?? String(err) })
      }
    }
  }

  // Bei Customer-Wechsel: Zustand zuruecksetzen
  useEffect(() => {
    setBriefState({ kind: 'idle' })
    setSkipped(false)
  }, [customerId])

  if (!customer) {
    return <div style={{ padding: 32, color: 'var(--fg-dim)' }}>Kunde nicht gefunden.</div>
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 14,
      padding: '20px 24px 40px', overflow: 'auto', height: '100%',
      maxWidth: 1100, margin: '0 auto', width: '100%',
    }}>
      {/* ── KPI-Strip — eine Card, vier Zellen, dezente Trennlinien ──── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1px 1fr 1px 1fr 1px 1fr',
        alignItems: 'stretch',
        borderRadius: 16, border: '1px solid var(--border)',
        background: 'var(--bg-2)', padding: '20px 8px',
      }}>
        <KpiCell
          icon={Calendar}
          label="Kunde seit"
          value={fmtMonthYear(customer.createdAt)}
          sub={`${monthsBetween(customer.createdAt)} ${monthsBetween(customer.createdAt) === 1 ? 'Monat' : 'Monate'}`}
        />
        <span style={{ background: 'var(--border)', alignSelf: 'stretch' }} />
        <KpiCell
          icon={Wallet}
          label="Worth"
          value={
            <span>
              {fmtEuroShort(worthTotal)}
              <span style={{
                fontSize: 16, color: 'var(--fg-dim)', marginLeft: 2,
                fontFamily: 'var(--font-mono)', fontWeight: 600,
              }}>€</span>
            </span>
          }
          sub={worthMonth > 0 ? `${fmtEuro(worthMonth)} · diesen Monat` : 'noch nichts diesen Monat'}
        />
        <span style={{ background: 'var(--border)', alignSelf: 'stretch' }} />
        <KpiCell
          icon={TrendingUp}
          label="Im Spiel"
          value={
            <span>
              {fmtEuroShort(inSpielValue)}
              <span style={{
                fontSize: 16, color: 'var(--fg-dim)', marginLeft: 2,
                fontFamily: 'var(--font-mono)', fontWeight: 600,
              }}>€</span>
            </span>
          }
          sub={openDeals.length > 0
            ? `${openDeals.length} ${openDeals.length === 1 ? 'Deal' : 'Deals'} offen`
            : 'keine offenen Deals'}
        />
        <span style={{ background: 'var(--border)', alignSelf: 'stretch' }} />
        <KpiCell
          icon={Phone}
          label="Letzter Kontakt"
          value={
            lastDays === null
              ? '—'
              : lastDays === 0 ? 'heute'
              : lastDays === 1 ? 'gestern'
              : <span>{lastDays} <span style={{ fontSize: 16, color: 'var(--fg-dim)', marginLeft: 2, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>T</span></span>
          }
          sub={channelLabel === '—' ? undefined : channelLabel}
          accent={lastDays !== null && lastDays <= 7}
        />
      </div>

      {/* ── Alert ──────────────────────────────────────────────────────── */}
      {overdueList.length > 0 && (
        <OverdueAlert
          count={overdueList.length}
          total={overdueTotal}
          onClick={() => setActiveTab('finanzen')}
        />
      )}

      {/* ── Naechster Zug ─────────────────────────────────────────────── */}
      {!skipped && (
        <NextMoveCard
          customerId={customerId}
          state={briefState}
          onRegenerate={runBriefing}
          onSkip={() => setSkipped(true)}
        />
      )}

      {/* ── Posteingang ───────────────────────────────────────────────── */}
      <InboxMini customerId={customerId} />

      {/* ── Indirekter Hinweis, wenn ueberhaupt nichts da ist ────────── */}
      {!customer.email && openDeals.length === 0 && overdueList.length === 0 && (
        <div style={{
          textAlign: 'center', color: 'var(--fg-dim)', fontSize: 11.5,
          padding: '12px 0',
        }}>
          <ClockIcon size={11} style={{ display: 'inline-block', verticalAlign: '-1px', marginRight: 5 }} />
          Neuer Kunde — fuelle Stammdaten unter „Stammdaten" aus.
        </div>
      )}
    </div>
  )
}
