import { useState } from 'react'
import { useAuftraege } from '@/store/auftraege.store'
import type { Auftrag } from '@/types/auftrag.types'

interface Props {
  auftrag?: Auftrag
  onClose: () => void
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 9,
  border: '1px solid rgba(255,255,255,0.09)', background: '#141419',
  color: 'var(--fg)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
}

const labelStyle: React.CSSProperties = {
  fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--fg-dim)', fontWeight: 600,
  display: 'block', marginBottom: 5,
}

export function AuftragForm({ auftrag, onClose }: Props) {
  const createAuftrag = useAuftraege(s => s.createAuftrag)
  const updateAuftrag = useAuftraege(s => s.updateAuftrag)

  const [title,      setTitle]      = useState(auftrag?.title ?? '')
  const [hourlyRate, setHourlyRate] = useState(
    auftrag?.defaultHourlyRate != null ? String(auftrag.defaultHourlyRate) : ''
  )
  const [notes, setNotes] = useState(auftrag?.notes ?? '')

  const canSave = title.trim().length > 0

  const handleSave = () => {
    if (!canSave) return
    const payload = {
      title: title.trim(),
      defaultHourlyRate: hourlyRate ? parseFloat(hourlyRate) : null,
      notes: notes.trim(),
    }
    if (auftrag) {
      updateAuftrag(auftrag.id, payload)
    } else {
      createAuftrag(payload)
    }
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)',
        borderRadius: 18, padding: 28, width: 400,
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>
          {auftrag ? 'Auftrag bearbeiten' : 'Neuer Auftrag'}
        </h2>

        <div>
          <label style={labelStyle}>Bezeichnung</label>
          <input
            autoFocus value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="z.B. Webentwicklung, Beratung, Support…"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Standard-Stundensatz (€) — optional</label>
          <input
            type="number" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)}
            placeholder="90" min="0" style={inputStyle}
          />
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 4 }}>
            Kann beim Zeiterfassen überschrieben werden.
          </div>
        </div>

        <div>
          <label style={labelStyle}>Notizen (optional)</label>
          <input value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Interne Notizen…" style={inputStyle} />
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
            {auftrag ? 'Speichern' : 'Anlegen'}
          </button>
        </div>
      </div>
    </div>
  )
}
