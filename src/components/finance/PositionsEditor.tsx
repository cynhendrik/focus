import { Plus, Trash2 } from 'lucide-react'
import type { UpsertInvoiceItemPayload } from '@/types/finance.types'

interface Props {
  items: UpsertInvoiceItemPayload[]
  onChange: (items: UpsertInvoiceItemPayload[]) => void
  taxMode: string
  invoiceDate?: string   // ISO "2026-05-22" — Vorauswahl für neue Positionen
}

function calcItemTotal(item: UpsertInvoiceItemPayload): number {
  const net = item.quantity * item.unitPrice
  if (item.taxRate === 0) return net
  return net * (1 + item.taxRate / 100)
}

export function PositionsEditor({ items, onChange, taxMode, invoiceDate }: Props) {
  const noTax = taxMode === 'reverse_charge' || taxMode === 'kleinunternehmer'

  const addRow = () => {
    onChange([
      ...items,
      {
        title: '', description: undefined,
        quantity: 1, unitPrice: 0,
        taxRate: noTax ? 0 : 19, total: 0,
        sortOrder: items.length,
        itemDate: invoiceDate,
        unit: undefined,
      },
    ])
  }

  const removeRow = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx).map((item, i) => ({ ...item, sortOrder: i })))
  }

  const update = (idx: number, patch: Partial<UpsertInvoiceItemPayload>) => {
    const updated = items.map((item, i) => {
      if (i !== idx) return item
      const next = { ...item, ...patch }
      next.taxRate = noTax ? 0 : next.taxRate
      next.total = calcItemTotal(next)
      return next
    })
    onChange(updated)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 64px 80px 64px 80px 28px',
        gap: 4,
        padding: '0 0 4px',
        fontSize: 11,
        color: 'var(--fg-dim)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        fontFamily: 'var(--font-mono)',
      }}>
        <span>Bezeichnung · Datum · Einheit</span>
        <span style={{ textAlign: 'right' }}>Menge</span>
        <span style={{ textAlign: 'right' }}>Preis</span>
        <span style={{ textAlign: 'right' }}>MwSt%</span>
        <span style={{ textAlign: 'right' }}>Gesamt</span>
        <span />
      </div>

      {items.map((item, idx) => (
        <div key={idx} style={{
          display: 'grid',
          gridTemplateColumns: '1fr 64px 80px 64px 80px 28px',
          gap: 4,
          alignItems: 'start',
        }}>
          {/* Spalte 1: Titel + Datum + Einheit gestapelt */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <input
              value={item.title}
              onChange={e => update(idx, { title: e.target.value })}
              placeholder="Bezeichnung"
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="date"
                value={item.itemDate ?? ''}
                onChange={e => update(idx, { itemDate: e.target.value || undefined })}
                style={{ ...inputStyle, flex: 1, fontSize: 11, padding: '3px 6px' }}
              />
              <input
                list="cynera-units"
                value={item.unit ?? ''}
                onChange={e => update(idx, { unit: e.target.value || undefined })}
                placeholder="Einheit"
                style={{ ...inputStyle, width: 80, fontSize: 11, padding: '3px 6px' }}
              />
              <datalist id="cynera-units">
                <option value="Stk." />
                <option value="Std." />
                <option value="Tag" />
                <option value="Monat" />
                <option value="Pauschal" />
              </datalist>
            </div>
          </div>
          {/* Spalten 2–6: unverändert */}
          <input
            type="number"
            value={item.quantity}
            min={0}
            step={0.5}
            onChange={e => update(idx, { quantity: parseFloat(e.target.value) || 0 })}
            style={{ ...inputStyle, textAlign: 'right' }}
          />
          <input
            type="number"
            value={item.unitPrice}
            min={0}
            step={0.01}
            onChange={e => update(idx, { unitPrice: parseFloat(e.target.value) || 0 })}
            style={{ ...inputStyle, textAlign: 'right' }}
          />
          <input
            type="number"
            value={noTax ? 0 : item.taxRate}
            min={0}
            max={100}
            disabled={noTax}
            onChange={e => update(idx, { taxRate: parseFloat(e.target.value) || 0 })}
            style={{ ...inputStyle, textAlign: 'right', opacity: noTax ? 0.4 : 1 }}
          />
          <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13, paddingTop: 6 }}>
            {item.total.toFixed(2)} €
          </span>
          <button onClick={() => removeRow(idx)} style={{ ...iconBtnStyle, paddingTop: 6 }} title="Entfernen">
            <Trash2 size={13} />
          </button>
        </div>
      ))}

      <button onClick={addRow} style={addBtnStyle}>
        <Plus size={13} /> Position hinzufügen
      </button>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: 'var(--input-bg, var(--surface))',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '4px 7px',
  fontSize: 13,
  color: 'var(--text)',
  width: '100%',
  boxSizing: 'border-box',
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--fg-dim)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 4,
  borderRadius: 4,
}

const addBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  background: 'none',
  border: '1px dashed var(--border)',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 12,
  color: 'var(--fg-dim)',
  cursor: 'pointer',
  marginTop: 4,
  width: 'fit-content',
}
