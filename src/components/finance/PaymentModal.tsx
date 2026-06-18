import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useFinanceStore } from '@/store/finance.store'
import { useToastStore } from '@/store/toast.store'
import { paidAmount, remaining } from '@/lib/invoice-status'
import type { Invoice } from '@/types/finance.types'

const fmt = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
const todayISO = () => new Date().toLocaleDateString('sv')
const relDate = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })

export function PaymentModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const addPayment    = useFinanceStore(s => s.addPayment)
  const deletePayment = useFinanceStore(s => s.deletePayment)
  const payments      = useFinanceStore(s => s.payments)
  const toast         = useToastStore(s => s.show)

  const mine = payments.filter(p => p.invoiceId === invoice.id)
  const paid = paidAmount(payments, invoice.id)
  const rest = remaining(invoice, paid)

  const [amount, setAmount] = useState(rest > 0 ? String(rest) : '')
  const [date,   setDate]   = useState(todayISO())
  const [method, setMethod] = useState('')
  const [note,   setNote]   = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const a = parseFloat(amount.replace(',', '.'))
    if (!a || a <= 0) { toast({ message: 'Bitte einen Betrag > 0 eingeben.', variant: 'error' }); return }
    setSaving(true)
    try {
      await addPayment({
        workspaceId: invoice.workspaceId,
        invoiceId: invoice.id,
        amount: Math.round(a * 100) / 100,
        paidAt: date,
        method: method.trim() || undefined,
        note: note.trim() || undefined,
      })
      setAmount(''); setMethod(''); setNote('')
    } catch (e) {
      toast({ message: `Zahlung fehlgeschlagen: ${String(e)}`, variant: 'error' })
    } finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    try { await deletePayment(id, invoice.workspaceId) }
    catch (e) { toast({ message: `Löschen fehlgeschlagen: ${String(e)}`, variant: 'error' }) }
  }

  const label = { fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 5 } as const

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: '100%', maxWidth: 440, background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 24, boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>Zahlung erfassen</h2>
        <p style={{ fontSize: 12, color: 'var(--fg-dim)', margin: '0 0 16px' }}>
          Rechnung {invoice.number ?? '—'}
        </p>

        {/* Summary */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[['Gesamt', invoice.total], ['Bezahlt', paid], ['Offen', rest]].map(([k, v]) => (
            <div key={k as string} style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ fontSize: 10, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k}</div>
              <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: k === 'Offen' && (v as number) > 0 ? 'var(--warn)' : 'var(--fg)' }}>{fmt(v as number)}</div>
            </div>
          ))}
        </div>

        {/* Existing payments */}
        {mine.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={label as React.CSSProperties}>Erfasste Zahlungen</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {mine.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '6px 8px', background: 'var(--surface-2)', borderRadius: 8 }}>
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(p.amount)}</span>
                  <span style={{ color: 'var(--fg-dim)' }}>{relDate(p.paidAt)}</span>
                  {p.method && <span style={{ color: 'var(--fg-dim)' }}>· {p.method}</span>}
                  <span style={{ flex: 1 }} />
                  <button onClick={() => remove(p.id)} title="Zahlung entfernen"
                    style={{ display: 'flex', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', padding: 2 }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Form */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={label as React.CSSProperties}>Betrag (€)</label>
            <input className="mock-input" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" autoFocus
              onKeyDown={e => e.key === 'Enter' && save()} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label as React.CSSProperties}>Datum</label>
            <input className="mock-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={label as React.CSSProperties}>Methode (optional)</label>
            <input className="mock-input" value={method} onChange={e => setMethod(e.target.value)} placeholder="Überweisung…" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label as React.CSSProperties}>Notiz (optional)</label>
            <input className="mock-input" value={note} onChange={e => setNote(e.target.value)} placeholder="" />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose} disabled={saving}>Schließen</button>
          <button className="btn-primary" onClick={save} disabled={saving || !amount.trim()}>
            {saving ? 'Speichern…' : 'Zahlung erfassen'}
          </button>
        </div>
      </div>
    </div>
  )
}
