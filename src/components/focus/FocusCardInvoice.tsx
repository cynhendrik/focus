import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useFinanceStore } from '@/store/finance.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { useToastStore } from '@/store/toast.store'
import { useMailStore } from '@/store/mail.store'
import { useCompanyStore } from '@/store/company.store'
import { FinanceService } from '@/services/finance.service'
import { MailService } from '@/services/mail.service'
import { getInvoicePdfBytes } from '@/components/finance/InvoicePDF'
import { log } from '@/lib/logger'
import type { Todo } from '@/types/todo.types'
import type { InvoiceItem } from '@/types/finance.types'
import type { Contact } from '@/types/contact.types'
import { Send, Paperclip, Clock } from 'lucide-react'

interface Props {
  todo: Todo
  onComplete: () => Promise<void>
  onSkip: () => void
  onPostpone: () => Promise<void>
}

function formatEur(amount: number): string {
  return amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const ACCENT_RED = 'oklch(60% 0.2 25)'

export function FocusCardInvoice({ todo, onComplete, onSkip, onPostpone }: Props) {
  const invoices     = useFinanceStore(s => s.invoices)
  const accounts     = useAccountsStore(s => s.accounts)
  const workspaceId  = useWorkspaceStore(s => s.activeWorkspaceId)
  const userId       = useAuthStore(s => s.user?.id)
  const showToast    = useToastStore(s => s.show)
  const mailAccounts = useMailStore(s => s.accounts)
  const profile      = useCompanyStore(s => s.profile)

  const invoice = invoices.find(i => i.id === todo.sourceRef)
  const account = invoice ? accounts.find(a => a.id === invoice.accountId) : undefined

  const [items, setItems]           = useState<InvoiceItem[]>([])
  const [billingEmail, setBillingEmail] = useState<string>('')
  const [sending, setSending]       = useState(false)
  const [sendLabel, setSendLabel]   = useState('Rechnung erstellen & senden')

  useEffect(() => {
    if (!invoice?.id) return
    FinanceService.getInvoice(invoice.id)
      .then(data => setItems(data.items))
      .catch((err: unknown) => log.warn('Failed to load invoice items', { invoiceId: invoice.id, err }))
  }, [invoice?.id])

  useEffect(() => {
    if (!invoice?.accountId) return
    invoke<Contact[]>('get_contacts', { accountId: invoice.accountId })
      .then(contacts => setBillingEmail(contacts.find(c => c.email)?.email ?? ''))
      .catch(() => {})
  }, [invoice?.accountId])

  const handleCreateAndSend = async () => {
    if (!invoice || !workspaceId || !userId) {
      showToast({ message: 'Fehler: Daten nicht verfügbar.', variant: 'error' })
      return
    }
    setSending(true)
    try {
      // 1. Rechnung genehmigen
      setSendLabel('Wird erstellt…')
      await FinanceService.approveInvoiceSuggestion(invoice.id, userId, workspaceId)

      // 2. Frische Daten laden
      const fullInvoice = await FinanceService.getInvoice(invoice.id)

      // 3. PDF generieren + speichern (wenn Profil & Kunde vorhanden)
      let pdfPath: string | null = null
      if (profile && account) {
        setSendLabel('PDF wird generiert…')
        try {
          const bytes = await getInvoicePdfBytes(fullInvoice, profile, account)
          const safeClient = account.name.replace(/[/\\:*?"<>|]/g, '_').slice(0, 40)
          const filename = `Rechnung_${invoice.number ?? invoice.id}_${safeClient}.pdf`
          pdfPath = await invoke<string>('save_pdf', {
            bytes: Array.from(bytes),
            suggestedName: filename,
          })
        } catch (err) {
          log.warn('PDF generation failed', { invoiceId: invoice.id, err })
        }
      }

      // 4. E-Mail mit Anhang senden (wenn Konto + Empfänger vorhanden)
      if (mailAccounts[0] && billingEmail) {
        setSendLabel('Wird gesendet…')
        const invoiceNum = invoice.number ?? 'Entwurf'
        await MailService.sendEmail({
          accountId: mailAccounts[0].id,
          to: [billingEmail],
          subject: `Rechnung ${invoiceNum} · ${formatEur(invoice.total)} €`,
          bodyText: `Sehr geehrte Damen und Herren,\n\nim Anhang finden Sie die Rechnung ${invoiceNum} über ${formatEur(invoice.total)} €.\n\nBei Fragen stehen wir Ihnen gerne zur Verfügung.\n\nMit freundlichen Grüßen`,
          ...(pdfPath ? { attachmentPaths: [pdfPath] } : {}),
        })
        showToast({ message: 'Rechnung erstellt & gesendet.', variant: 'success' })
      } else {
        showToast({ message: 'Rechnung erstellt.', variant: 'success' })
      }

      await onComplete()
    } catch (err) {
      log.warn('Failed to create/send invoice', { invoiceId: invoice.id, err })
      showToast({ message: 'Fehler beim Erstellen der Rechnung.', variant: 'error' })
    } finally {
      setSending(false)
      setSendLabel('Rechnung erstellen & senden')
    }
  }

  return (
    <div style={{
      background: 'var(--surface-2)',
      borderLeft: `4px solid ${ACCENT_RED}`,
      borderRadius: 18,
      padding: '32px 36px',
      display: 'flex',
      flexDirection: 'column',
      gap: 24,
      boxShadow: '0 8px 40px -12px oklch(0% 0 0 / 0.3)',
    }}>
      {/* Meta row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: `${ACCENT_RED}22`, color: ACCENT_RED,
            fontWeight: 700, fontFamily: 'var(--font-mono)',
            letterSpacing: '0.06em', textTransform: 'uppercase',
            padding: '3px 9px', borderRadius: 99, fontSize: 10,
          }}>
            ↗ RECHNUNG
          </span>
          {account && (
            <span style={{ color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
              <span style={{ width: 5, height: 5, borderRadius: 99, background: ACCENT_RED, display: 'inline-block' }} />
              {account.name}
            </span>
          )}
        </div>
        {invoice && (
          <span style={{ color: 'var(--fg)', fontWeight: 600, fontSize: 15 }}>
            {Math.round(invoice.total / 1000)}k €
          </span>
        )}
      </div>

      {/* Title */}
      <h1 style={{
        fontFamily: 'var(--font-display)',
        fontSize: 32, fontWeight: 600,
        letterSpacing: '-0.02em', lineHeight: 1.05,
        margin: 0, color: 'var(--fg)',
      }}>
        {todo.title}
      </h1>

      {todo.notes && (
        <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.5 }}>
          {todo.notes}
        </p>
      )}

      {/* Invoice preview */}
      {invoice && (
        <div style={{ background: 'var(--surface-3)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
              {invoice.number ?? 'Entwurf'} · {account?.name ?? ''}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                background: `${ACCENT_RED}18`, color: ACCENT_RED,
                padding: '2px 7px', borderRadius: 99, fontFamily: 'var(--font-mono)',
              }}>NEU</span>
              {invoice.dealId && (
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  background: 'oklch(50% 0 0 / 0.1)', color: 'var(--fg-muted)',
                  padding: '2px 7px', borderRadius: 99, fontFamily: 'var(--font-mono)',
                }}>AUS ANGEBOT</span>
              )}
            </div>
          </div>

          <div style={{ padding: '4px 0' }}>
            {items.map(item => (
              <div key={item.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '9px 16px', fontSize: 13, color: 'var(--fg)',
                borderBottom: '1px solid oklch(50% 0 0 / 0.06)',
              }}>
                <span>{item.title}</span>
                <span style={{ fontFamily: 'var(--font-mono)', flexShrink: 0, marginLeft: 16 }}>
                  {formatEur(item.total)} €
                </span>
              </div>
            ))}
            {items.length === 0 && (
              <div style={{ padding: '9px 16px', fontSize: 13, color: 'var(--fg-dim)' }}>
                Lade Positionen…
              </div>
            )}
          </div>

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', borderTop: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-dim)' }}>
              Gesamt · Netto
            </span>
            <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--fg)' }}>
              {formatEur(invoice.total)} €
            </span>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 16px',
            background: 'oklch(92% 0.2 125 / 0.06)',
            borderTop: '1px solid oklch(92% 0.2 125 / 0.12)',
            fontSize: 12, color: 'oklch(70% 0.15 125)',
          }}>
            <Paperclip size={12} style={{ flexShrink: 0 }} />
            <span>
              Wird als PDF an die Buchhaltung
              {billingEmail
                ? <> (<span style={{ fontFamily: 'var(--font-mono)' }}>{billingEmail}</span>)</>
                : ' (keine E-Mail hinterlegt)'
              }
              {' '}gesendet.
            </span>
          </div>
        </div>
      )}

      {/* Action row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={onSkip}
          style={{
            display: 'flex', alignItems: 'center',
            padding: '10px 18px', borderRadius: 99,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--fg-muted)', fontSize: 13, cursor: 'pointer',
          }}
        >
          Überspringen
        </button>

        <button
          type="button"
          onClick={() => { onPostpone().catch(() => {}) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 16px', borderRadius: 99,
            border: 'none', background: 'oklch(50% 0 0 / 0.08)',
            color: 'var(--fg)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Clock size={14} />
          Morgen
          <span style={{ fontSize: 10, opacity: 0.6, fontFamily: 'var(--font-mono)' }}>M</span>
        </button>

        <button
          type="button"
          onClick={handleCreateAndSend}
          disabled={sending}
          style={{
            flex: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '12px 20px', borderRadius: 99,
            border: 'none',
            background: sending ? 'var(--surface-3)' : 'var(--accent)',
            color: sending ? 'var(--fg-muted)' : 'var(--accent-ink)',
            fontSize: 14, fontWeight: 700,
            boxShadow: sending ? 'none' : '0 6px 20px -8px var(--accent-glow)',
            cursor: sending ? 'not-allowed' : 'pointer',
            transition: 'all 200ms',
          }}
        >
          <Send size={15} />
          {sendLabel}
        </button>
      </div>
    </div>
  )
}
