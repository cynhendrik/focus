import { useEffect, useState } from 'react'
import { useActivitiesStore } from '@/store/activities.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { useCustomersStore } from '@/store/customers.store'
import {
  CornerUpLeft, Mail, Phone, MessageCircle, Bookmark,
  Bell, Plus, Trash2, Check,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type Category = 'reply' | 'email' | 'call' | 'whatsapp' | 'task'

interface CatDef { label: string; color: string; bg: string; Icon: LucideIcon }

const CATS: Record<Category, CatDef> = {
  reply:    { label: 'Antworten',  color: '#a3e635', bg: 'rgba(163,230,53,0.12)',  Icon: CornerUpLeft },
  email:    { label: 'E-Mail',     color: '#2dd4bf', bg: 'rgba(45,212,191,0.12)',  Icon: Mail },
  call:     { label: 'Anrufen',   color: '#fb923c', bg: 'rgba(251,146,60,0.12)',  Icon: Phone },
  whatsapp: { label: 'WhatsApp',  color: '#4ade80', bg: 'rgba(74,222,128,0.12)',  Icon: MessageCircle },
  task:     { label: 'Aufgabe',   color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', Icon: Bookmark },
}

const CAT_ORDER: Category[] = ['reply', 'email', 'call', 'whatsapp', 'task']

function parseCategory(payload?: string): Category {
  try {
    if (!payload) return 'task'
    const cat = (JSON.parse(payload) as { category?: string }).category as Category
    return CAT_ORDER.includes(cat) ? cat : 'task'
  } catch { return 'task' }
}

function formatDueDate(iso: string): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dc = new Date(iso)
  dc.setHours(0, 0, 0, 0)
  const diff = Math.floor((dc.getTime() - today.getTime()) / 86400000)
  if (diff < 0) return `Überfällig · ${new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`
  if (diff === 0) return 'Heute fällig'
  if (diff === 1) return 'Morgen fällig'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

interface Props { customerId: string }

export function FollowupsPane({ customerId }: Props) {
  const { activities, loadForCustomer, create, update, remove } = useActivitiesStore()
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const user = useAuthStore(s => s.user)
  const customer = useCustomersStore(s => s.customers.find(c => c.id === customerId))

  const [showNew, setShowNew] = useState(false)
  const [category, setCategory] = useState<Category>('task')
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadForCustomer(customerId) }, [customerId])

  const followups = activities.filter(a => a.type === 'followup')
  const open = followups.filter(a => a.status === 'open')
  const done = followups.filter(a => a.status === 'done')

  const handleCreate = async () => {
    if (!title.trim() || !workspaceId) return
    setSaving(true)
    try {
      await create({
        workspaceId,
        createdBy: user?.email ?? 'user',
        accountId: customer?.id ?? customerId,
        customerId,
        type: 'followup',
        title: title.trim(),
        dueAt: dueAt || undefined,
        status: 'open',
        payload: JSON.stringify({ category }),
      })
      setTitle('')
      setDueAt('')
      setCategory('task')
      setShowNew(false)
    } finally {
      setSaving(false)
    }
  }

  const toggleDone = (id: string, currentStatus: string) => {
    update(id, { status: currentStatus === 'done' ? 'open' : 'done' })
  }

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Follow-ups ({open.length})</span>
        <button
          onClick={() => setShowNew(v => !v)}
          className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '5px 12px' }}
        >
          <Plus size={11} />
          Follow-up erstellen
        </button>
      </div>

      {showNew && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
          padding: 14, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {CAT_ORDER.map(c => {
              const def = CATS[c]
              const active = category === c
              return (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                    background: active ? def.bg : 'var(--surface-2)',
                    color: active ? def.color : 'var(--fg-dim)',
                    border: active ? `1px solid ${def.color}33` : '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                >
                  <def.Icon size={10} />
                  {def.label}
                </button>
              )
            })}
          </div>
          <input
            autoFocus
            className="mock-input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="Was muss erledigt werden?"
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              className="mock-input"
              type="date"
              value={dueAt}
              onChange={e => setDueAt(e.target.value)}
              style={{ flex: 1 }}
            />
            <button onClick={() => setShowNew(false)} className="btn-secondary" style={{ fontSize: 11, padding: '5px 12px' }}>
              Abbrechen
            </button>
            <button
              onClick={handleCreate}
              disabled={saving || !title.trim()}
              className="btn-primary"
              style={{ fontSize: 11, padding: '5px 12px' }}
            >
              {saving ? '…' : 'Erstellen'}
            </button>
          </div>
        </div>
      )}

      {open.length === 0 && !showNew && (
        <div
          onClick={() => setShowNew(true)}
          style={{
            textAlign: 'center', padding: '28px 20px', borderRadius: 12, cursor: 'pointer',
            border: '1.5px dashed var(--border)', background: 'var(--surface-2)',
            transition: 'background 150ms',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface-2)')}
        >
          <Bell size={18} style={{ color: 'var(--fg-dim)', margin: '0 auto 8px' }} />
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 4 }}>
            Keine offenen Follow-ups
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Klicken um ein Follow-up zu erstellen</div>
        </div>
      )}

      {open.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
          {open.map(fu => (
            <FollowupRow key={fu.id} followup={fu} onToggle={toggleDone} onRemove={remove} />
          ))}
        </div>
      )}

      {done.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-dim)', marginBottom: 6 }}>
            Erledigt ({done.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, opacity: 0.5 }}>
            {done.map(fu => (
              <FollowupRow key={fu.id} followup={fu} onToggle={toggleDone} onRemove={remove} />
            ))}
          </div>
        </>
      )}

      <style>{`.followup-row:hover .followup-del { opacity: 1 !important; }`}</style>
    </div>
  )
}

function FollowupRow({
  followup, onToggle, onRemove,
}: {
  followup: { id: string; title?: string; status: string; dueAt?: string; payload?: string }
  onToggle: (id: string, status: string) => void
  onRemove: (id: string) => void
}) {
  const cat = parseCategory(followup.payload)
  const def = CATS[cat]
  const done = followup.status === 'done'
  const { Icon } = def

  return (
    <div
      className="followup-row"
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
        borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)',
        position: 'relative',
      }}
    >
      <div style={{
        width: 24, height: 24, borderRadius: 6, flexShrink: 0,
        background: def.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={11} style={{ color: done ? 'var(--fg-dim)' : def.color }} />
      </div>

      <button
        onClick={() => onToggle(followup.id, followup.status)}
        style={{
          width: 16, height: 16, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
          border: done ? 'none' : '1.5px solid var(--border-strong)',
          background: done ? 'var(--accent)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {done && <Check size={9} strokeWidth={3} style={{ color: '#000' }} />}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: 12, fontWeight: 600,
          textDecoration: done ? 'line-through' : 'none',
          color: done ? 'var(--fg-dim)' : undefined,
        }}>
          {followup.title ?? '—'}
        </span>
        {followup.dueAt && !done && (
          <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
            {formatDueDate(followup.dueAt)}
          </span>
        )}
      </div>

      <button
        onClick={() => onRemove(followup.id)}
        className="followup-del"
        style={{
          width: 22, height: 22, borderRadius: 5, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: 'var(--fg-dim)', cursor: 'pointer',
          opacity: 0, transition: 'opacity 150ms', background: 'transparent', flexShrink: 0,
        }}
      >
        <Trash2 size={11} />
      </button>
    </div>
  )
}
