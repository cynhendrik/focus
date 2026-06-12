import { useMemo } from 'react'
import { CheckSquare, Mail, FileText, Clock, type LucideIcon } from 'lucide-react'
import { useTodosStore } from '@/store/todos.store'
import { useMailStore } from '@/store/mail.store'
import { useCrmStore } from '@/store/crm.store'
import { useFinanceStore } from '@/store/finance.store'
import type { Todo } from '@/types/todo.types'
import type { EmailHeader } from '@/types/mail.types'
import type { FollowUp } from '@/types/crm.types'
import type { Invoice } from '@/types/finance.types'

function fmtEuro(n: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n)
}

function relTimeShort(iso: string): string {
  const t = new Date(iso).getTime()
  const min = Math.floor((Date.now() - t) / 60_000)
  if (min < 60) return `vor ${Math.max(1, min)} Min.`
  const h = Math.floor(min / 60)
  if (h < 24) return h === 1 ? 'vor 1 Std.' : `vor ${h} Std.`
  const d = Math.floor(h / 24)
  if (d === 1) return 'gestern'
  if (d < 30) return `vor ${d} Tagen`
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
}

function todayIso(): string {
  return new Date().toLocaleDateString('sv')
}

const PRIORITY_ORDER: Record<string, number> = { p1: 0, p2: 1, p3: 2, p4: 3 }

const PRIORITY_COLORS: Record<string, { bg: string; ink: string }> = {
  p1: { bg: 'oklch(72% 0.20 25 / 0.15)',  ink: 'oklch(72% 0.20 25)' },
  p2: { bg: 'oklch(82% 0.17 60 / 0.15)',  ink: 'oklch(82% 0.17 60)' },
  p3: { bg: 'oklch(82% 0.18 145 / 0.12)', ink: 'oklch(82% 0.18 145)' },
  p4: { bg: 'var(--surface-3)',            ink: 'var(--fg-dim)' },
}

const BUCKET_LABELS: Record<string, string> = {
  today: 'Heute', in_progress: 'In Bearbeitung', backlog: 'Backlog',
}

// ── Shared sub-components ────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, label, count }: {
  icon: LucideIcon
  label: string
  count: number
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
      <Icon size={12} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em',
        textTransform: 'uppercase', color: 'var(--fg-dim)', fontWeight: 600,
      }}>
        {label}
      </span>
      {count > 0 && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-dim)' }}>
          ({count})
        </span>
      )}
    </div>
  )
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 12, color: 'var(--fg-dim)', padding: '8px 0', fontStyle: 'italic' }}>
      {text}
    </div>
  )
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '7px 0', borderBottom: '1px solid var(--border)',
}

// ── Aufgaben ─────────────────────────────────────────────────────────────────

