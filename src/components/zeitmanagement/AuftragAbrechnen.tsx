import { useState } from 'react'
import { useAuftraege } from '@/store/auftraege.store'
import { useFinanceStore } from '@/store/finance.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { useToastStore } from '@/store/toast.store'
import type { Zeiteintrag } from '@/types/auftrag.types'

interface Props {
  accountId:   string
  accountName: string
  onClose: () => void
}

function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60)
  const min = m % 60
  if (h === 0) return `${min} Min`
  if (min === 0) return `${h} Std`
  return `${h} Std ${min} Min`
}

function fmtEur(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}

function todayISO() { return new Date().toLocaleDateString('sv') }
function dueDateISO() {
  const d = new Date(); d.setDate(d.getDate() + 14)
  return d.toLocaleDateString('sv')
}

export function AuftragAbrechnen({ accountId, accountName, onClose }: Props) {
  const auftraege     = useAuftraege(s => s.auftraege)
  const summary       = useAuftraege(s => s.unbilledForAccount(accountId))
  const markBilled    = useAuftraege(s => s.markBilledForAccount)
  const createInvoice = useFinanceStore(s => s.createInvoice)
  const workspaceId   = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const userId        = useAuthStore(s => s.user?.id) ?? ''
  const showToast     = useToastStore(s => s.show)

  const [dueDate, setDueDate] = useState(dueDateISO())
  const [saving,  setSaving]  = useState(false)

  const getEntryLabel = (z: Zeiteintrag): string => {
    const auftrag = auftraege.find(a => a.id === z.auftragId)
    const rate    = z.hourlyRate ?? auftrag?.defaultHourlyRate ?? 0
    const hours   = Math.round((z.minutes / 60) * 100) / 100
    const base    = auftrag ? auftrag.title : z.description
    return rate > 0
      ? `${base} — ${hours.toLocaleString('de-DE')} Std à ${fmtEur(rate)}`
      : `${base} — ${fmtMinutes(z.minutes)}`
  }

  const getEntryAmount = (z: Zeiteintrag): number => {
    const auftrag = auftraege.find(a => a.id === z.auftragId)
    const rate    = z.hourlyRate ?? auftrag?.defaultHourlyRate ?? 0
    return Math.round((z.minutes / 60) * rate * 100) / 100
  }

  const handleAbrechnen = async () => {
    if (summary.entries.length === 0) return
    setSaving(true)
    try {
      const items = summary.entries.map((z, i) => ({
        title:     getEntryLabel(z),
        quantity:  1,
        unitPrice: getEntryAmount(z),
        taxRate:   0,
        total:     getEntryAmount(z),
        sortOrder: i,
      }))
      const result = await createInvoice({
        workspaceId, createdBy: userId,
        accountId, date: todayISO(), dueDate,
        status: 'draft', taxMode: 'standard',
        subtotal: summary.totalAmount, taxAmount: 0, total: summary.totalAmount,
        items,
      })
      markBilled(accountId, result.invoice.id)
      showToast({ message: 'Rechnung erstellt und Zeit als abgerechnet markiert.', variant: 'success' })
      onClose()
    } catch {
      showToast({ message: 'Rechnung konnte nicht erstellt werden.', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)',
        borderRadius: 18, padding: 28, width: 520,
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>
            Zeit abrechnen
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fg-dim)' }}>
            {accountName}
          </p>
        </div>

        {/* Einträge */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{
            fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--fg-dim)', fontWeight: 600,
          }}>
            Nicht abgerechnete Einträge ({summary.entries.length})
          </div>
          {summary.entries.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--fg-dim)', padding: '8px 0' }}>
              Keine offenen Einträge.
            </div>
          ) : (
            <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {summary.entries.map((z: Zeiteintrag) => (
                <div key={z.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 12px', borderRadius: 8,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)' }}>{z.description}</div>
                    <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
                      {z.date} · {auftraege.find(a => a.id === z.auftragId)?.title ?? '—'}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)', flexShrink: 0, textAlign: 'right' }}>
                    <div>{fmtMinutes(z.minutes)}</div>
                    {getEntryAmount(z) > 0 && (
                      <div style={{ color: 'var(--accent)', fontWeight: 600 }}>{fmtEur(getEntryAmount(z))}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Summe */}
        <div style={{
          padding: '14px 18px', borderRadius: 12,
          border: '1px solid var(--border)', background: 'var(--surface-1)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--fg-dim)' }}>
              {fmtMinutes(summary.totalMinutes)} gesamt
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>Rechnungsbetrag</div>
          </div>
          <span style={{
            fontSize: 24, fontWeight: 700, color: 'var(--accent)',
            fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em',
          }}>
            {fmtEur(summary.totalAmount)}
          </span>
        </div>

        {/* Fälligkeit */}
        <div>
          <label style={{
            fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--fg-dim)', fontWeight: 600,
            display: 'block', marginBottom: 5,
          }}>
            Fälligkeitsdatum
          </label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{
            width: '100%', padding: '9px 12px', borderRadius: 9,
            border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: 'var(--fg)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
          }} />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '9px 20px', borderRadius: 99, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--fg-dim)', fontSize: 13, cursor: 'pointer',
          }}>Abbrechen</button>
          <button onClick={handleAbrechnen}
            disabled={saving || summary.entries.length === 0}
            style={{
              padding: '9px 24px', borderRadius: 99, border: 'none',
              background: saving || summary.entries.length === 0 ? 'var(--surface-3)' : 'var(--accent)',
              color: saving || summary.entries.length === 0 ? 'var(--fg-dim)' : 'var(--accent-ink)',
              fontSize: 13, fontWeight: 700,
              cursor: saving || summary.entries.length === 0 ? 'not-allowed' : 'pointer',
            }}>
            {saving ? 'Wird erstellt…' : '→ Rechnung erstellen'}
          </button>
        </div>
      </div>
    </div>
  )
}
