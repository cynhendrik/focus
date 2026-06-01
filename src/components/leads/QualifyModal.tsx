import { useState } from 'react'
import type { Lead } from '@/types/lead.types'

interface Props {
  lead: Lead
  onConfirm: (appointmentDate?: string) => Promise<void>
  onCancel: () => void
}

export function QualifyModal({ lead, onConfirm, onCancel }: Props) {
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    setSaving(true)
    try {
      await onConfirm(date || undefined)
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
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#D0FC69', flexShrink: 0 }} />
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Termin buchen</h2>
        </div>
        <p style={{ fontSize: 12, color: 'var(--fg-dim)', margin: '0 0 20px' }}>{lead.name}</p>

        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 5 }}>
            Termin am <span style={{ fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            className="mock-input"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            autoFocus
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onCancel} disabled={saving}>Zurück</button>
          <button
            className="btn-primary"
            onClick={handleConfirm}
            disabled={saving}
            style={{ background: '#D0FC69', color: '#000' }}
          >
            {saving ? 'Wird erstellt…' : 'In Pipeline →'}
          </button>
        </div>
      </div>
    </div>
  )
}