function AufgabenSection({ todos }: { todos: Todo[] }) {
  const sorted = useMemo(() => [...todos].sort((a, b) => {
    const diff = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)
    return diff !== 0 ? diff : b.updatedAt.localeCompare(a.updatedAt)
  }), [todos])

  return (
    <div>
      <SectionHeader icon={CheckSquare} label="Aufgaben" count={sorted.length} />
      {sorted.length === 0
        ? <EmptyRow text="Keine offenen Aufgaben" />
        : sorted.map(todo => {
          const pc = PRIORITY_COLORS[todo.priority] ?? PRIORITY_COLORS.p4
          return (
            <div key={todo.id} style={rowStyle}>
              <span style={{
                fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
                padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                background: pc.bg, color: pc.ink, textTransform: 'uppercase',
              }}>
                {todo.priority}
              </span>
              <span style={{
                flex: 1, fontSize: 13, color: 'var(--fg)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {todo.title}
              </span>
              <span style={{
                fontSize: 11, color: 'var(--fg-dim)', flexShrink: 0,
                fontFamily: 'var(--font-mono)',
              }}>
                {BUCKET_LABELS[todo.bucket] ?? todo.bucket}
              </span>
            </div>
          )
        })
      }
    </div>
  )
}

// ── Mails ────────────────────────────────────────────────────────────────────

function MailsSection({ emails }: { emails: EmailHeader[] }) {
  const top5 = useMemo(() =>
    [...emails].sort((a, b) => b.sentAt.localeCompare(a.sentAt)).slice(0, 5),
  [emails])

  return (
    <div>
      <SectionHeader icon={Mail} label="Mails" count={emails.length} />
      {top5.length === 0
        ? <EmptyRow text="Keine ungelesenen Mails" />
        : top5.map(email => (
          <div key={email.id} style={rowStyle}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12.5, fontWeight: 600, color: 'var(--fg)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {email.fromName || email.fromAddr}
              </div>
              <div style={{
                fontSize: 11.5, color: 'var(--fg-muted)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {email.subject.length > 60 ? `${email.subject.slice(0, 60)}…` : email.subject}
              </div>
            </div>
            <span style={{
              fontSize: 11, color: 'var(--fg-dim)', flexShrink: 0,
              fontFamily: 'var(--font-mono)',
            }}>
              {relTimeShort(email.sentAt)}
            </span>
          </div>
        ))
      }
    </div>
  )
}

// ── Offen (Rechnungen + Follow-ups) ──────────────────────────────────────────

function OffenSection({ invoices, followUps }: { invoices: Invoice[]; followUps: FollowUp[] }) {
  const today = todayIso()

  const sortedInvoices = useMemo(() => [...invoices].sort((a, b) => {
    if (a.status === 'overdue' && b.status !== 'overdue') return -1
    if (b.status === 'overdue' && a.status !== 'overdue') return 1
    return a.dueDate.localeCompare(b.dueDate)
  }), [invoices])

  const sortedFollowUps = useMemo(() =>
    [...followUps].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
  [followUps])

  const total = invoices.length + followUps.length

  return (
    <div>
      <SectionHeader icon={FileText} label="Offen" count={total} />
      {total === 0 ? (
        <EmptyRow text="Nichts Offenes" />
      ) : (
        <>
          {sortedInvoices.map(inv => {
            const isOverdue = inv.status === 'overdue'
            const dueFmt = new Date(inv.dueDate).toLocaleDateString('de-DE', {
              day: '2-digit', month: 'short',
            })
            return (
              <div key={inv.id} style={rowStyle}>
                <span style={{
                  fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                  textTransform: 'uppercase',
                  background: isOverdue ? 'oklch(72% 0.20 25 / 0.12)' : 'var(--surface-3)',
                  color: isOverdue ? 'oklch(72% 0.20 25)' : 'var(--fg-dim)',
                }}>
                  {isOverdue ? 'Überfällig' : 'Offen'}
                </span>
                <span style={{
                  flex: 1, fontSize: 13, color: 'var(--fg)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {inv.number ? `Rechnung ${inv.number}` : 'Rechnung (Entwurf)'}
                </span>
                <span style={{
                  fontSize: 12, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
                  flexShrink: 0, fontWeight: 600,
                  color: isOverdue ? 'oklch(72% 0.20 25)' : 'var(--fg)',
                }}>
                  {fmtEuro(inv.total)}
                </span>
                <span style={{
                  fontSize: 11, flexShrink: 0, fontFamily: 'var(--font-mono)',
                  color: isOverdue ? 'oklch(72% 0.20 25)' : 'var(--fg-dim)',
                }}>
                  {dueFmt}
                </span>
              </div>
            )
          })}
          {sortedFollowUps.map(fu => {
            const isOverdue = fu.dueDate < today
            const dueFmt = new Date(fu.dueDate).toLocaleDateString('de-DE', {
              day: '2-digit', month: 'short',
            })
            return (
              <div key={fu.id} style={rowStyle}>
                <Clock size={12} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />
                <span style={{
                  flex: 1, fontSize: 13, color: 'var(--fg)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {fu.title}
                </span>
                <span style={{
                  fontSize: 11, flexShrink: 0, fontFamily: 'var(--font-mono)',
                  color: isOverdue ? 'oklch(72% 0.20 25)' : 'var(--fg-dim)',
                }}>
                  {dueFmt}
                </span>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

// ── Main export ──────────────────────────────────────────────────────────────

interface Props {
  accountId: string
}

export function CustomerFeedPane({ accountId }: Props) {
  const allTodos     = useTodosStore(s => s.allTodos)
  const emails       = useMailStore(s => s.emails)
  const allFollowUps = useCrmStore(s => s.allFollowUps)
  const invoices     = useFinanceStore(s => s.invoices)

  const todos = useMemo(
    () => allTodos.filter(t => t.customerId === accountId && t.status !== 'done'),
    [allTodos, accountId],
  )
  const unreadEmails = useMemo(
    () => emails.filter(e => e.customerId === accountId && !e.isRead),
    [emails, accountId],
  )
  const followUps = useMemo(
    () => allFollowUps.filter(f => f.customerId === accountId && f.status === 'offen'),
    [allFollowUps, accountId],
  )
  const openInvoices = useMemo(
    () => invoices.filter(i =>
      i.accountId === accountId && (i.status === 'open' || i.status === 'overdue'),
    ),
    [invoices, accountId],
  )

  const allEmpty = todos.length === 0 && unreadEmails.length === 0 &&
    followUps.length === 0 && openInvoices.length === 0

  if (allEmpty) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '32px 0', gap: 8,
        color: 'var(--fg-dim)',
      }}>
        <span style={{ fontSize: 20 }}>✓</span>
        <span style={{ fontSize: 13 }}>Alles erledigt</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <AufgabenSection todos={todos} />
      <MailsSection emails={unreadEmails} />
      <OffenSection invoices={openInvoices} followUps={followUps} />
    </div>
  )
}
