import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useAuftraege } from '@/store/auftraege.store'
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

  const [auftragId,   setAuftragId]   = useState('')
  const [date,        setDate]        = useState(todayISO())
  const [description, setDescription] = useState('')
  const [hours,       setHours]       = useState('')
  const [mins,        setMins]        = useState('')

  const totalMins = (parseInt(hours || '0', 10) * 60) + parseInt(mins || '0', 10)
  const canAdd    = auftragId && description.trim() && totalMins > 0

  const handleAdd = () => {
    if (!canAdd) return
    addZeiteintrag({ auftragId, date, minutes: totalMins, description: description.trim() })
    setDescription('')
    setHours('')
    setMins('')
  }

  if (auftraege.length === 0) {
    return (
      <div style={{
        padding: '16px 20px', borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(255,255,255,0.02)',
        fontSize: 13, color: 'var(--fg-dim)', textAlign: 'center',
      }}>
        Lege zuerst einen Auftrag an, um Zeit zu erfassen.
      </div>
    )
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 8, marginBottom: 8 }}>
        <select value={auftragId} onChange={e => setAuftragId(e.target.value)} style={inputStyle}>
          <option value="">Auftrag wählen…</option>
          {auftraege.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
        </select>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 72px auto', gap: 8 }}>
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
        <button onClick={handleAdd} disabled={!canAdd} style={{
          padding: '8px 16px', borderRadius: 8, border: 'none',
          background: canAdd ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
          color: canAdd ? 'var(--accent-ink)' : 'var(--fg-dim)',
          fontSize: 12, fontWeight: 700, cursor: canAdd ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Plus size={13} /> Erfassen
        </button>
      </div>
    </div>
  )
}
