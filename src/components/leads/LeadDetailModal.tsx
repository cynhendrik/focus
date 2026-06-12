import { useState, useEffect } from 'react'
import { useActivitiesStore } from '@/store/activities.store'
import { useAuthStore } from '@/store/auth.store'
import type { Lead } from '@/types/lead.types'
import type { ActivityType } from '@/types/pipeline.types'

interface Props {
  lead: Lead
  workspaceId: string
  onClose: () => void
}

const ACTIVITY_TYPES: { type: ActivityType; label: string }[] = [
  { type: 'call',  label: 'Anruf'   },
  { type: 'email', label: 'E-Mail'  },
  { type: 'note',  label: 'Notiz'   },
  { type: 'task',  label: 'Aufgabe' },
]

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('de-DE') + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

const typeIcon: Record<string, string> = {
  call: '📞', email: '✉️', note: '📝', task: '📋',
  email_out: '✉️', email_in: '✉️', meeting: '📅', followup: '🔔',
}

export function LeadDetailModal({ lead, workspaceId, onClose }: Props) {
  const user           = useAuthStore(s => s.user)
  const activities     = useActivitiesStore(s => s.activities)
  const isLoading      = useActivitiesStore(s => s.isLoading)
  const loadActivities = useActivitiesStore(s => s.loadForCustomer)
  const createActivity = useActivitiesStore(s => s.create)

  const [actType, setActType]   = useState<ActivityType>('call')
  const [title, setTitle]       = useState('')
  const [dueAt, setDueAt]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    loadActivities(lead.id)
  }, [lead.id, loadActivities])

  useEffect(() => {
    const hide = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', hide)
    return () => document.removeEventListener('keydown', hide)
  }, [onClose])

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    setSaveError(null)
    try {
      await createActivity({
        workspaceId,
        createdBy: user?.id ?? '',
        accountId: lead.id,
        type: actType,
        title: title.trim(),
        dueAt: dueAt || undefined,
        status: 'open',
        payload: '{}',
      })
      setTitle('')
      setDueAt('')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: '100%', maxWidth: 480,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 0,
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column', maxHeight: '80vh',
        overflow: 'hidden',
      }}>

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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
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
            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 12, color: 'var(--accent)', textDecoration: 'none',
                  background: 'var(--accent-soft)', padding: '5px 10px',
                  borderRadius: 99, fontWeight: 500,
                }}
              >
                📞 {lead.phone}
              </a>
            )}
            {!lead.email && !lead.phone && (
              <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Keine Kontaktdaten hinterlegt</span>
            )}
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* Add activity */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-dim)', marginBottom: 12 }}>
              Aktivität hinzufügen
            </div>

            {/* Type picker */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {ACTIVITY_TYPES.map(({ type, label }) => (
                <button
                  key={type}
                  onClick={() => setActType(type)}
                  style={{
                    padding: '5px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', border: '1px solid',
                    background: actType === type ? 'var(--accent)' : 'transparent',
                    color: actType === type ? 'var(--accent-ink)' : 'var(--fg-muted)',
                    borderColor: actType === type ? 'var(--accent)' : 'var(--border)',
                    transition: 'all 120ms',
                  }}
                >
                  {typeIcon[type]} {label}
                </button>
              ))}
            </div>

            <input
              className="mock-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Kurze Beschreibung…"
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSave()}
              style={{ marginBottom: 10 }}
            />

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                className="mock-input"
                type="date"
                value={dueAt}
                onChange={e => setDueAt(e.target.value)}
                style={{ flex: 1 }}
                title="Fälligkeitsdatum (optional)"
              />
              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={!title.trim() || saving}
                style={{ flexShrink: 0 }}
              >
                {saving ? 'Speichern…' : 'Speichern'}
              </button>
            </div>
            {saveError && (
              <div style={{ fontSize: 11, color: '#f87171', marginTop: 6 }}>{saveError}</div>
            )}
          </div>

          {/* Activity history */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-dim)', marginBottom: 12 }}>
              Aktivitäten
            </div>
            {isLoading ? (
              <div style={{ fontSize: 12, color: 'var(--fg-dim)', padding: '12px 0' }}>Lade…</div>
            ) : activities.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--fg-dim)', padding: '12px 0' }}>
                Noch keine Aktivitäten
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activities.map(a => (
                  <div
                    key={a.id}
                    style={{
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                      padding: '10px 12px', borderRadius: 10,
                      background: 'var(--surface-2)', border: '1px solid var(--border)',
                    }}
                  >
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{typeIcon[a.type] ?? '•'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
                        {a.title ?? a.type}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
                        {fmtDateTime(a.createdAt)}
                        {a.dueAt && ` · Fällig: ${new Date(a.dueAt).toLocaleDateString('de-DE')}`}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                      background: a.status === 'done' ? 'rgba(74,222,128,0.15)' : 'var(--surface-3)',
                      color: a.status === 'done' ? '#4ade80' : 'var(--fg-dim)',
                      flexShrink: 0,
                    }}>
                      {a.status === 'done' ? 'Erledigt' : a.status === 'cancelled' ? 'Storniert' : 'Offen'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
