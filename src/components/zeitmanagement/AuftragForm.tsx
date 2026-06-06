import { useState } from 'react'
import { useAuftraege } from '@/store/auftraege.store'
import { useAccountsStore } from '@/store/accounts.store'
import type { Auftrag, AuftragType } from '@/types/auftrag.types'

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
  const accounts      = useAccountsStore(s => s.accounts.filter(a => !a.isPrivate))
  const createAuftrag = useAuftraege(s => s.createAuftrag)
  const updateAuftrag = useAuftraege(s => s.updateAuftrag)

  const [accountId,   setAccountId]   = useState(auftrag?.accountId   ?? '')
  const [title,       setTitle]       = useState(auftrag?.title        ?? '')
  const [type,        setType]        = useState<AuftragType>(auftrag?.type ?? 'hourly')
  const [hourlyRate,  setHourlyRate]  = useState(auftrag?.hourlyRate  != null ? String(auftrag.hourlyRate)  : '')
  const [fixedAmount, setFixedAmount] = useState(auftrag?.fixedAmount != null ? String(auftrag.fixedAmount) : '')
  const [notes,       setNotes]       = useState(auftrag?.notes        ?? '')

  const canSave = title.trim() && accountId &&
    (type === 'hourly' ? parseFloat(hourlyRate) > 0 : parseFloat(fixedAmount) > 0)

  const handleSave = () => {
    if (!canSave) return
    const payload = {
      accountId, title: title.trim(), type, notes: notes.trim(),
      hourlyRate:  type === 'hourly'  ? parseFloat(hourlyRate)  : null,
      fixedAmount: type === 'fixed'   ? parseFloat(fixedAmount) : null,
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
        borderRadius: 18, padding: 28, width: 420, display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>
          {auftrag ? 'Auftrag bearbeiten' : 'Neuer Auftrag'}
        </h2>

        <div>
          <label style={labelStyle}>Kunde</label>
          <select value={accountId} onChange={e => setAccountId(e.target.value)} style={inputStyle}>
            <option value="">Kunden wählen…</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Bezeichnung</label>
          <input
            autoFocus value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="z.B. Website Redesign Q2"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Abrechnungsart</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['hourly', 'fixed'] as AuftragType[]).map(t => (
              <button key={t} type="button" onClick={() => setType(t)} style={{
                flex: 1, padding: '9px 0', borderRadius: 9, cursor: 'pointer',
                border: `1px solid ${type === t ? 'var(--accent)' : 'rgba(255,255,255,0.09)'}`,
                background: type === t ? 'oklch(92% 0.2 125 / 0.1)' : 'transparent',
                color: type === t ? 'var(--accent)' : 'var(--fg-dim)',
                fontSize: 12, fontWeight: 700,
              }}>
                {t === 'hourly' ? 'Nach Stunden' : 'Pauschal'}
              </button>
            ))}
          </div>
        </div>

        {type === 'hourly' ? (
          <div>
            <label style={labelStyle}>Stundensatz (€)</label>
            <input type="number" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)}
              placeholder="90" min="1" style={inputStyle} />
          </div>
        ) : (
          <div>
            <label style={labelStyle}>Pauschalbetrag (€)</label>
            <input type="number" value={fixedAmount} onChange={e => setFixedAmount(e.target.value)}
              placeholder="2500" min="1" style={inputStyle} />
          </div>
        )}

        <div>
          <label style={labelStyle}>Notizen (optional)</label>
          <input value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Interne Notizen zum Auftrag…" style={inputStyle} />
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
            {auftrag ? 'Speichern' : 'Auftrag anlegen'}
          </button>
        </div>
      </div>
    </div>
  )
}
