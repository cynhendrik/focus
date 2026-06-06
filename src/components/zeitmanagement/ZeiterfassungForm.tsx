import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useAuftraege } from '@/store/auftraege.store'
import { useAccountsStore } from '@/store/accounts.store'
import type { Auftrag } from '@/types/auftrag.types'

interface Props {
  auftraege: Auftrag[]
}

function todayISO() { return new Date().toLocaleDateString('sv') }

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.09)', background: '#141419',
  color: 'var(--fg)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
}

export function ZeiterfassungForm({ auftraege }: Props) {
  const addZeiteintrag = useAuftraege(s => s.addZeiteintrag)
  const accounts       = useAccountsStore(s => s.accounts.filter(a => !a.isPrivate))

  const [accountId,   setAccountId]   = useState('')
  const [auftragId,   setAuftragId]   = useState('')
  const [date,        setDate]        = useState(todayISO())
  const [description, setDescription] = useState('')
  const [hours,       setHours]       = useState('')
  const [mins,        setMins]        = useState('')
  const [rateOverride, setRateOverride] = useState('')

  const selectedAuftrag = auftraege.find(a => a.id === auftragId)
  const defaultRate     = selectedAuftrag?.defaultHourlyRate

  const totalMins = (parseInt(hours || '0', 10) * 60) + parseInt(mins || '0', 10)
  const canAdd    = description.trim() && totalMins > 0

  const handleAdd = () => {
    if (!canAdd) return
    addZeiteintrag({
      auftragId:  auftragId  || null,
      accountId:  accountId  || null,
      date,
      minutes:    totalMins,
      description: description.trim(),
      hourlyRate: rateOverride ? parseFloat(rateOverride) : null,
    })
    setDescription('')
    setHours('')
    setMins('')
    setRateOverride('')
  }

  return (
    <div style={{
      padding: '18px 20px', borderRadius: 14,
      border: '1px solid rgba(181,240,35,0.2)',
      background: 'rgba(181,240,35,0.03)',
    }}>
      <div style={{
        fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.14em',
        textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 600, marginBottom: 12,
      }}>
        Zeit erfassen
      </div>

      {/* Zeile 1: Kunde + Auftrag + Datum */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px', gap: 8, marginBottom: 8 }}>
        <select value={accountId} onChange={e => setAccountId(e.target.value)} style={inputStyle}>
          <option value="">Kunde (optional)</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={auftragId} onChange={e => { setAuftragId(e.target.value); setRateOverride('') }} style={inputStyle}>
          <option value="">Auftrag (optional)</option>
          {auftraege.map(a => (
            <option key={a.id} value={a.id}>
              {a.title}{a.defaultHourlyRate ? ` · ${a.defaultHourlyRate}€/h` : ''}
            </option>
          ))}
        </select>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
      </div>

      {/* Zeile 2: Beschreibung + Zeit + Rate + Button */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px 64px 100px auto', gap: 8 }}>
        <input
          value={description} onChange={e => setDescription(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Was wurde gemacht?"
          style={inputStyle}
        />
        <input type="number" value={hours} onChange={e => setHours(e.target.value)}
          placeholder="Std" min="0" max="23"
          style={{ ...inputStyle, textAlign: 'center' }} />
        <input type="number" value={mins} onChange={e => setMins(e.target.value)}
          placeholder="Min" min="0" max="59" step="15"
          style={{ ...inputStyle, textAlign: 'center' }} />
        <div style={{ position: 'relative' }}>
          <input
            type="number"
            value={rateOverride}
            onChange={e => setRateOverride(e.target.value)}
            placeholder={defaultRate ? `${defaultRate}` : '€/h'}
            min="0"
            style={{ ...inputStyle, paddingRight: 24, width: '100%' }}
          />
          <span style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            fontSize: 11, color: 'var(--fg-dim)', pointerEvents: 'none',
          }}>€</span>
        </div>
        <button onClick={handleAdd} disabled={!canAdd} style={{
          padding: '8px 14px', borderRadius: 8, border: 'none',
          background: canAdd ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
          color: canAdd ? 'var(--accent-ink)' : 'var(--fg-dim)',
          fontSize: 12, fontWeight: 700, cursor: canAdd ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
        }}>
          <Plus size={13} /> Erfassen
        </button>
      </div>
    </div>
  )
}
