import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useFinanceStore } from '@/store/finance.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useMailStore } from '@/store/mail.store'
import { useToastStore } from '@/store/toast.store'
import { MailService } from '@/services/mail.service'
import { log } from '@/lib/logger'
import type { Todo } from '@/types/todo.types'
import type { Contact } from '@/types/contact.types'
import { Send, Mail, Clock } from 'lucide-react'

interface Props {
  todo: Todo
  onComplete: () => Promise<void>
  onSkip: () => void
  onPostpone: () => Promise<void>
}

function daysOverdue(dueDate: string): number {
  return Math.max(0, Math.floor(
    (Date.now() - new Date(dueDate).getTime()) / 86_400_000
  ))
}

function formatEur(amount: number): string {
  return amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function FocusCardReminder({ todo, onComplete, onSkip, onPostpone }: Props) {
  const invoices     = useFinanceStore(s => s.invoices)
  const accounts     = useAccountsStore(s => s.accounts)
  const mailAccounts = useMailStore(s => s.accounts)
  const showToast    = useToastStore(s => s.show)

  const invoice = invoices.find(i => i.id === todo.sourceRef)
  const account = invoice ? accounts.find(a => a.id === invoice.accountId) : undefined

  const defaultSubject = invoice
    ? `Zahlungserinnerung · Rechnung ${invoice.number ?? invoice.id.slice(0, 8)} · ${formatEur(invoice.total)} €`
    : todo.title

  const defaultBody = invoice && account
    ? `Guten Tag,\n\nmit dieser Nachricht möchten wir Sie freundlich daran erinnern, dass die Rechnung ${invoice.number ?? ''} über ${formatEur(invoice.total)} € seit dem ${new Date(invoice.dueDate).toLocaleDateString('de-DE')} fällig ist.\n\nWir bitten um Begleichung des offenen Betrags.\n\nBei Fragen stehen wir Ihnen gerne zur Verfügung.\n\nMit freundlichen Grüßen`
    : ''

  const [subject, setSubject]     = useState(defaultSubject)
  const [body, setBody]           = useState(defaultBody)
  const [recipient, setRecipient] = useState('')
  const [sending, setSending]     = useState(false)

  useEffect(() => {
    if (!invoice?.accountId) return
    invoke<Contact[]>('get_contacts', { accountId: invoice.accountId })
      .then(contacts => {
        const email = contacts.find(c => c.email)?.email ?? ''
        setRecipient(email)
      })
      .catch((err: unknown) => log.warn('Failed to load contacts for reminder', { accountId: invoice.accountId, err }))
  }, [invoice?.accountId])

  useEffect(() => {
    setSubject(defaultSubject)
    setBody(defaultBody)
    setRecipient('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id])

  const handleSend = async () => {
    if (!mailAccounts[0]) {
      showToast({ message: 'Kein E-Mail-Konto konfiguriert.', variant: 'error' })
      return
    }
    if (!recipient.trim()) {
      showToast({ message: 'Bitte Empfänger-E-Mail angeben.', variant: 'error' })
      return
    }
    if (!subject.trim()) {
      showToast({ message: 'Betreff darf nicht leer sein.', variant: 'error' })
      return
    }
    setSending(true)
    try {
      await MailService.sendEmail({
        accountId: mailAccounts[0].id,
        to: [recipient.trim()],
        subject: subject.trim(),
        bodyText: body.trim(),
      })
      showToast({ message: 'Erinnerung gesendet.', variant: 'success' })
      await onComplete()
    } catch {
      showToast({ message: 'Senden fehlgeschlagen. Bitte E-Mail-Verbindung prüfen.', variant: 'error' })
    } finally {
      setSending(false)
    }
  }

  const overdueDays = invoice ? daysOverdue(invoice.dueDate) : 0

  return (
    <div style={{
      background: 'var(--surface-2)',
      borderLeft: '4px solid oklch(60% 0.2 25)',
      borderRadius: 18,
      padding: '32px 36px',
      display: 'flex',
      flexDirection: 'column',
      gap: 24,
      boxShadow: '0 8px 40px -12px oklch(0% 0 0 / 0.3)',
    }}>
      {/* Meta row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 11 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            background: 'oklch(60% 0.2 25 / 0.15)',
            color: 'oklch(60% 0.2 25)',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            padding: '3px 9px',
            borderRadius: 99,
            fontSize: 10,
          }}>
            ↗ RECHNUNG
          </span>
          {account && (
            <span style={{ color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 5, height: 5, borderRadius: 99, background: 'oklch(60% 0.2 25)', display: 'inline-block' }} />
              {account.name}
            </span>
          )}
        </div>
        {invoice && (
          <span style={{ color: 'var(--fg)', fontWeight: 600, fontSize: 14 }}>
            {Math.round(invoice.total / 1000)}k €
          </span>
        )}
      </div>

      {/* Title */}
      <h1 style={{
        fontFamily: 'var(--font-display)',
        fontSize: 34,
        fontWeight: 600,
        letterSpacing: '-0.02em',
        lineHeight: 1.05,
        margin: 0,
        color: 'var(--fg)',
      }}>
        {todo.title}
      </h1>

      {/* Context */}
      {invoice && (
        <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.5 }}>
          → Rechnung {invoice.number ?? ''} ist seit {overdueDays} Tag{overdueDays !== 1 ? 'en' : ''} überfällig
          {overdueDays > 7 ? ' — je länger, desto unangenehmer das Gespräch.' : '.'}
        </p>
      )}

      {/* Email composer */}
      <div style={{
        background: 'var(--surface-3)',
        borderRadius: 12,
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--fg-dim)',
          marginBottom: 4,
        }}>
          <Mail size={12} />
          E-Mail-Entwurf · editierbar
        </div>

        <input
          value={recipient}
          onChange={e => setRecipient(e.target.value)}
          placeholder="Empfänger-E-Mail"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 13,
            color: 'var(--fg)',
            outline: 'none',
          }}
        />

        <input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 13,
            color: 'var(--fg)',
            outline: 'none',
            fontWeight: 600,
          }}
        />

        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={4}
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 13,
            color: 'var(--fg)',
            outline: 'none',
            resize: 'vertical',
            lineHeight: 1.55,
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Action row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginTop: 4,
      }}>
        <button
          type="button"
          onClick={onSkip}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px 18px',
            borderRadius: 99,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--fg-muted)',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Überspringen
        </button>

        <button
          type="button"
          onClick={() => { onPostpone().catch(() => {}) }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 16px',
            borderRadius: 99,
            border: 'none',
            background: 'oklch(50% 0 0 / 0.08)',
            color: 'var(--fg)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Clock size={14} />
          Morgen
          <span style={{ fontSize: 10, opacity: 0.6, fontFamily: 'var(--font-mono)' }}>M</span>
        </button>

        <button
          type="button"
          onClick={handleSend}
          disabled={sending}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '12px 20px',
            borderRadius: 99,
            border: 'none',
            background: sending ? 'var(--surface-3)' : 'var(--accent)',
            color: sending ? 'var(--fg-muted)' : 'var(--accent-ink)',
            fontSize: 14,
            fontWeight: 700,
            boxShadow: sending ? 'none' : '0 6px 20px -8px var(--accent-glow)',
            cursor: sending ? 'not-allowed' : 'pointer',
            transition: 'all 200ms',
          }}
        >
          <Send size={15} />
          {sending ? 'Wird gesendet…' : 'Erinnerung senden'}
        </button>
      </div>
    </div>
  )
}
