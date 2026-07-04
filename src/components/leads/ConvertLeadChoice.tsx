import { useState } from 'react'
import { useDialogFocus } from '@/components/ui/Sheet'

interface Props {
  leadName: string
  /** withDeal=true legt zusätzlich einen Deal in der ersten Pipeline-Stage an. */
  onChoose: (withDeal: boolean) => void | Promise<void>
  onCancel: () => void
}

/**
 * Auswahl beim „Zu Kunde machen": nur Kunde, oder Kunde + Deal in der
 * Pipeline. Gleicht die beiden Konvertierungspfade an — Drag auf
 * „Qualifiziert" erzeugt schon immer beides.
 */
export function ConvertLeadChoice({ leadName, onChoose, onCancel }: Props) {
  const [saving, setSaving] = useState(false)
  const dialogRef = useDialogFocus(true, onCancel)

  const choose = async (withDeal: boolean) => {
    setSaving(true)
    try {
      await onChoose(withDeal)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1300,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={e => e.target === e.currentTarget && onCancel()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Zu Kunde machen"
        tabIndex={-1}
        style={{
          width: '100%', maxWidth: 380,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 24,
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)', flexShrink: 0 }} />
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Zu Kunde machen</h2>
        </div>
        <p style={{ fontSize: 12, color: 'var(--fg-dim)', margin: '0 0 16px' }}>{leadName}</p>

        <p style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: '0 0 20px', lineHeight: 1.5 }}>
          Mit Deal taucht der Kunde direkt in der Pipeline auf — inklusive
          automatischem Rechnungsvorschlag beim Gewinn.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            className="btn-primary"
            onClick={() => choose(true)}
            disabled={saving}
            style={{ width: '100%', padding: '9px 12px', fontSize: 13 }}
          >
            {saving ? 'Wird umgewandelt…' : 'Kunde + Deal anlegen'}
          </button>
          <button
            className="btn-ghost"
            onClick={() => choose(false)}
            disabled={saving}
            style={{ width: '100%', padding: '8px 12px', fontSize: 12.5 }}
          >
            Nur Kunde
          </button>
          <button
            className="btn-ghost"
            onClick={onCancel}
            disabled={saving}
            style={{ width: '100%', padding: '8px 12px', fontSize: 12.5, color: 'var(--fg-dim)' }}
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  )
}
