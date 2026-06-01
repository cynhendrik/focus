import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { invoke } from '@tauri-apps/api/core'
import { useFinanceStore } from '@/store/finance.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { useToastStore } from '@/store/toast.store'
import { FinanceService } from '@/services/finance.service'
import { InvoiceForm } from '@/components/finance/InvoiceForm'
import { log } from '@/lib/logger'
import type { Todo } from '@/types/todo.types'
import type { InvoiceItem, InvoiceWithItems } from '@/types/finance.types'
import type { Contact } from '@/types/contact.types'
import { FileText, Paperclip, Clock, X } from 'lucide-react'

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
  const invoices    = useFinanceStore(s => s.invoices)
  const accounts    = useAccountsStore(s => s.accounts)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId)
  const userId      = useAuthStore(s => s.user?.id)
  const showToast   = useToastStore(s => s.show)

  const invoice = invoices.find(i => i.id === todo.sourceRef)
  const account = invoice ? accounts.find(a => a.id === invoice.accountId) : undefined

  const [items, setItems]                       = useState<InvoiceItem[]>([])
  const [invoiceWithItems, setInvoiceWithItems] = useState<InvoiceWithItems | null>(null)
  const [billingEmail, setBillingEmail]         = useState<string>('')
  const [showForm, setShowForm]                 = useState(false)

  useEffect(() => {
    if (!invoice?.id) return
    FinanceService.getInvoice(invoice.id)
      .then(data => { setItems(data.items); setInvoiceWithItems(data) })
      .catch((err: unknown) => log.warn('Failed to load invoice', { invoiceId: invoice.id, err }))
  }, [invoice?.id])

  useEffect(() => {
    if (!invoice?.accountId) return
    invoke<Contact[]>('get_contacts', { accountId: invoice.accountId })
      .then(contacts => setBillingEmail(contacts.find(c => c.email)?.email ?? ''))
      .catch(() => {})
  }, [invoice?.accountId])

  const handleFormSaved = async () => {
    setShowForm(false)
    if (invoice && workspaceId && userId) {
      try {
        await FinanceService.approveInvoiceSuggestion(invoice.id, userId, workspaceId)
        showToast({ message: 'Rechnung erstellt & freigegeben.', variant: 'success' })
      } catch (err) {
        log.warn('Failed to approve invoice after form save', { invoiceId: invoice.id, err })
        showToast({ message: 'Rechnung gespeichert, Freigabe fehlgeschlagen.', variant: 'error' })
      }
    }
    await onComplete()
  }

  return (
    <>
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
                {billingEmail && (
                  <> (<span style={{ fontFamily: 'var(--font-mono)' }}>{billingEmail}</span>)</>
                )}
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
            onClick={() => setShowForm(true)}
            style={{
              flex: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px 20px', borderRadius: 99,
              border: 'none',
              background: 'var(--accent)',
              color: 'var(--accent-ink)',
              fontSize: 14, fontWeight: 700,
              boxShadow: '0 6px 20px -8px var(--accent-glow)',
              cursor: 'pointer',
              transition: 'all 200ms',
            }}
          >
            <FileText size={15} />
            Rechnung erstellen
          </button>
        </div>
      </div>

      {/* Invoice form drawer */}
      {showForm && createPortal(
        <>
          {/* Backdrop */}
          <div
            onClick={() => setShowForm(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 900,
              background: 'oklch(0% 0 0 / 0.45)',
            }}
          />
          {/* Drawer */}
          <div style={{
            position: 'fixed', right: 0, top: 0, zIndex: 910,
            width: 'min(720px, 100vw)',
            height: '100vh',
            background: 'var(--surface)',
            borderLeft: '1px solid var(--border)',
            boxShadow: '-16px 0 48px -12px oklch(0% 0 0 / 0.35)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* Drawer header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 24px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>
                Rechnung erstellen
                {account && <span style={{ color: 'var(--fg-muted)', fontWeight: 400 }}> · {account.name}</span>}
              </span>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: 'oklch(50% 0 0 / 0.06)',
                  border: 'none', color: 'var(--fg-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={14} />
              </button>
            </div>
            {/* Form */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              <InvoiceForm
                initial={invoiceWithItems ?? undefined}
                initialAccountId={invoice?.accountId}
                onClose={() => setShowForm(false)}
                onSaved={handleFormSaved}
              />
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}
