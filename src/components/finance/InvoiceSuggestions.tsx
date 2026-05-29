import { useState } from 'react'
import { X, CheckCircle, Trash2, Download } from 'lucide-react'
import { useFinanceStore } from '@/store/finance.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useCompanyStore } from '@/store/company.store'
import { useAuthStore } from '@/store/auth.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { downloadInvoicePDF } from './InvoicePDF'
import { FinanceService } from '@/services/finance.service'
import type { Invoice } from '@/types/finance.types'

interface Props {
  suggestions: Invoice[]
  onClose: () => void
}

function fmt(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}

export function InvoiceSuggestions({ suggestions, onClose }: Props) {
  const approveInvoiceSuggestion = useFinanceStore(s => s.approveInvoiceSuggestion)
  const deleteInvoice            = useFinanceStore(s => s.deleteInvoice)
  const accounts     = useAccountsStore(s => s.accounts)
  const profile      = useCompanyStore(s => s.profile)
  const workspaceId  = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const user         = useAuthStore(s => s.user)
  const [busy, setBusy] = useState<string | null>(null)

  const accountName = (id: string) => accounts.find(a => a.id === id)?.name ?? id

  const handleApprove = async (inv: Invoice) => {
    setBusy(inv.id)
    try { await approveInvoiceSuggestion(inv.id, user?.id ?? '', workspaceId) }
    finally { setBusy(null) }
  }

  const handleDelete = async (id: string) => {
    setBusy(id)
    try { await deleteInvoice(id) } finally { setBusy(null) }
  }

  const handleDownload = async (inv: Invoice) => {
    setBusy(inv.id)
    try {
      const full = await FinanceService.getInvoice(inv.id)
      const account = accounts.find(a => a.id === inv.accountId)
      if (!account) return
      await downloadInvoicePDF(full, profile, account)
    } finally { setBusy(null) }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'oklch(0% 0 0 / 0.55)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div className="card" style={{
        width: 660, maxWidth: '95vw', maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: 'var(--shadow-2)',
        padding: 0, overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: '-0.02em' }}>Rechnungsvorschläge</h2>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--fg-muted)' }}>
              Automatisch erstellt aus gewonnenen Deals
            </p>
          </div>
          <button onClick={onClose} className="icon-btn"><X size={16} /></button>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {suggestions.length === 0 ? (
            <div className="empty" style={{ padding: '40px 0' }}>
              <span>Keine offenen Vorschläge</span>
            </div>
          ) : suggestions.map(inv => {
            const isBusy = busy === inv.id
            return (
              <div key={inv.id} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 16px', borderRadius: 12,
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                opacity: isBusy ? 0.6 : 1, transition: 'opacity 200ms',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{accountName(inv.accountId)}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-dim)', marginTop: 3, letterSpacing: '0.04em' }}>
                    {inv.date} · fällig {inv.dueDate}
                  </div>
                </div>
                <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
                  {fmt(inv.total)}
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button
                    className="btn-ghost" disabled={isBusy}
                    onClick={() => handleDownload(inv)}
                    style={{ padding: '6px 10px', fontSize: 12 }}
                  >
                    <Download size={12} /> PDF
                  </button>
                  <button
                    disabled={isBusy}
                    onClick={() => handleApprove(inv)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '6px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: isBusy ? 'default' : 'pointer',
                      background: 'oklch(82% 0.18 155 / 0.16)', color: 'var(--ok)',
                      border: 'none',
                    }}
                  >
                    <CheckCircle size={12} /> Freigeben
                  </button>
                  <button
                    disabled={isBusy}
                    onClick={() => handleDelete(inv.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '6px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: isBusy ? 'default' : 'pointer',
                      background: 'oklch(72% 0.18 25 / 0.12)', color: 'var(--danger)',
                      border: 'none',
                    }}
                  >
                    <Trash2 size={12} /> Verwerfen
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button className="btn-ghost" onClick={onClose}>Schließen</button>
        </div>
      </div>
    </div>
  )
}
