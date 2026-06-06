import { useState } from 'react'
import { useAuftraege } from '@/store/auftraege.store'
import { useFinanceStore } from '@/store/finance.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { useToastStore } from '@/store/toast.store'
import type { Auftrag, Zeiteintrag } from '@/types/auftrag.types'

interface Props {
  auftrag: Auftrag
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

export function AuftragAbrechnen({ auftrag, onClose }: Props) {
  const zeiteintraege   = useAuftraege(s => s.zeiteintraege.filter(z => z.auftragId === auftrag.id && !z.billed))
  const unbilledMinutes = useAuftraege(s => s.unbilledMinutes(auftrag.id))
  const unbilledAmount  = useAuftraege(s => s.unbilledAmount(auftrag.id))
  const markBilled      = useAuftraege(s => s.markBilled)
  const createInvoice   = useFinanceStore(s => s.createInvoice)
  const workspaceId     = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const userId          = useAuthStore(s => s.user?.id) ?? ''
  const showToast       = useToastStore(s => s.show)

  const [dueDate, setDueDate] = useState(dueDateISO())
  const [saving,  setSaving]  = useState(false)

  const hours = Math.round((unbilledMinutes / 60) * 100) / 100

  const lineTitle = auftrag.type === 'hourly'
    ? `${auftrag.title} — ${hours.toLocaleString('de-DE')} Std à ${fmtEur(auftrag.hourlyRate ?? 0)}`
    : auftrag.title

  const handleAbrechnen = async () => {
    if (zeiteintraege.length === 0 && auftrag.type === 'hourly') {
      showToast({ message: 'Keine nicht-abgerechneten Einträge vorhanden.', variant: 'error' })
      return
    }
    setSaving(true)
    try {
      const result = await createInvoice({
        workspaceId, createdBy: userId,
        accountId: auftrag.accountId,
        date: todayISO(), dueDate,
        status: 'draft', taxMode: 'standard',
        subtotal: unbilledAmount, taxAmount: 0, total: unbilledAmount,
        items: [{
          title: lineTitle, quantity: 1,
          unitPrice: unbilledAmount,
          taxRate: 0, total: unbilledAmount, sortOrder: 0,
        }],
      })
      markBilled(auftrag.id, result.invoice.id)
      showToast({ message: 'Rechnung erstellt und Auftrag als abgerechnet markiert.', variant: 'success' })
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
        borderRadius: 18, padding: 28, width: 480, display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>
            Auftrag abrechnen
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fg-dim)' }}>
            {auftrag.title}
          </p>
        </div>

        {auftrag.type === 'hourly' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{
              fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.12em',
              textTransform: 'uppercase', color: 'var(--fg-dim)', fontWeight: 600,
            }}>
              Nicht abgerechnete Einträge ({zeiteintraege.length})
            </div>
            {zeiteintraege.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--fg-dim)', padding: '8px 0' }}>Keine offenen Einträge.</div>
            ) : (
              <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {zeiteintraege.map((z: Zeiteintrag) => (
                  <div key={z.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                  }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)' }}>{z.description}</div>
                      <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{z.date}</div>
                    </div>
                    <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)' }}>
                      {fmtMinutes(z.minutes)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{
          padding: '16px 18px', borderRadius: 12,
          border: '1px solid var(--border)', background: 'var(--surface-1)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {auftrag.type === 'hourly' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--fg-dim)' }}>
              <span>Gesamt: {fmtMinutes(unbilledMinutes)} × {fmtEur(auftrag.hourlyRate ?? 0)}/Std</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>Rechnungsbetrag</span>
            <span style={{
              fontSize: 22, fontWeight: 700, color: 'var(--accent)',
              fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em',
            }}>
              {fmtEur(unbilledAmount)}
            </span>
          </div>
        </div>

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
            border: '1px solid rgba(255,255,255,0.09)', background: '#141419',
            color: 'var(--fg)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
          }} />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '9px 20px', borderRadius: 99, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--fg-dim)', fontSize: 13, cursor: 'pointer',
          }}>Abbrechen</button>
          <button onClick={handleAbrechnen}
            disabled={saving || (auftrag.type === 'hourly' && zeiteintraege.length === 0)}
            style={{
              padding: '9px 24px', borderRadius: 99, border: 'none',
              background: saving ? 'rgba(255,255,255,0.06)' : 'var(--accent)',
              color: saving ? 'var(--fg-dim)' : 'var(--accent-ink)',
              fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
            }}>
            {saving ? 'Wird erstellt…' : '→ Rechnung erstellen'}
          </button>
        </div>
      </div>
    </div>
  )
}
