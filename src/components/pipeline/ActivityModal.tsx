import { useState } from 'react'
import { useActivitiesStore } from '@/store/activities.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import type { ActivityType } from '@/types/pipeline.types'
import { Phone, Users, Mail, FileText } from 'lucide-react'

const TYPES: { id: ActivityType; label: string; Icon: typeof Phone }[] = [
  { id: 'call',    label: 'Anruf',   Icon: Phone },
  { id: 'meeting', label: 'Meeting', Icon: Users },
  { id: 'email',   label: 'E-Mail',  Icon: Mail },
  { id: 'note',    label: 'Notiz',   Icon: FileText },
]

interface Props {
  customerId: string
  presetType?: ActivityType
  onClose: () => void
}

export function ActivityModal({ customerId, presetType, onClose }: Props) {
  const create = useActivitiesStore(s => s.create)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const user = useAuthStore(s => s.user)

  const [type, setType] = useState<ActivityType>(presetType ?? 'call')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [duration, setDuration] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await create({
        workspaceId,
        createdBy: user?.email ?? 'user',
        accountId: customerId,
        customerId,
        type,
        title: title.trim() || TYPES.find(t => t.id === type)?.label,
        body: body.trim() || undefined,
        durationMinutes: (type === 'call' || type === 'meeting') && duration
          ? parseInt(duration)
          : undefined,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, width: 380, maxWidth: '90vw' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>Aktivität erfassen</h2>

        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {TYPES.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setType(id)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                padding: '8px 6px', borderRadius: 10, border: '1.5px solid',
                borderColor: type === id ? 'var(--accent)' : 'var(--border)',
                background: type === id ? 'var(--accent-soft)' : 'transparent',
                cursor: 'pointer', fontSize: 10, fontWeight: 600,
                color: type === id ? 'var(--accent-ink)' : 'var(--fg-muted)',
              }}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 4 }}>
              Titel <span style={{ fontWeight: 400, opacity: 0.5 }}>(optional)</span>
            </label>
            <input
              className="mock-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={`z.B. Erstgespräch, Demo-Call, Preisverhandlung…`}
              autoFocus
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 4 }}>Datum</label>
            <input className="mock-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          {(type === 'call' || type === 'meeting') && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 4 }}>Dauer (Minuten)</label>
              <input className="mock-input" type="number" min="1" value={duration} onChange={e => setDuration(e.target.value)} placeholder="z.B. 30" />
            </div>
          )}

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 4 }}>Notiz</label>
            <textarea
              className="mock-input"
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Was wurde besprochen?"
              rows={3}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 12, padding: '7px 16px' }}>Abbrechen</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ fontSize: 12, padding: '7px 16px' }}>
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}
