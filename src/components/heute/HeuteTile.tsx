import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useMailStore } from '@/store/mail.store'
import { useAccountsStore } from '@/store/accounts.store'
import { TileBodyTodo } from './TileBodyTodo'
import { TileBodyMail } from './TileBodyMail'
import type { HeuteQueueItem } from '@/lib/ai/heute-queue'

interface Props {
  item: HeuteQueueItem
  index: number
  total: number
  onDone: () => Promise<void>
  onSkip: () => void
}

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {Array.from({ length: Math.min(total, 7) }).map((_, i) => (
        <div key={i} style={{
          width: i === current ? 8 : 6,
          height: i === current ? 8 : 6,
          borderRadius: '50%',
          background: i === current ? 'var(--accent)' : 'var(--surface-3)',
          boxShadow: i === current ? '0 0 6px var(--accent-glow)' : 'none',
          transition: 'all 200ms',
        }} />
      ))}
      <span style={{ fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', marginLeft: 4 }}>
        {current + 1} / {total}
      </span>
    </div>
  )
}

function deriveHeadline(item: HeuteQueueItem, name: string, total?: number): string {
  if (item.type === 'invoice_reminder') {
    const amount = total != null
      ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(total)
      : ''
    return `Zahlungserinnerung${amount ? ` für ${amount}` : ''} schicken`
  }
  if (item.type === 'mail_reply') return `${name ? name + ' ' : ''}antworten`
  if (item.type === 'followup')   return `Follow-up: ${name}`
  return ''
}

export function HeuteTile({ item, index, total, onDone, onSkip }: Props) {
  const invoices = useFinanceStore(s => s.invoices)
  const todos    = useTodosStore(s => s.allTodos)
  const emails   = useMailStore(s => s.emails)
  const accounts = useAccountsStore(s => s.accounts)

  const invoice = item.type === 'invoice_reminder'
    ? invoices.find(i => i.id === item.id) ?? null
    : null

  const todo = (item.type === 'todo' || item.type === 'mail_reply' || item.type === 'followup')
    ? todos.find(t => t.id === item.id) ?? null
    : null

  const email = item.type === 'mail_reply' && !todo
    ? emails.find(e => e.id === item.id) ?? null
    : null

  const accountId = invoice?.accountId ?? todo?.customerId
  const account   = accountId ? accounts.find(a => a.id === accountId) : undefined

  const headline = (() => {
    if (item.type === 'invoice_reminder' && invoice) return deriveHeadline(item, account?.name ?? '', invoice.total)
    if (todo) return todo.actionType ? deriveHeadline(item, account?.name ?? '') : todo.title
    if (email) return `${email.fromName ?? email.fromAddr} antworten`
    return item.type.replace('_', ' ')
  })()

  const renderBody = () => {
    if (item.type === 'invoice_reminder' && invoice) {
      return <TileBodyMail mode="invoice_reminder" invoice={invoice} onDone={onDone} onSkip={onSkip} />
    }
    if (item.type === 'followup' && todo) {
      return <TileBodyMail mode="followup" todo={todo} onDone={onDone} onSkip={onSkip} />
    }
    if (item.type === 'mail_reply' && todo) {
      return <TileBodyMail mode="reply_mail" todo={todo} onDone={onDone} onSkip={onSkip} />
    }
    if (todo) {
      return <TileBodyTodo todo={todo} onDone={onDone} onSkip={onSkip} />
    }
    return (
      <div style={{ color: 'var(--fg-dim)', fontSize: 13 }}>
        Aufgabe konnte nicht geladen werden.
        <button onClick={onSkip} style={{ marginLeft: 12, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13 }}>
          Überspringen →
        </button>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--surface-1)',
      border: '1px solid var(--border)',
      borderLeft: '3px solid var(--accent)',
      borderRadius: 16,
      padding: '28px 32px',
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: 'var(--accent)', boxShadow: '0 0 8px var(--accent-glow)',
          }} />
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
            color: 'var(--accent)', fontFamily: 'var(--font-mono)',
          }}>
            DEIN NÄCHSTER ZUG
          </span>
        </div>
        <ProgressDots current={index} total={total} />
      </div>

      {/* Headline + reason */}
      <div>
        <h2 style={{
          fontSize: 26, fontWeight: 800, color: 'var(--fg)',
          letterSpacing: '-0.03em', lineHeight: 1.2, margin: 0,
        }}>
          {headline}
        </h2>
        {item.reason && (
          <p style={{
            fontSize: 13, color: 'var(--fg-dim)', marginTop: 10,
            lineHeight: 1.6, display: 'flex', gap: 8, alignItems: 'flex-start',
            margin: '10px 0 0 0',
          }}>
            <span style={{ color: 'var(--accent)', flexShrink: 0 }}>→</span>
            {item.reason}
          </p>
        )}
      </div>

      {/* Body */}
      {renderBody()}
    </div>
  )
}
