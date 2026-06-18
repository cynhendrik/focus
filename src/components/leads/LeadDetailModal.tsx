import { useState, useEffect } from 'react'
import { useLeadsStore } from '@/store/leads.store'
import { leadToUpsertPayload } from '@/lib/lead-payload'
import { useDialogFocus } from '@/components/ui/Sheet'
import { ActivityStream } from '@/components/activity/ActivityStream'
import type { Lead } from '@/types/lead.types'

interface Props {
  lead: Lead
  workspaceId: string
  onClose: () => void
}

export function LeadDetailModal({ lead, onClose }: Props) {
  const upsertLead = useLeadsStore(s => s.upsert)
  const dialogRef  = useDialogFocus(true)

  // Local mirror of the phone — the modal receives `lead` as a snapshot, so
  // edits would otherwise not show until the board re-opens the modal.
  const [phone, setPhone]               = useState(lead.phone ?? '')
  const [editingPhone, setEditingPhone] = useState(false)
  const [phoneDraft, setPhoneDraft]     = useState('')
  const [phoneSaving, setPhoneSaving]   = useState(false)
  const [phoneError, setPhoneError]     = useState<string | null>(null)

  function startEditPhone() {
    setPhoneDraft(phone)
    setPhoneError(null)
    setEditingPhone(true)
  }

  async function savePhone() {
    const next = phoneDraft.trim()
    setPhoneSaving(true)
    setPhoneError(null)
    try {
      await upsertLead(leadToUpsertPayload(lead, { phone: next || undefined }))
      setPhone(next)
      setEditingPhone(false)
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setPhoneSaving(false)
    }
  }

  useEffect(() => {
    const hide = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', hide)
    return () => document.removeEventListener('keydown', hide)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={lead.name}
        tabIndex={-1}
        style={{
          width: '100%', maxWidth: 760,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 0,
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column', maxHeight: '88vh',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>{lead.name}</div>
              {lead.companyName && (
                <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>{lead.companyName}</div>
              )}
            </div>
            <button
              aria-label="Schließen"
              onClick={onClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--fg-dim)', fontSize: 18, lineHeight: 1, padding: '2px 6px',
              }}
            >
              ×
            </button>
          </div>

          {/* Contact info */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 14 }}>
            {lead.email && (
              <a
                href={`mailto:${lead.email}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 12, color: 'var(--accent)', textDecoration: 'none',
                  background: 'var(--accent-soft)', padding: '5px 10px',
                  borderRadius: 99, fontWeight: 500,
                }}
              >
                ✉️ {lead.email}
              </a>
            )}

            {/* Phone — editable inline */}
            {editingPhone ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input
                  className="mock-input"
                  type="tel"
                  value={phoneDraft}
                  onChange={e => setPhoneDraft(e.target.value)}
                  placeholder="+49 151 1234567"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') savePhone()
                    if (e.key === 'Escape') { e.stopPropagation(); setEditingPhone(false) }
                  }}
                  style={{ width: 170, fontSize: 12, padding: '5px 10px' }}
                />
                <button
                  className="btn-primary"
                  onClick={savePhone}
                  disabled={phoneSaving}
                  style={{ fontSize: 11, padding: '5px 10px', flexShrink: 0 }}
                >
                  {phoneSaving ? '…' : 'OK'}
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => setEditingPhone(false)}
                  disabled={phoneSaving}
                  style={{ fontSize: 11, padding: '5px 8px', flexShrink: 0 }}
                >
                  Abbrechen
                </button>
              </div>
            ) : phone ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <a
                  href={`tel:${phone}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 12, color: 'var(--accent)', textDecoration: 'none',
                    background: 'var(--accent-soft)', padding: '5px 10px',
                    borderRadius: 99, fontWeight: 500,
                  }}
                >
                  📞 {phone}
                </a>
                <button
                  aria-label="Telefonnummer bearbeiten"
                  title="Bearbeiten"
                  onClick={startEditPhone}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--fg-dim)', fontSize: 12, padding: '2px 4px',
                  }}
                >
                  ✎
                </button>
              </span>
            ) : (
              <button
                onClick={startEditPhone}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 12, color: 'var(--warn)', cursor: 'pointer',
                  background: 'rgba(251,191,36,0.10)', padding: '5px 10px',
                  border: '1px dashed rgba(251,191,36,0.4)', borderRadius: 99, fontWeight: 600,
                }}
              >
                📞 + Telefon hinzufügen
              </button>
            )}

            {!lead.email && !phone && !editingPhone && (
              <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Keine E-Mail hinterlegt</span>
            )}
          </div>
          {phoneError && (
            <div style={{ fontSize: 11, color: '#f87171', marginTop: 6 }}>{phoneError}</div>
          )}
        </div>

        {/* Scrollable body — unified activity stream (same as customer), incl.
            automatic follow-ups for this lead. */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 24px' }}>
          <ActivityStream
            accountId={lead.id}
            sources={{ followUpQueue: true }}
            compact
            loadActivitiesOnMount
          />
        </div>
      </div>
    </div>
  )
}
