import { useState } from 'react'
import { X } from 'lucide-react'
import { useFinanceStore } from '@/store/finance.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { PositionsEditor } from './PositionsEditor'
import type { OfferWithItems, UpsertOfferPayload, UpsertOfferItemPayload, TaxMode } from '@/types/finance.types'

interface Props {
  initial?: OfferWithItems
  onClose: () => void
  onSaved: () => void
}

const TAX_MODES: { value: TaxMode; label: string }[] = [
  { value: 'standard',         label: '19% MwSt (Standard)' },
  { value: 'reduced',          label: '7% MwSt (Ermäßigt)' },
  { value: 'reverse_charge',   label: '§13b UStG (Reverse Charge)' },
  { value: 'kleinunternehmer', label: '§19 UStG (Kleinunternehmer)' },
]

function plusDays(n: number) {
  const d = new Date(); d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function calcTotals(items: UpsertOfferItemPayload[], taxMode: TaxMode) {
  const noTax = taxMode === 'reverse_charge' || taxMode === 'kleinunternehmer'
  let subtotal = 0, taxAmount = 0
  for (const item of items) {
    const net = item.quantity * item.unitPrice
    subtotal += net
    if (!noTax) taxAmount += net * (item.taxRate / 100)
  }
  return { subtotal, taxAmount, total: subtotal + taxAmount }
}

export function OfferForm({ initial, onClose, onSaved }: Props) {
  const createOffer  = useFinanceStore(s => s.createOffer)
  const updateOffer  = useFinanceStore(s => s.updateOffer)
  const accounts     = useAccountsStore(s => s.accounts)
  const workspaceId  = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const user         = useAuthStore(s => s.user)

  const [accountId,  setAccountId]  = useState(initial?.offer.accountId ?? '')
  const [title,      setTitle]      = useState(initial?.offer.title ?? '')
  const [validUntil, setValidUntil] = useState(initial?.offer.validUntil ?? plusDays(30))
  const [taxMode,    setTaxMode]    = useState<TaxMode>(initial?.offer.taxMode ?? 'standard')
  const [notes,      setNotes]      = useState(initial?.offer.notes ?? '')
  const [items, setItems] = useState<UpsertOfferItemPayload[]>(
    initial?.items.map(i => ({
      id: i.id, title: i.title, description: i.description,
      quantity: i.quantity, unitPrice: i.unitPrice, taxRate: i.taxRate,
      total: i.total, sortOrder: i.sortOrder,
    })) ?? []
  )
  const [isSaving, setIsSaving] = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const { subtotal, taxAmount, total } = calcTotals(items, taxMode)

  const handleSave = async () => {
    if (!accountId) { setError('Bitte Kunden auswählen'); return }
    if (!title.trim()) { setError('Bitte Titel eingeben'); return }
    setIsSaving(true); setError(null)
    try {
      const payload: UpsertOfferPayload = {
        workspaceId, createdBy: user?.id ?? '', accountId, title, validUntil,
        taxMode, subtotal, taxAmount, total,
        notes: notes || undefined, items,
      }
      if (initial) await updateOffer(initial.offer.id, payload)
      else         await createOffer(payload)
      onSaved()
    } catch (e) {
      setError(String(e))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'oklch(0% 0 0 / 0.55)',
      backdropFilter: 'blur(8px)',
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div style={{
        width: 560, maxWidth: '96vw', height: '100vh',
        background: 'var(--surface)', display: 'flex', flexDirection: 'column',
        boxShadow: 'var(--shadow-2)',
        borderLeft: '1px solid var(--border)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em' }}>
            {initial ? 'Angebot bearbeiten' : 'Neues Angebot'}
          </h2>
          <button onClick={onClose} className="icon-btn"><X size={16} /></button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <FormField label="Kunde">
            <select value={accountId} onChange={e => setAccountId(e.target.value)} className="mock-input">
              <option value="">Kunden wählen…</option>
              {accounts.filter(a => !a.isPrivate).map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Titel">
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Angebot Webauftritt…" className="mock-input" />
          </FormField>

          <FormField label="Gültig bis">
            <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="mock-input" />
          </FormField>

          <FormField label="Steuermodus">
            <select value={taxMode} onChange={e => setTaxMode(e.target.value as TaxMode)} className="mock-input">
              {TAX_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </FormField>

          <FormField label="Positionen">
            <PositionsEditor items={items} onChange={setItems} taxMode={taxMode} invoiceDate={validUntil} />
          </FormField>

          {/* Summe */}
          <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 16px', fontSize: 13, border: '1px solid var(--border)' }}>
            <SumLine label="Netto" value={subtotal} />
            {taxMode === 'standard' || taxMode === 'reduced'
              ? <SumLine label={`MwSt (${taxMode === 'reduced' ? '7' : '19'}%)`} value={taxAmount} />
              : <div style={{ fontSize: 12, color: 'var(--fg-dim)', padding: '4px 0' }}>
                  {taxMode === 'reverse_charge' ? 'Steuerschuldnerschaft §13b' : 'Kein MwSt-Ausweis §19'}
                </div>
            }
            <SumLine label="Gesamt" value={total} bold />
          </div>

          <FormField label="Notizen (optional)">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="mock-input"
              placeholder="Anmerkungen, Konditionen…"
            />
          </FormField>

          {error && (
            <div style={{ color: 'var(--danger)', fontSize: 13, padding: '8px 12px', background: 'oklch(72% 0.18 25 / 0.1)', borderRadius: 8 }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '16px 24px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button onClick={onClose} className="btn-ghost">Abbrechen</button>
          <button onClick={handleSave} disabled={isSaving} className="btn-primary">
            {isSaving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label className="card-label">{label}</label>
      {children}
    </div>
  )
}

function SumLine({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '3px 0',
      fontWeight: bold ? 700 : 400,
      borderTop: bold ? '1px solid var(--border)' : 'none',
      marginTop: bold ? 6 : 0,
      fontSize: bold ? 14 : 13,
    }}>
      <span style={{ color: bold ? 'var(--fg)' : 'var(--fg-muted)' }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value.toFixed(2)} €</span>
    </div>
  )
}
