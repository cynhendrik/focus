import { useState, useEffect } from 'react'
import { Sparkles } from 'lucide-react'
import { generateCorraDraft } from '@/lib/ai/corra'
import type { PreparedItem, PreparedItemPayload, PreparedItemType } from '@/types/prepared-item.types'

const QUEUE_CAP = 7

interface StapelCardProps {
  item: PreparedItem
  focused: boolean
  onApprove: () => void
  onSaveDraft: (payload: PreparedItemPayload) => void
  onSnooze: (days: number) => void
  onDismiss: () => void
  onDelegate?: (assignee: string | null) => void
  delegatable?: { id: string; displayName: string }[]
  busy?: boolean
  queue?: { id: string; type: PreparedItemType; title: string }[]
  onPickQueue?: (id: string) => void
}

export const TYPE_LABEL: Record<PreparedItem['type'], string> = {
  mahnung: 'MAHNWESEN', followup: 'FOLLOW-UP', sequenz: 'SEQUENZ', rechnungsentwurf: 'RECHNUNG', aufgabe: 'AUFGABE',
}

/** Karte des Stapels: Was habe ich vorbereitet · Warum · das Ergebnis — plus 4 Aktionen + Danach-Band. */
export function StapelCard({ item, focused, onApprove, onSaveDraft, onSnooze, onDismiss, onDelegate, delegatable, busy, queue, onPickQueue }: StapelCardProps) {
  const [editing, setEditing] = useState(false)
  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const [delegateOpen, setDelegateOpen] = useState(false)
  const [draftSubject, setDraftSubject] = useState(item.payload.draftSubject ?? '')
  const [draftBody, setDraftBody] = useState(item.payload.draftBody ?? '')
  const [koraBusy, setKoraBusy] = useState(false)
  const [koraError, setKoraError] = useState<string | null>(null)

  // Kartenwechsel im selben Slot: Editor-Zustand auf die neue Karte zurücksetzen.
  useEffect(() => {
    setDraftSubject(item.payload.draftSubject ?? '')
    setDraftBody(item.payload.draftBody ?? '')
    setEditing(false)
    setSnoozeOpen(false)
    setDelegateOpen(false)
    setKoraError(null)
  }, [item.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasDraft = item.payload.draftBody != null

  const rephrase = async () => {
    setKoraBusy(true)
    setKoraError(null)
    try {
      // Einziger KI-Einsatz im Stapel: bewusster Klick des Nutzers.
      const ctx = item.type === 'mahnung'
        ? { kind: 'reminder' as const, customerName: item.payload.customerName ?? '', invoiceNumber: item.payload.invoiceNumber ?? '', amount: item.payload.amount ?? 0, dueDate: '', daysOverdue: 0, dunningLevel: item.payload.level ?? 0 }
        : item.type === 'rechnungsentwurf'
          ? { kind: 'invoice' as const, customerName: item.payload.customerName ?? '', invoiceNumber: item.payload.invoiceNumber, amount: item.payload.amount ?? 0 }
          : { kind: 'followup' as const, customerName: item.payload.customerName ?? '', topic: item.payload.title }
      const text = await generateCorraDraft(ctx)
      if (text) setDraftBody(text)
      else setKoraError('KORA hat keinen Text geliefert — bitte erneut versuchen.')
    } catch {
      setKoraError('KORA ist gerade nicht erreichbar — der Entwurf bleibt unverändert.')
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
        padding: focused ? '10px 20px' : '5px 12px',
        borderRadius: 11, fontSize: 13, fontWeight: 650,
        cursor: opts?.disabled ? 'default' : 'pointer',
        opacity: opts?.disabled ? 0.5 : 1,
        border: 'none',
        background: opts?.primary ? 'var(--accent-gradient)' : 'var(--surface-2)',
        color: opts?.primary ? '#fff' : 'var(--fg-2)',
        boxShadow: opts?.primary ? '0 2px 8px rgb(242 117 79 / 0.38)' : 'none',
      }}
    >
      {label}
    </button>
  )

  const showQueue = focused && queue && queue.length > 0

  return (
    <div style={{
      background: 'var(--surface)',
      borderRadius: 'var(--radius)',
      padding: focused ? '28px 30px 24px' : '12px 16px',
      display: 'flex', flexDirection: 'column', gap: focused ? 14 : 8,
      boxShadow: focused
        ? 'var(--card-shadow), 0 18px 44px -20px rgb(35 35 60 / 0.32)'
        : 'var(--card-shadow)',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Gradient-Topline nur auf der Fokus-Karte */}
      {focused && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'var(--accent-gradient)',
        }} />
      )}

      {/* Kind-Pille */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          display: 'inline-block',
          fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.13em',
          color: 'var(--accent-text)', background: 'var(--accent-soft)',
          padding: '4px 10px', borderRadius: 99,
        }}>
          {TYPE_LABEL[item.type]}
        </span>
      </div>

      <div>
        <h3 style={{ fontSize: focused ? 24 : 14, fontWeight: 800, margin: 0, letterSpacing: '-0.03em', lineHeight: 1.2 }}>
          {item.payload.title}
        </h3>
        <p style={{ fontSize: 13.5, color: 'var(--fg-muted)', margin: '6px 0 0 0', lineHeight: 1.6 }}>
          {item.payload.why}
        </p>
      </div>

      {focused && hasDraft && !editing && (
        <details>
          <summary style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg-muted)', cursor: 'pointer' }}>Entwurf ansehen</summary>
          <pre style={{
            whiteSpace: 'pre-wrap', fontSize: 12.5, lineHeight: 1.65, color: 'var(--fg-2)',
            background: 'var(--surface-2)', borderRadius: 11,
            padding: '14px 16px', margin: '10px 0 0 0', fontFamily: 'inherit',
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
          {koraError && <p style={{ fontSize: 12, color: 'var(--danger, #d33)', margin: 0 }}>{koraError}</p>}
        </div>
      )}

      {!editing && (
        <div style={{ display: 'flex', gap: 8, position: 'relative', flexWrap: 'wrap' }}>
          {btn('Freigeben', onApprove, { primary: true, disabled: busy })}
          {hasDraft && btn('Anpassen', () => setEditing(true), { disabled: busy })}
          {btn('Später', () => { setSnoozeOpen(o => !o); setDelegateOpen(false) }, { disabled: busy })}
          {onDelegate && delegatable && delegatable.length > 0 && btn('Übergeben', () => { setDelegateOpen(o => !o); setSnoozeOpen(false) }, { disabled: busy })}
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
          {delegateOpen && onDelegate && delegatable && (
            <div style={{
              position: 'absolute', top: '110%', left: 90, zIndex: 10,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
              padding: 8, display: 'flex', flexDirection: 'column', gap: 4, boxShadow: 'var(--card-shadow)',
            }}>
              {delegatable.map(m => (
                <button key={m.id} type="button" onClick={() => { setDelegateOpen(false); onDelegate(m.id) }}
                  style={{ background: 'none', border: 'none', padding: '6px 10px', fontSize: 13, textAlign: 'left', cursor: 'pointer', color: 'var(--fg)' }}>
                  An {m.displayName} übergeben
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Danach-Band — volles Kartenbreite als Fußzeile */}
      {showQueue && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          margin: '22px -30px -24px',
          padding: '13px 30px',
          background: 'var(--surface-2)',
          overflowX: 'auto',
          scrollbarWidth: 'none',
        } as React.CSSProperties}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            color: 'var(--fg-dim)', flexShrink: 0, marginRight: 4,
          }}>
            DANACH
          </span>
          {queue!.slice(0, QUEUE_CAP).map(q => (
            <button
              key={q.id}
              type="button"
              onClick={() => onPickQueue?.(q.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 9,
                height: 34, padding: '0 15px 0 6px',
                background: 'var(--surface)', border: 'none', borderRadius: 99,
                boxShadow: '0 1px 2px rgb(35 35 60 / 0.08)',
                cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit',
              }}
            >
              <span style={{
                display: 'inline-flex', alignItems: 'center', height: 24,
                fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, letterSpacing: '0.10em',
                color: 'var(--accent-text)', background: 'var(--accent-soft)',
                padding: '0 9px', borderRadius: 99,
              }}>
                {TYPE_LABEL[q.type]}
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg-2)', whiteSpace: 'nowrap' }}>
                {q.title}
              </span>
            </button>
          ))}
          {queue!.length > QUEUE_CAP && (
            <span style={{ fontSize: 11.5, color: 'var(--fg-dim)', flexShrink: 0 }}>
              + {queue!.length - QUEUE_CAP} weitere
            </span>
          )}
        </div>
      )}
    </div>
  )
}
