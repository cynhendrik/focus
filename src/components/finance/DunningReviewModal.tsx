import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { X, Send, Loader, AlertTriangle } from 'lucide-react'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useCompanyStore } from '@/store/company.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useToastStore } from '@/store/toast.store'
import { dueReminders, sendReminder, DEFAULT_DUNNING_FEES, prepareReminder, recordReminderSent } from '@/services/dunning.service'
import type { PreparedReminder } from '@/services/dunning.service'
import type { Contact } from '@/types/contact.types'
import type { Invoice } from '@/types/finance.types'
import { ComposeModal } from '@/components/mail/ComposeModal'

const LEVEL_LABEL = ['Zahlungserinnerung', '1. Mahnung', '2. Mahnung']
const fmtEur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function DunningReviewModal({ onClose }: { onClose: () => void }) {
  const invoices    = useFinanceStore(s => s.invoices)
  const payments    = useFinanceStore(s => s.payments)
  const loadAll     = useFinanceStore(s => s.loadAll)
  const todos       = useTodosStore(s => s.allTodos)
  const accounts    = useAccountsStore(s => s.accounts)
  const fees        = useCompanyStore(s => s.profile.dunningFees) ?? DEFAULT_DUNNING_FEES
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const showToast   = useToastStore(s => s.show)

  const items = dueReminders(invoices, todos, accounts, fees, payments)
  const [compose, setCompose] = useState<{ data: PreparedReminder; invoice: Invoice } | null>(null)
  const [emails, setEmails]   = useState<Record<string, string | null>>({})
  const [sending, setSending] = useState<string | null>(null)
  const [batch, setBatch]     = useState(false)

  useEffect(() => {
    let alive = true
    const accountIds = [...new Set(items.map(i => i.invoice.accountId))]
    Promise.all(accountIds.map(async id => {
      const contacts = await invoke<Contact[]>('get_contacts', { accountId: id }).catch(() => [])
      return [id, contacts.find(c => c.email)?.email ?? null] as const
    })).then(pairs => { if (alive) setEmails(Object.fromEntries(pairs)) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, todos, accounts])

  // toast.store only supports 'success' | 'error' | 'info'; use 'error' for warnings
  const reportResult = (res: { ok: boolean; error?: string; warning?: string }) => {
    if (res.warning) showToast({ message: res.warning, variant: 'error' })
    else if (res.ok) showToast({ message: 'Mahnung gesendet.', variant: 'success' })
    else showToast({ message: res.error ?? 'Versand fehlgeschlagen.', variant: 'error' })
  }

  const sendOne = async (invoiceId: string, level: number) => {
    const item = items.find(i => i.invoice.id === invoiceId)
    if (!item) return
    setSending(invoiceId)
    const prep = await prepareReminder(item.invoice, level)
    setSending(null)
    if (!prep.ok) { showToast({ message: prep.error, variant: 'error' }); return }
    setCompose({ data: prep.data, invoice: item.invoice })
  }

  const sendAll = async () => {
    setBatch(true)
    let ok = 0, failed = 0, warned = 0
    for (const it of items) {
      if (emails[it.invoice.accountId] == null) { failed++; continue }
      const res = await sendReminder(it.invoice, it.level)
      if (res.warning) warned++
      res.ok ? ok++ : failed++
    }
    setBatch(false)
    showToast({
      message: `${ok} gesendet${failed ? `, ${failed} fehlgeschlagen` : ''}${warned ? `, ${warned} mit Warnung` : ''}.`,
      variant: failed ? 'error' : 'success',
    })
    if (workspaceId) await loadAll(workspaceId)
  }

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 200, background: 'oklch(0% 0 0 / 0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          width: 'min(640px, 100%)', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Mahnungen prüfen &amp; senden</div>
              <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>{items.length} fällig</div>
            </div>
            <button type="button" onClick={onClose} aria-label="Schließen" style={{ background: 'transparent', border: 'none', color: 'var(--fg-muted)', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {items.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--fg-dim)', fontSize: 13 }}>Keine fälligen Mahnungen.</div>
            )}
            {items.map(it => {
              const email = emails[it.invoice.accountId]
              const noMail = email === null            // confirmed: customer has no email
              const notSendable = email == null        // loading (undefined) OR no email
              return (
                <div key={it.invoice.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{it.customerName}</div>
                    <div style={{ fontSize: 11, color: 'var(--fg-dim)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span>{LEVEL_LABEL[it.level] ?? '2. Mahnung'}</span>
                      <span>· {it.daysOverdue}d überfällig</span>
                      <span>· {fmtEur(it.amountDue)} €</span>
                      {noMail && <span style={{ color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><AlertTriangle size={11} />keine E-Mail</span>}
                      {email && <span style={{ color: 'var(--fg-muted)' }}>· {email}</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={notSendable || sending === it.invoice.id || batch}
                    onClick={() => sendOne(it.invoice.id, it.level)}
                    style={{
                      height: 32, padding: '0 14px', borderRadius: 8, border: '1px solid var(--accent)',
                      background: 'var(--accent)', color: 'var(--accent-ink)',
                      cursor: notSendable ? 'not-allowed' : 'pointer', opacity: notSendable ? 0.4 : 1,
                      display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
                    }}
                  >
                    {sending === it.invoice.id ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={12} />}
                    Senden
                  </button>
                </div>
              )
            })}
          </div>

          {items.length > 0 && (
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={sendAll} disabled={batch} style={{
                height: 36, padding: '0 18px', borderRadius: 9, border: 'none',
                background: 'var(--accent)', color: 'var(--accent-ink)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, opacity: batch ? 0.6 : 1,
              }}>
                {batch ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={13} />}
                Alle senden
              </button>
            </div>
          )}
        </div>
      </div>

      {compose && (
        <ComposeModal
          mode="new"
          accountId={compose.data.mailAccountId}
          initialTo={compose.data.to}
          initialSubject={compose.data.subject}
          initialBody={compose.data.body}
          initialAttachmentPaths={compose.data.attachmentPaths}
          onClose={() => setCompose(null)}
          onSent={async () => {
            const inv = compose.invoice
            const lvl = compose.data.level
            setCompose(null)
            try { await recordReminderSent(inv, lvl, fees) }
            catch { /* recording optional; send already happened */ }
            showToast({ message: 'Mahnung gesendet.', variant: 'success' })
            if (workspaceId) await loadAll(workspaceId)
          }}
        />
      )}
    </>
  )
}
