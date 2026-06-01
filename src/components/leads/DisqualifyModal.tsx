import { useState } from 'react'
import type { Lead } from '@/types/lead.types'

interface Props {
  lead: Lead
  onConfirm: (reEngageDate: string) => Promise<void>
  onCancel: () => void
}

function todayPlus(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export function DisqualifyModal({ lead, onConfirm, onCancel }: Props) {
  const [date, setDate] = useState(todayPlus(90))
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    if (!date) return
    setSaving(true)
    try {
      await onConfirm(date)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={e => e.target === e.currentTarget && onCancel()}
    >
      <div style={{
        width: '100%', maxWidth: 360,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 24,
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6B7280', flexShrink: 0 }} />
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Wann re-engagen?</h2>
        </div>
        <p style={{ fontSize: 12, color: 'var(--fg-dim)', margin: '0 0 20px' }}>{lead.name}</p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[30, 60, 90].map(days => (
            <button
              key={days}
              onClick={() => setDate(todayPlus(days))}
              className="btn-ghost"
              style={{
                flex: 1, fontSize: 12, padding: '6px 0',
                background: date === todayPlus(days) ? 'var(--accent-soft)' : undefined,
                color: date === todayPlus(days) ? 'var(--accent)' : undefined,
                fontWeight: date === todayPlus(days) ? 700 : undefined,
              }}
            >
              {days} Tage
            </button>
          ))}
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 5 }}>
            Datum
          </label>
          <input
            className="mock-input"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onCancel} disabled={saving}>Zurück</button>
          <button className="btn-primary" onClick={handleConfirm} disabled={!date || saving}>
            {saving ? 'Wird gespeichert…' : 'Disqualifizieren'}
          </button>
        </div>
      </div>
    </div>
  )
}
