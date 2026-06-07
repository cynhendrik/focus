import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useVertraege } from '@/store/vertraege.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useCompanyStore } from '@/store/company.store'
import type { Vertrag, VertragItem, IntervalUnit } from '@/types/vertrag.types'
import type { TaxMode } from '@/types/finance.types'

interface Props {
  vertrag?: Vertrag
  onClose: () => void
}

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 11px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface-1)',
  color: 'var(--fg)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
}
const lbl: React.CSSProperties = {
  fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--fg-dim)', fontWeight: 600,
  display: 'block', marginBottom: 4,
}

function defaultStartDate() {
  const d = new Date(); d.setDate(d.getDate() + 14); return d.toLocaleDateString('sv')
}

export function VertragForm({ vertrag, onClose }: Props) {
  const createVertrag = useVertraege(s => s.createVertrag)
  const updateVertrag = useVertraege(s => s.updateVertrag)
  const accounts      = useAccountsStore(s => s.accounts.filter(a => !a.isPrivate))
  const profile       = useCompanyStore(s => s.profile)
  const defaultTax: TaxMode = profile.kleinunternehmer ? 'kleinunternehmer' : 'standard'

  const [accountId,     setAccountId]     = useState(vertrag?.accountId     ?? '')
  const [title,         setTitle]         = useState(vertrag?.title          ?? '')
  const [intervalValue, setIntervalValue] = useState(vertrag?.intervalValue  ?? 1)
  const [intervalUnit,  setIntervalUnit]  = useState<IntervalUnit>(vertrag?.intervalUnit ?? 'months')
  const [startDate,     setStartDate]     = useState(vertrag?.startDate      ?? defaultStartDate())
  const [endDate,       setEndDate]       = useState(vertrag?.endDate        ?? '')
  const [hasEndDate,    setHasEndDate]    = useState(!!vertrag?.endDate)
  const [taxMode,       setTaxMode]       = useState<TaxMode>(vertrag?.taxMode ?? defaultTax)
  const [notes,         setNotes]         = useState(vertrag?.notes          ?? '')
  const [items,         setItems]         = useState<VertragItem[]>(
    vertrag?.items ?? [{ title: '', quantity: 1, unitPrice: 0, taxRate: taxMode === 'kleinunternehmer' ? 0 : 19 }]
  )

  const canSave = title.trim() && accountId && intervalValue > 0 && items.some(i => i.title.trim())

  const addItem = () =>
    setItems(prev => [...prev, { title: '', quantity: 1, unitPrice: 0, taxRate: taxMode === 'kleinunternehmer' ? 0 : 19 }])

  const updateItem = (idx: number, patch: Partial<VertragItem>) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))

  const removeItem = (idx: number) =>
    setItems(prev => prev.filter((_, i) => i !== idx))

  const handleSave = () => {
    if (!canSave) return
    const payload = {
      accountId, title: title.trim(), intervalValue, intervalUnit,
      startDate, endDate: hasEndDate && endDate ? endDate : null,
      taxMode, notes: notes.trim(),
      items: items.filter(i => i.title.trim()),
    }
    if (vertrag) {
      updateVertrag(vertrag.id, payload)
    } else {
      createVertrag(payload)
    }
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)',
        borderRadius: 18, padding: 28, width: 520,
        display: 'flex', flexDirection: 'column', gap: 18,
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>
          {vertrag ? 'Vertrag bearbeiten' : 'Neuer Vertrag'}
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Kunde</label>
            <select value={accountId} onChange={e => setAccountId(e.target.value)} style={inp}>
              <option value="">Kunden wählen…</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Bezeichnung</label>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
              placeholder="z.B. Retainer SEO" style={inp} />
          </div>
        </div>

        <div>
          <label style={lbl}>Abrechnungsintervall</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--fg-dim)', flexShrink: 0 }}>alle</span>
            <input
              type="number" value={intervalValue} min={1}
              onChange={e => setIntervalValue(Math.max(1, parseInt(e.target.value) || 1))}
              style={{ ...inp, width: 72 }}
            />
            <select value={intervalUnit} onChange={e => setIntervalUnit(e.target.value as IntervalUnit)} style={inp}>
              <option value="days">Tage</option>
              <option value="weeks">Wochen</option>
              <option value="months">Monate</option>
              <option value="years">Jahre</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Erste Abrechnung</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Enddatum</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={hasEndDate} onChange={e => setHasEndDate(e.target.checked)}
                style={{ width: 14, height: 14, accentColor: 'var(--accent)' }} />
              <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Festlegen</span>
              {hasEndDate && (
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  style={{ ...inp, flex: 1 }} />
              )}
            </div>
          </div>
        </div>

        <div>
          <label style={lbl}>Positionen</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {items.map((item, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 90px 60px auto', gap: 6 }}>
                <input value={item.title} onChange={e => updateItem(idx, { title: e.target.value })}
                  placeholder="Leistung" style={inp} />
                <input type="number" value={item.quantity} min={0.01} step={0.01}
                  onChange={e => updateItem(idx, { quantity: parseFloat(e.target.value) || 1 })}
                  style={{ ...inp, textAlign: 'center' }} placeholder="Mge" />
                <div style={{ position: 'relative' }}>
                  <input type="number" value={item.unitPrice || ''}  min={0}
                    onChange={e => updateItem(idx, { unitPrice: parseFloat(e.target.value) || 0 })}
                    style={{ ...inp, paddingRight: 22 }} placeholder="Preis" />
                  <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--fg-dim)', pointerEvents: 'none' }}>€</span>
                </div>
                <div style={{ position: 'relative' }}>
                  <input type="number" value={item.taxRate} min={0} max={100}
                    onChange={e => updateItem(idx, { taxRate: parseInt(e.target.value) || 0 })}
                    style={{ ...inp, paddingRight: 18 }} placeholder="MwSt" />
                  <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--fg-dim)', pointerEvents: 'none' }}>%</span>
                </div>
                <button onClick={() => removeItem(idx)} style={{
                  width: 32, height: 32, borderRadius: 7, border: 'none',
                  background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <button onClick={addItem} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
              borderRadius: 8, border: '1px dashed var(--border)',
              background: 'transparent', color: 'var(--fg-dim)', fontSize: 12, cursor: 'pointer',
            }}>
              <Plus size={12} /> Position hinzufügen
            </button>
          </div>
        </div>

        <div>
          <label style={lbl}>Notizen (optional)</label>
          <input value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Interne Notizen…" style={inp} />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '9px 20px', borderRadius: 99, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--fg-dim)', fontSize: 13, cursor: 'pointer',
          }}>Abbrechen</button>
          <button onClick={handleSave} disabled={!canSave} style={{
            padding: '9px 24px', borderRadius: 99, border: 'none',
            background: canSave ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
            color: canSave ? 'var(--accent-ink)' : 'var(--fg-dim)',
            fontSize: 13, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed',
          }}>
            {vertrag ? 'Speichern' : 'Vertrag anlegen'}
          </button>
        </div>
      </div>
    </div>
  )
}
