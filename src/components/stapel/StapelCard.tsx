import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { generateCorraDraft } from '@/lib/ai/corra'
import type { PreparedItem, PreparedItemPayload } from '@/types/prepared-item.types'

interface StapelCardProps {
  item: PreparedItem
  focused: boolean
  onApprove: () => void
  onSaveDraft: (payload: PreparedItemPayload) => void
  onSnooze: (days: number) => void
  onDismiss: () => void
  busy?: boolean
}

const TYPE_LABEL: Record<PreparedItem['type'], string> = {
  mahnung: 'MAHNWESEN', followup: 'FOLLOW-UP', rechnungsentwurf: 'RECHNUNG', aufgabe: 'AUFGABE',
}

/** Karte des Stapels: Was habe ich vorbereitet · Warum · das Ergebnis — plus 4 Aktionen. */
export function StapelCard({ item, focused, onApprove, onSaveDraft, onSnooze, onDismiss, busy }: StapelCardProps) {
  const [editing, setEditing] = useState(false)
  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const [draftSubject, setDraftSubject] = useState(item.payload.draftSubject ?? '')
  const [draftBody, setDraftBody] = useState(item.payload.draftBody ?? '')
  const [koraBusy, setKoraBusy] = useState(false)

  const hasDraft = item.payload.draftBody != null

  const rephrase = async () => {
    setKoraBusy(true)
    try {
      // Einziger KI-Einsatz im Stapel: bewusster Klick des Nutzers.
      const text = await generateCorraDraft(
        item.type === 'mahnung'
          ? { kind: 'reminder', customerName: item.payload.customerName ?? '', invoiceNumber: item.payload.invoiceNumber ?? '', amount: item.payload.amount ?? 0, dueDate: '', daysOverdue: 0, dunningLevel: item.payload.level ?? 0 }
          : { kind: 'followup', customerName: item.payload.customerName ?? '', topic: item.payload.title },
      )
      if (text) setDraftBody(text)
    } finally {
      setKoraBusy(false)
    }
  }

  const btn = (label: string, onClick: () => void, opts?: { primary?: boolean; disabled?: boolean }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={opts?.disabled}
      style={{
        padding: focused ? '9px 18px' : '5px 12px', borderRadius: 9, fontSize: 13, fontWeight: 600,
        cursor: opts?.disabled ? 'default' : 'pointer', opacity: opts?.disabled ? 0.5 : 1,
        border: opts?.primary ? 'none' : '1px solid var(--border)',
        background: opts?.primary ? 'var(--accent)' : 'transparent',
        color: opts?.primary ? '#fff' : 'var(--fg-muted)',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderLeft: '3px solid var(--accent)', borderRadius: 'var(--radius)',
      padding: focused ? '24px 28px' : '12px 16px',
      display: 'flex', flexDirection: 'column', gap: focused ? 14 : 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
          {TYPE_LABEL[item.type]}
        </span>
      </div>

      <div>
        <h3 style={{ fontSize: focused ? 22 : 14, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
          {item.payload.title}
        </h3>
        <p style={{ fontSize: 12, color: 'var(--fg-dim)', margin: '6px 0 0 0', lineHeight: 1.5 }}>
          {item.payload.why}
        </p>
      </div>

      {focused && hasDraft && !editing && (
        <details>
          <summary style={{ fontSize: 12, color: 'var(--fg-muted)', cursor: 'pointer' }}>Entwurf ansehen</summary>
          <pre style={{
            whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.6, color: 'var(--fg-muted)',
            background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
            padding: 12, margin: '8px 0 0 0', fontFamily: 'inherit',
          }}>
            {item.payload.draftSubject ? `Betreff: ${item.payload.draftSubject}\n\n` : ''}{item.payload.draftBody}
          </pre>
        </details>
      )}

      {editing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {item.payload.draftSubject != null && (
            <label style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              Betreff
              <input value={draftSubject} onChange={e => setDraftSubject(e.target.value)} />
            </label>
          )}
          <label style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
            Entwurf
            <textarea rows={8} value={draftBody} onChange={e => setDraftBody(e.target.value)} style={{ fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5 }} />
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {btn('Entwurf speichern', () => {
              onSaveDraft({ ...item.payload, draftSubject: draftSubject || undefined, draftBody })
              setEditing(false)
            }, { primary: true })}
            {btn('Abbrechen', () => setEditing(false))}
            <button type="button" onClick={rephrase} disabled={koraBusy}
              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--border)', borderRadius: 9, padding: '6px 12px', fontSize: 12, color: 'var(--fg-muted)', cursor: 'pointer', opacity: koraBusy ? 0.5 : 1 }}>
              <Sparkles size={14} /> {koraBusy ? 'KORA schreibt …' : 'Mit KORA umformulieren'}
            </button>
          </div>
        </div>
      )}

      {!editing && (
        <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
          {btn('Freigeben', onApprove, { primary: true, disabled: busy })}
          {hasDraft && btn('Anpassen', () => setEditing(true), { disabled: busy })}
          {btn('Später', () => setSnoozeOpen(o => !o), { disabled: busy })}
          {btn('Verwerfen', onDismiss, { disabled: busy })}
          {snoozeOpen && (
            <div style={{
              position: 'absolute', top: '110%', left: 0, zIndex: 10,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
              padding: 8, display: 'flex', flexDirection: 'column', gap: 4, boxShadow: 'var(--card-shadow)',
            }}>
              {btn('Morgen', () => { setSnoozeOpen(false); onSnooze(1) })}
              {btn('In 3 Tagen', () => { setSnoozeOpen(false); onSnooze(3) })}
              {btn('Nächste Woche', () => { setSnoozeOpen(false); onSnooze(7) })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
