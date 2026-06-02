import { useState, useEffect, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useFinanceStore } from '@/store/finance.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useTodosStore } from '@/store/todos.store'
import { useMailStore } from '@/store/mail.store'
import { useToastStore } from '@/store/toast.store'
import { MailService } from '@/services/mail.service'
import { getDunningState } from '@/hooks/useOverdueTaskSync'
import { generateCorraDraft } from '@/lib/ai/corra'
import { log } from '@/lib/logger'
import type { Todo } from '@/types/todo.types'
import type { Contact } from '@/types/contact.types'
import { Send, Sparkles, Loader, AlertTriangle, Mail } from 'lucide-react'

interface Props {
  todo: Todo
  onComplete: () => Promise<void>
  onSkip: () => void
  onPostpone: () => Promise<void>
}

function formatEur(amount: number): string {
  return amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function buildSubject(level: number, invoiceNumber: string | undefined, total: number): string {
  const num = invoiceNumber ?? 'Entwurf'
  const amt = formatEur(total)
  if (level === 0) return `Zahlungserinnerung · Rechnung ${num} · ${amt} €`
  if (level === 1) return `1. Mahnung · Rechnung ${num} · ${amt} €`
  return `2. Mahnung · Rechnung ${num} · ${amt} € [dringend]`
}

const LEVEL_COLOR = [
  'oklch(78% 0.22 125)',  // Erinnerung — accent green
  'oklch(62% 0.2 25)',    // 1. Mahnung — orange-red
  'oklch(55% 0.25 15)',   // 2. Mahnung — deep red
]
const LEVEL_BADGE = ['Zahlungserinnerung', '1. Mahnung', '2. Mahnung']

export function FocusCardReminder({ todo, onComplete, onSkip, onPostpone }: Props) {
  const invoices     = useFinanceStore(s => s.invoices)
  const accounts     = useAccountsStore(s => s.accounts)
  const allTodos     = useTodosStore(s => s.allTodos)
  const mailAccounts = useMailStore(s => s.accounts)
  const showToast    = useToastStore(s => s.show)

  const invoice = invoices.find(i => i.id === todo.sourceRef)
  const account = invoice ? accounts.find(a => a.id === invoice.accountId) : undefined

  const dunningLevel = useMemo(() => {
    if (!invoice) return 0
    return allTodos.filter(
      t => t.sourceRef === invoice.id && t.actionType === 'send_reminder' && t.status === 'done',
    ).length
  }, [invoice, allTodos])

  const accentColor = LEVEL_COLOR[dunningLevel] ?? LEVEL_COLOR[2]
  const daysOverdue = invoice
    ? Math.max(0, Math.floor((Date.now() - new Date(invoice.dueDate).getTime()) / 86_400_000))
    : 0

  const [subject, setSubject]     = useState(invoice ? buildSubject(dunningLevel, invoice.number, invoice.total) : todo.title)
  const [body, setBody]           = useState('')
  const [recipient, setRecipient] = useState('')
  const [sending, setSending]     = useState(false)
  const [generating, setGenerating] = useState(false)
  const [hasCorraDraft, setHasCorraDraft] = useState(false)

  // Load contact email
  useEffect(() => {
    if (!invoice?.accountId) return
    invoke<Contact[]>('get_contacts', { accountId: invoice.accountId })
      .then(contacts => setRecipient(contacts.find(c => c.email)?.email ?? ''))
      .catch((err: unknown) => log.warn('Failed to load contacts for reminder', { err }))
  }, [invoice?.accountId])

  // Generate CORRA draft on mount
  useEffect(() => {
    if (!invoice || !account) return
    setGenerating(true)
    generateCorraDraft({
      kind: 'reminder',
      customerName: account.name,
      invoiceNumber: invoice.number ?? invoice.id.slice(0, 8),
      amount: invoice.total,
      dueDate: invoice.dueDate,
      daysOverdue,
      dunningLevel,
    })
      .then(draft => {
        if (draft) { setBody(draft); setHasCorraDraft(true) }
      })
      .catch(() => {
        // Fallback template
        setBody(dunningLevel === 0
          ? `Hey, kleine Erinnerung: Die Rechnung ${invoice.number ?? ''} über ${formatEur(invoice.total)} € ist seit ${daysOverdue} Tagen fällig. Falls schon überwiesen, einfach ignorieren — ansonsten freuen wir uns über die Zahlung. Bei Fragen einfach melden!`
          : `Hallo, wir melden uns nochmals wegen der offenen Rechnung ${invoice.number ?? ''} über ${formatEur(invoice.total)} € (fällig seit ${daysOverdue} Tagen). Bitte überweise den Betrag bis Ende der Woche. Bei Fragen sind wir für dich da.`
        )
      })
      .finally(() => setGenerating(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id, dunningLevel])

  const regenerate = async () => {
    if (!invoice || !account || generating) return
    setGenerating(true)
    try {
      const draft = await generateCorraDraft({
        kind: 'reminder',
        customerName: account.name,
        invoiceNumber: invoice.number ?? invoice.id.slice(0, 8),
        amount: invoice.total,
        dueDate: invoice.dueDate,
        daysOverdue,
        dunningLevel,
      })
      if (draft) { setBody(draft); setHasCorraDraft(true) }
    } catch {
      showToast({ message: 'CORRA konnte keinen Entwurf generieren.', variant: 'error' })
    } finally {
      setGenerating(false)
    }
  }

  const handleSend = async () => {
    if (!mailAccounts[0]) { showToast({ message: 'Kein E-Mail-Konto konfiguriert.', variant: 'error' }); return }
    if (!recipient.trim()) { showToast({ message: 'Bitte Empfänger-E-Mail angeben.', variant: 'error' }); return }
    setSending(true)
    try {
      await MailService.sendEmail({
        accountId: mailAccounts[0].id,
        to: [recipient.trim()],
        subject: subject.trim(),
        bodyText: body.trim(),
      })
      showToast({ message: `${LEVEL_BADGE[dunningLevel] ?? 'Mahnung'} gesendet.`, variant: 'success' })
      await onComplete()
    } catch {
      showToast({ message: 'Senden fehlgeschlagen.', variant: 'error' })
    } finally {
      setSending(false)
    }
  }

  const nextState = invoice ? getDunningState(invoice, allTodos) : null

  return (
    <div style={{
      background: 'var(--surface-2)',
      borderLeft: `4px solid ${accentColor}`,
      borderRadius: 18,
      padding: '32px 36px',
      boxShadow: '0 8px 40px -12px oklch(0% 0 0 / 0.3)',
      display: 'flex', flexDirection: 'column', gap: 24,
    }}>

      {/* Title block */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: accentColor,
            background: `${accentColor}18`,
            padding: '3px 9px', borderRadius: 99,
          }}>
            {LEVEL_BADGE[dunningLevel] ?? '2. Mahnung'}
          </span>
          {account && (
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
              · {account.name}
            </span>
          )}
        </div>

        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 34, fontWeight: 700,
          letterSpacing: '-0.03em', lineHeight: 1.0,
          margin: 0, color: 'var(--fg)',
        }}>
          {invoice
            ? `${LEVEL_BADGE[dunningLevel] ?? 'Mahnung'} für ${Math.round(invoice.total / 100) * 100 === invoice.total
                ? formatEur(invoice.total)
                : formatEur(invoice.total)} € schicken`
            : todo.title}
        </h1>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ color: accentColor, fontSize: 14, marginTop: 1, flexShrink: 0 }}>→</span>
          <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.6 }}>
            {invoice
              ? dunningLevel === 0
                ? `${invoice.number ?? ''} ist seit dem ${new Date(invoice.dueDate).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} überfällig. Je länger es liegt, desto unangenehmer wird das Gespräch — eine freundliche Erinnerung heute löst es meistens.`
                : dunningLevel === 1
                ? `Zahlungserinnerung wurde ignoriert — ${daysOverdue} Tage überfällig. Jetzt Zeit für eine formelle 1. Mahnung.`
                : `Zwei Erinnerungen ignoriert — ${daysOverdue} Tage überfällig. Das ist die letzte Warnung vor weiteren Schritten.`
              : todo.notes ?? ''
            }
          </p>
        </div>

        {dunningLevel >= 2 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 14px', borderRadius: 10,
            background: `${accentColor}10`, border: `1px solid ${accentColor}28`,
            fontSize: 12, color: accentColor,
          }}>
            <AlertTriangle size={13} />
            Nach dieser Mahnung: manuell über Inkasso / rechtliche Schritte entscheiden.
          </div>
        )}
      </div>

      {/* Compose area */}
      <div style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        overflow: 'hidden',
      }}>
        {/* Channel picker + CORRA label */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 8,
                background: 'var(--accent)', color: 'var(--accent-ink)',
                border: 'none', fontSize: 12, fontWeight: 600, cursor: 'default',
              }}
            >
              <Mail size={12} /> E-Mail
            </button>
          </div>
          {hasCorraDraft && !generating && (
            <span style={{
              fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--fg-dim)',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <Sparkles size={9} /> CORRA-ENTWURF · EDITIERBAR
            </span>
          )}
          {generating && (
            <span style={{ fontSize: 9, color: 'var(--fg-dim)', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
              <Loader size={9} style={{ animation: 'spin 1s linear infinite' }} /> CORRA DENKT…
            </span>
          )}
        </div>

        {/* AN */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '10px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)', flexShrink: 0, width: 44 }}>AN</span>
          <input
            value={recipient}
            onChange={e => setRecipient(e.target.value)}
            placeholder="E-Mail-Adresse…"
            style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 13, color: 'var(--fg)', outline: 'none' }}
          />
        </div>

        {/* BETREFF */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '10px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)', flexShrink: 0, width: 44 }}>BETREFF</span>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 13, color: 'var(--fg)', fontWeight: 600, outline: 'none' }}
          />
        </div>

        {/* Body */}
        <textarea
          value={generating ? '…' : body}
          onChange={e => setBody(e.target.value)}
          disabled={generating}
          rows={5}
          style={{
            width: '100%', background: 'transparent', border: 'none',
            padding: '14px 16px', fontSize: 14, color: generating ? 'var(--fg-dim)' : 'var(--fg)',
            outline: 'none', resize: 'none', lineHeight: 1.65,
            fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Next level hint */}
      {nextState && dunningLevel < 2 && (
        <p style={{ fontSize: 11, color: 'var(--fg-dim)', margin: 0 }}>
          Bei ausbleibender Zahlung erscheint in {dunningLevel === 0 ? 7 : 14} Tagen automatisch die {dunningLevel === 0 ? '1. Mahnung' : '2. Mahnung'}.
        </p>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || generating}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '11px 22px', borderRadius: 99, border: 'none',
            background: (sending || generating) ? 'var(--surface-3)' : 'var(--accent)',
            color: (sending || generating) ? 'var(--fg-muted)' : 'var(--accent-ink)',
            fontSize: 13, fontWeight: 700,
            boxShadow: (sending || generating) ? 'none' : '0 4px 16px -6px var(--accent-glow)',
            cursor: (sending || generating) ? 'not-allowed' : 'pointer',
            transition: 'all 200ms',
          }}
        >
          <Send size={14} />
          {sending ? 'Wird gesendet…' : 'Erinnerung senden'}
        </button>

        <button
          type="button"
          onClick={regenerate}
          disabled={generating}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '11px 18px', borderRadius: 99,
            border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: generating ? 'var(--fg-dim)' : 'var(--fg)',
            fontSize: 13, fontWeight: 600, cursor: generating ? 'not-allowed' : 'pointer',
          }}
        >
          {generating
            ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
            : <Sparkles size={13} />
          }
          Corra neu
        </button>

        <button
          type="button"
          onClick={() => { onPostpone().catch(() => {}) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '11px 16px', borderRadius: 99,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--fg-muted)', fontSize: 13, cursor: 'pointer',
          }}
        >
          Morgen
          <span style={{ fontSize: 9, opacity: 0.5, fontFamily: 'var(--font-mono)' }}>M</span>
        </button>

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={onSkip}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'none', border: 'none',
            color: 'var(--fg-dim)', fontSize: 13, cursor: 'pointer', padding: '11px 4px',
          }}
        >
          Überspringen <span style={{ opacity: 0.5 }}>→</span>
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
