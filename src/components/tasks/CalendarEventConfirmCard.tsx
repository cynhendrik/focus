import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Sheet'
import { useAccountsStore } from '@/store/accounts.store'
import { Calendar, Clock, MapPin, User, X } from 'lucide-react'

export interface PendingEventDraft {
  title: string
  scheduledAt: string        // ISO with explicit clock time
  plannedMinutes: number
  customerId?: string
  description?: string
  location?: string
}

interface Props {
  open: boolean
  draft: PendingEventDraft | null
  /** Called when user confirms — both task AND calendar event get created */
  onConfirm: (finalDraft: PendingEventDraft) => void
  /** Called when user opts for task-only (no calendar event) */
  onTaskOnly: () => void
  /** Called when user cancels — composer text stays untouched */
  onCancel: () => void
}

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120]

function formatHeader(iso: string): string {
  const d = new Date(iso)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0)

  const day = dayStart.getTime() === today.getTime()       ? 'Heute'
            : dayStart.getTime() === tomorrow.getTime()    ? 'Morgen'
            : d.toLocaleDateString('de', { weekday: 'long', day: '2-digit', month: 'short' })
  const time = d.toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' })
  return `${day} · ${time}`
}

export function CalendarEventConfirmCard({ open, draft, onConfirm, onTaskOnly, onCancel }: Props) {
  const accounts = useAccountsStore(s => s.accounts)
  const [title, setTitle]               = useState('')
  const [minutes, setMinutes]           = useState(30)
  const [location, setLocation]         = useState('')
  const [description, setDescription]   = useState('')
  const [customerId, setCustomerId]     = useState<string | undefined>()

  // Initialize from draft each time it opens
  useEffect(() => {
    if (!draft) return
    setTitle(draft.title)
    setMinutes(draft.plannedMinutes)
    setLocation(draft.location ?? '')
    setDescription(draft.description ?? '')
    setCustomerId(draft.customerId)
  }, [draft])

  if (!draft) return null

  const customer = customerId ? accounts.find(a => a.id === customerId) : undefined

  const confirm = () => {
    onConfirm({
      title: title.trim() || draft.title,
      scheduledAt: draft.scheduledAt,
      plannedMinutes: minutes,
      customerId,
      location: location.trim() || undefined,
      description: description.trim() || undefined,
    })
  }

  return (
    <Modal open={open} onClose={onCancel} width={460}>
      <div style={{ padding: '24px 26px 22px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 10.5, fontWeight: 700,
              color: 'var(--accent)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}>
              <Calendar size={11} />
              Neuer Termin
            </div>
            <h3 style={{
              fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600,
              letterSpacing: '-0.01em', margin: '6px 0 0',
            }}>
              {formatHeader(draft.scheduledAt)}
            </h3>
          </div>
          <button onClick={onCancel} style={{
            width: 30, height: 30, borderRadius: 10,
            background: 'oklch(50% 0 0 / 0.06)', color: 'var(--fg-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={13} />
          </button>
        </div>

        {/* Title */}
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirm() } }}
          placeholder="Titel des Termins"
          style={{
            width: '100%', background: 'transparent',
            border: 'none',
            borderBottom: '1px solid var(--border)',
            padding: '8px 0 12px',
            fontSize: 17, fontWeight: 500,
            color: 'var(--fg)', letterSpacing: '-0.01em',
            outline: 'none',
            transition: 'border-color 180ms',
          }}
          onFocus={e => { e.currentTarget.style.borderBottomColor = 'var(--accent)' }}
          onBlur ={e => { e.currentTarget.style.borderBottomColor = 'var(--border)' }}
        />

        {/* Duration */}
        <Row icon={<Clock size={13} />} label="Dauer">
          <div style={{
            display: 'inline-flex', gap: 2, padding: 3, borderRadius: 99,
            background: 'oklch(50% 0 0 / 0.06)', border: '1px solid var(--border)',
          }}>
            {DURATION_PRESETS.map(m => {
              const active = minutes === m
              return (
                <button
                  key={m}
                  onClick={() => setMinutes(m)}
                  style={{
                    padding: '4px 10px', borderRadius: 99,
                    fontSize: 11, fontWeight: 600,
                    fontFamily: 'var(--font-mono)',
                    background: active ? 'var(--accent)' : 'transparent',
                    color: active ? 'var(--accent-ink)' : 'var(--fg-muted)',
                    transition: 'background 160ms, color 160ms',
                  }}
                >
                  {m < 60 ? `${m}m` : `${m / 60}h`}
                </button>
              )
            })}
          </div>
        </Row>

        {/* Customer */}
        <Row icon={<User size={13} />} label="Kunde">
          {customer ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 11px', borderRadius: 99,
              background: 'var(--accent-soft)', color: 'var(--accent-ink)',
              fontSize: 12, fontWeight: 600,
            }}>
              {customer.name}
              <button
                onClick={() => setCustomerId(undefined)}
                style={{ color: 'var(--accent-ink)', opacity: 0.55, fontSize: 11 }}
              >×</button>
            </div>
          ) : (
            <select
              value=""
              onChange={e => setCustomerId(e.target.value || undefined)}
              style={{
                padding: '5px 10px', borderRadius: 8,
                background: 'oklch(50% 0 0 / 0.06)',
                border: '1px solid var(--border)',
                color: 'var(--fg-muted)', fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <option value="">– kein Kunde –</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
        </Row>

        {/* Location */}
        <Row icon={<MapPin size={13} />} label="Ort">
          <input
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="Optional"
            style={{
              flex: 1,
              background: 'transparent', border: 'none',
              borderBottom: '1px solid var(--border)',
              padding: '4px 0',
              fontSize: 12.5, color: 'var(--fg)',
              outline: 'none', transition: 'border-color 180ms',
            }}
            onFocus={e => { e.currentTarget.style.borderBottomColor = 'var(--accent)' }}
            onBlur ={e => { e.currentTarget.style.borderBottomColor = 'var(--border)' }}
          />
        </Row>

        {/* Description */}
        <div style={{ marginTop: 12, marginBottom: 18 }}>
          <div className="card-label" style={{ marginBottom: 6 }}>Notiz</div>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Worum geht's? (optional)"
            rows={2}
            style={{
              width: '100%', resize: 'vertical', minHeight: 50,
              padding: '8px 10px', borderRadius: 10,
              background: 'oklch(50% 0 0 / 0.04)',
              border: '1px solid var(--border)',
              fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.5,
              fontFamily: 'inherit',
              outline: 'none', transition: 'border-color 180ms',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onBlur ={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          />
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={onTaskOnly}
            style={{
              padding: '9px 14px', borderRadius: 10,
              background: 'transparent',
              color: 'var(--fg-muted)',
              fontSize: 12, fontWeight: 600,
              border: '1px solid var(--border)',
              transition: 'background 160ms, color 160ms',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'oklch(50% 0 0 / 0.06)'
              e.currentTarget.style.color = 'var(--fg)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--fg-muted)'
            }}
          >
            Nur Task
          </button>
          <div style={{ flex: 1 }} />
          <button
            onClick={confirm}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 18px', borderRadius: 10,
              background: 'var(--accent)', color: 'var(--accent-ink)',
              fontSize: 13, fontWeight: 700,
              boxShadow: '0 6px 18px -8px var(--accent-glow)',
            }}
          >
            <Calendar size={13} />
            Termin anlegen
            <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.7, fontFamily: 'var(--font-mono)' }}>
              ⏎
            </span>
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 11.5, color: 'var(--fg-muted)',
        minWidth: 70,
      }}>
        {icon}
        {label}
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
        {children}
      </div>
    </div>
  )
}
