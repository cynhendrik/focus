import { useEffect, useState, useMemo, useRef } from 'react'
import type React from 'react'
import {
  CornerUpLeft, Mail, Phone, MessageCircle, Bookmark,
  Clock, Plus, Search, X, Check, Trash2, Send, SkipForward, Edit3,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useActivitiesStore } from '@/store/activities.store'
import { ActivitiesService } from '@/services/activities.service'
import { useCustomersStore } from '@/store/customers.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { useUiStore } from '@/store/ui.store'
import { useFollowUpQueueStore } from '@/store/follow-up-queue.store'
import { useLeadsStore } from '@/store/leads.store'
import type { Activity } from '@/types/pipeline.types'
import type { Customer } from '@/types/customer.types'
import type { FollowUpQueueItem } from '@/types/follow-up-queue.types'

type Category = 'reply' | 'email' | 'call' | 'whatsapp' | 'task'

interface CatDef {
  label: string
  color: string
  bg: string
  Icon: LucideIcon
  action: string
}

const CATS: Record<Category, CatDef> = {
  reply:    { label: 'Antworten',        color: '#a3e635', bg: 'rgba(163,230,53,0.12)',  Icon: CornerUpLeft,  action: 'Antworten' },
  email:    { label: 'E-Mail schreiben', color: '#2dd4bf', bg: 'rgba(45,212,191,0.12)',  Icon: Mail,          action: 'E-Mail schreiben' },
  call:     { label: 'Anrufen',          color: '#fb923c', bg: 'rgba(251,146,60,0.12)',  Icon: Phone,         action: 'Anrufen' },
  whatsapp: { label: 'WhatsApp',         color: '#4ade80', bg: 'rgba(74,222,128,0.12)',  Icon: MessageCircle, action: 'WhatsApp' },
  task:     { label: 'Markieren',        color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', Icon: Bookmark,      action: 'Erledigen' },
}

const CAT_ORDER: Category[] = ['reply', 'email', 'call', 'whatsapp', 'task']

const FOLLOW_UP_SEQUENCE_LENGTH = 4

const TEMPLATE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  value:        { label: 'Mehrwert',      color: '#a3e635', bg: 'rgba(163,230,53,0.12)' },
  social_proof: { label: 'Social Proof',  color: '#2dd4bf', bg: 'rgba(45,212,191,0.12)' },
  question:     { label: 'Frage',         color: '#fb923c', bg: 'rgba(251,146,60,0.12)' },
  urgency:      { label: 'Dringlichkeit', color: '#ef4444', bg: 'rgba(239,68,68,0.12)'  },
  none:         { label: 'Follow-up',     color: '#94a3b8', bg: 'rgba(148,163,184,0.12)'},
}

function parseCategory(payload?: string): Category {
  try {
    if (!payload) return 'task'
    const cat = (JSON.parse(payload) as { category?: string }).category as Category
    return CAT_ORDER.includes(cat) ? cat : 'task'
  } catch {
    return 'task'
  }
}

function isTodayOrBefore(iso: string): boolean {
  const d = new Date(iso)
  d.setHours(23, 59, 59, 999)
  return d <= new Date()
}

function dueChip(iso: string): { text: string; color: string } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dc = new Date(iso)
  dc.setHours(0, 0, 0, 0)
  const diff = Math.floor((dc.getTime() - today.getTime()) / 86400000)
  if (diff < 0)   return { text: 'JETZT',  color: '#ef4444' }
  if (diff === 0) return { text: 'heute',  color: '#eab308' }
  if (diff === 1) return { text: 'morgen', color: 'var(--fg-dim)' }
  return { text: new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }), color: 'var(--fg-dim)' }
}

function dateOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function FollowupRow({
  fu, customer, onDone, onDelete, onAction,
}: {
  fu: Activity
  customer?: Customer
  onDone: (id: string) => void
  onDelete: (id: string) => void
  onAction: (fu: Activity, customer: Customer | undefined, cat: Category) => void
}) {
  const cat = parseCategory(fu.payload)
  const def = CATS[cat]
  const due = fu.dueAt ? dueChip(fu.dueAt) : null
  const { Icon } = def

  return (
    <div
      className="fu-row"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
        background: 'transparent', border: 'none',
        position: 'relative', transition: 'background 120ms',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        background: def.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={13} style={{ color: def.color }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>
            {customer?.name ?? <span style={{ color: 'var(--fg-dim)' }}>Ohne Kunde</span>}
          </span>
          {customer?.company && (
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>· {customer.company}</span>
          )}
        </div>
        {fu.title && (
          <div style={{
            fontSize: 11, color: 'var(--fg-muted)', marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {fu.title}
          </div>
        )}
      </div>

      {due && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
          <Clock size={10} style={{ color: due.color }} />
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600, color: due.color }}>
            {due.text}
          </span>
        </div>
      )}

      <button
        onClick={() => onAction(fu, customer, cat)}
        style={{
          padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
          background: def.bg, color: def.color, border: `1px solid ${def.color}33`,
          cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = def.color + '22')}
        onMouseLeave={e => (e.currentTarget.style.background = def.bg)}
      >
        {def.action}
      </button>

      <div className="fu-actions" style={{ display: 'flex', gap: 4, flexShrink: 0, opacity: 0, transition: 'opacity 150ms' }}>
        <button
          onClick={() => onDone(fu.id)}
          title="Erledigt"
          style={{
            width: 22, height: 22, borderRadius: 6, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'rgba(74,222,128,0.1)', color: '#4ade80',
            cursor: 'pointer', border: 'none',
          }}
        >
          <Check size={10} strokeWidth={3} />
        </button>
        <button
          onClick={() => onDelete(fu.id)}
          title="Löschen"
          style={{
            width: 22, height: 22, borderRadius: 6, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'rgba(239,68,68,0.08)', color: '#ef4444',
            cursor: 'pointer', border: 'none',
          }}
        >
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  )
}

interface CreateFormProps {
  customers: Customer[]
  onCreate: (params: { category: Category; customerId?: string; title: string; dueAt?: string }) => Promise<void>
  onCancel: () => void
}

function CreateForm({ customers, onCreate, onCancel }: CreateFormProps) {
  const [category, setCategory] = useState<Category>('task')
  const [search, setSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [showDrop, setShowDrop] = useState(false)
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [saving, setSaving] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  const shortcuts = useMemo(() => [
    { label: 'heute',  value: dateOffset(0) },
    { label: 'morgen', value: dateOffset(1) },
    { label: '+3d',    value: dateOffset(3) },
    { label: '+7d',    value: dateOffset(7) },
  ], [])

  const filteredCustomers = useMemo(() =>
    search
      ? customers.filter(c =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          (c.company ?? '').toLowerCase().includes(search.toLowerCase())
        ).slice(0, 7)
      : customers.slice(0, 7),
    [customers, search],
  )

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setShowDrop(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleCreate = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await onCreate({
        category,
        customerId: selectedCustomer?.id,
        title: title.trim(),
        dueAt: dueAt || undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {CAT_ORDER.map(c => {
          const def = CATS[c]
          const active = category === c
          return (
            <button
              key={c}
              onClick={() => setCategory(c)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 11px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                background: active ? def.bg : 'rgba(255,255,255,0.04)',
                color: active ? def.color : 'var(--fg-dim)',
                border: active ? `1px solid ${def.color}33` : '1px solid rgba(255,255,255,0.06)',
                cursor: 'pointer', transition: 'all 120ms',
              }}
            >
              <def.Icon size={11} />
              {def.label}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div ref={dropRef} style={{ position: 'relative', width: 200, flexShrink: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px',
            background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)',
            minHeight: 34,
          }}>
            <Search size={12} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />
            {selectedCustomer ? (
              <>
                <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--fg)' }}>
                  {selectedCustomer.name}
                </span>
                <button
                  onClick={() => { setSelectedCustomer(null); setSearch('') }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', display: 'flex', padding: 0, flexShrink: 0 }}
                >
                  <X size={11} />
                </button>
              </>
            ) : (
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setShowDrop(true) }}
                onFocus={() => setShowDrop(true)}
                placeholder="Kunde suchen…"
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 12, color: 'var(--fg)', minWidth: 0 }}
              />
            )}
          </div>
          {showDrop && !selectedCustomer && filteredCustomers.length > 0 && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 99,
              background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
              overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}>
              {filteredCustomers.map(c => (
                <div
                  key={c.id}
                  onClick={() => { setSelectedCustomer(c); setSearch(''); setShowDrop(false) }}
                  style={{
                    padding: '7px 10px', fontSize: 12, cursor: 'pointer',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <span style={{ fontWeight: 600 }}>{c.name}</span>
                  {c.company && <span style={{ color: 'var(--fg-dim)', marginLeft: 5 }}>· {c.company}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <input
          autoFocus
          className="mock-input"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
          placeholder="Was muss erledigt werden?"
          style={{ flex: 1 }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {shortcuts.map(s => (
          <button
            key={s.label}
            onClick={() => setDueAt(dueAt === s.value ? '' : s.value)}
            style={{
              padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 500,
              background: dueAt === s.value ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
              color: dueAt === s.value ? 'var(--fg)' : 'var(--fg-dim)',
              border: '1px solid transparent', cursor: 'pointer',
            }}
          >
            {s.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={onCancel} className="btn-ghost" style={{ fontSize: 11, padding: '5px 12px' }}>
          Abbrechen
        </button>
        <button
          onClick={handleCreate}
          disabled={saving || !title.trim()}
          className="btn-primary"
          style={{ fontSize: 11, padding: '5px 14px' }}
        >
          {saving ? '…' : 'Erstellen'}
        </button>
      </div>
    </div>
  )
}

interface ComposeTarget {
  fu: Activity
  customer?: Customer
  cat: 'email' | 'reply' | 'whatsapp' | 'call'
}

function MailComposeModal({ target, onClose }: { target: ComposeTarget; onClose: () => void }) {
  const { fu, customer } = target
  const [to, setTo] = useState(customer?.email ?? '')
  const [subject, setSubject] = useState(
    fu.title ? `Re: ${fu.title}` : customer?.name ? `Nachricht an ${customer.name}` : '',
  )
  const [body, setBody] = useState('')

  const handleSend = () => {
    const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.open(url, '_blank')
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: 540, maxWidth: '92vw', background: 'var(--bg)',
        border: '1px solid var(--border)', borderRadius: 16,
        boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 7, background: 'rgba(45,212,191,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Mail size={12} style={{ color: '#2dd4bf' }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              {customer?.name ? `E-Mail an ${customer.name}` : 'E-Mail schreiben'}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center',
              justifyContent: 'center', background: 'none', border: 'none',
              color: 'var(--fg-dim)', cursor: 'pointer',
            }}
          >
            <X size={13} />
          </button>
        </div>

        {/* Fields */}
        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, color: 'var(--fg-dim)', width: 52, flexShrink: 0, fontWeight: 600 }}>An</span>
            <input
              value={to}
              onChange={e => setTo(e.target.value)}
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: 'var(--fg)' }}
              placeholder="empfaenger@example.com"
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, color: 'var(--fg-dim)', width: 52, flexShrink: 0, fontWeight: 600 }}>Betreff</span>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: 'var(--fg)' }}
              placeholder="Betreff"
            />
          </div>
          <textarea
            autoFocus
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Nachricht…"
            style={{
              width: '100%', minHeight: 200, resize: 'vertical', padding: '12px 0',
              background: 'none', border: 'none', outline: 'none',
              fontSize: 13, color: 'var(--fg)', lineHeight: 1.65,
              fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 20px', borderTop: '1px solid var(--border)',
          background: 'rgba(255,255,255,0.02)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
            Öffnet deinen Standard-Mailclient
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} className="btn-ghost" style={{ fontSize: 12, padding: '6px 14px' }}>
              Abbrechen
            </button>
            <button
              onClick={handleSend}
              disabled={!to.trim()}
              className="btn-primary"
              style={{ fontSize: 12, padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Mail size={12} />
              Senden
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ModalShell({
  icon: Icon, iconColor, iconBg, title, onClose, footer, children,
}: {
  icon: LucideIcon; iconColor: string; iconBg: string
  title: string; onClose: () => void
  footer: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: 540, maxWidth: '92vw', background: 'var(--bg)',
        border: '1px solid var(--border)', borderRadius: 16,
        boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={12} style={{ color: iconColor }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{title}</span>
          </div>
          <button
            onClick={onClose}
            style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--fg-dim)', cursor: 'pointer' }}
          >
            <X size={13} />
          </button>
        </div>
        {children}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
          {footer}
        </div>
      </div>
    </div>
  )
}

function WhatsAppModal({ target, onClose }: { target: ComposeTarget; onClose: () => void }) {
  const { customer } = target
  const phone = customer?.phone?.replace(/\D/g, '') ?? ''
  const [message, setMessage] = useState('')

  const handleOpen = () => {
    const base = phone ? `https://wa.me/${phone}` : 'https://wa.me'
    const url = message ? `${base}?text=${encodeURIComponent(message)}` : base
    window.open(url, '_blank')
    onClose()
  }

  return (
    <ModalShell
      icon={MessageCircle} iconColor="#4ade80" iconBg="rgba(74,222,128,0.12)"
      title={customer?.name ? `WhatsApp an ${customer.name}` : 'WhatsApp'}
      onClose={onClose}
      footer={
        <>
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
            {phone ? `+${phone}` : 'Keine Nummer hinterlegt'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} className="btn-ghost" style={{ fontSize: 12, padding: '6px 14px' }}>Abbrechen</button>
            <button
              onClick={handleOpen}
              disabled={!phone}
              className="btn-primary"
              style={{ fontSize: 12, padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 6, background: phone ? '#4ade80' : undefined, color: phone ? '#000' : undefined }}
            >
              <MessageCircle size={12} />
              In WhatsApp öffnen
            </button>
          </div>
        </>
      }
    >
      <div style={{ padding: '0 20px' }}>
        <textarea
          autoFocus
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Nachricht vorschreiben (optional)…"
          style={{
            width: '100%', minHeight: 180, resize: 'vertical', padding: '14px 0',
            background: 'none', border: 'none', outline: 'none',
            fontSize: 13, color: 'var(--fg)', lineHeight: 1.65,
            fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
      </div>
    </ModalShell>
  )
}

function CallModal({ target, onClose }: { target: ComposeTarget; onClose: () => void }) {
  const { customer } = target
  const phone = customer?.phone ?? ''

  return (
    <ModalShell
      icon={Phone} iconColor="#fb923c" iconBg="rgba(251,146,60,0.12)"
      title={customer?.name ? `Anrufen: ${customer.name}` : 'Anrufen'}
      onClose={onClose}
      footer={
        <>
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
            {customer?.company ?? ''}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} className="btn-ghost" style={{ fontSize: 12, padding: '6px 14px' }}>Abbrechen</button>
            <a
              href={phone ? `tel:${phone}` : undefined}
              onClick={phone ? onClose : undefined}
              className="btn-primary"
              style={{
                fontSize: 12, padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 6,
                background: '#fb923c', color: '#000', textDecoration: 'none',
                opacity: phone ? 1 : 0.4, pointerEvents: phone ? 'auto' : 'none',
                borderRadius: 8,
              }}
            >
              <Phone size={12} />
              Anrufen
            </a>
          </div>
        </>
      }
    >
      <div style={{ padding: '28px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '0.04em', color: phone ? 'var(--fg)' : 'var(--fg-dim)' }}>
          {phone || '—'}
        </div>
        {!phone && (
          <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 8 }}>
            Keine Telefonnummer im Kundenprofil hinterlegt
          </div>
        )}
      </div>
    </ModalShell>
  )
}

function AutoFollowUpRow({
  item,
  leadName,
  companyName,
  onEdit,
  onSkip,
}: {
  item: FollowUpQueueItem
  leadName: string
  companyName: string | null
  onEdit: (item: FollowUpQueueItem) => void
  onSkip: (id: string) => void
}) {
  const tpl = TEMPLATE_LABELS[item.templateKey] ?? TEMPLATE_LABELS.none
  const seqLabel = `Follow-up ${item.sequenceIndex + 1}/${FOLLOW_UP_SEQUENCE_LENGTH}`
  const bodyPreview = item.draftBody ? item.draftBody.slice(0, 80) + (item.draftBody.length > 80 ? '…' : '') : ''

  return (
    <div
      className="fu-row"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
        background: 'transparent', border: 'none',
        position: 'relative', transition: 'background 120ms',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Template icon */}
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        background: tpl.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Mail size={13} style={{ color: tpl.color }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>{leadName}</span>
          {companyName && (
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>· {companyName}</span>
          )}
          {/* Sequence badge */}
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99,
            background: 'rgba(255,255,255,0.06)', color: 'var(--fg-dim)',
            fontFamily: 'var(--font-mono)',
          }}>
            {seqLabel}
          </span>
          {/* Template chip */}
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 99,
            background: tpl.bg, color: tpl.color,
          }}>
            {tpl.label}
          </span>
        </div>
        {bodyPreview && (
          <div style={{
            fontSize: 11, color: 'var(--fg-muted)', marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {bodyPreview}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          onClick={() => onSkip(item.id)}
          title="Überspringen"
          style={{
            width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'rgba(148,163,184,0.08)',
            color: 'var(--fg-dim)', cursor: 'pointer', border: 'none',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(148,163,184,0.16)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(148,163,184,0.08)')}
        >
          <SkipForward size={12} />
        </button>
        <button
          onClick={() => onEdit(item)}
          style={{
            padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            background: 'rgba(45,212,191,0.10)', color: '#2dd4bf',
            border: '1px solid rgba(45,212,191,0.2)',
            cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 5,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(45,212,191,0.18)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(45,212,191,0.10)')}
        >
          <Edit3 size={10} />
          Bearbeiten &amp; Senden
        </button>
      </div>
    </div>
  )
}

function DraftEditorModal({
  item,
  leadName,
  onClose,
}: {
  item: FollowUpQueueItem
  leadName: string
  onClose: () => void
}) {
  const updateDraft = useFollowUpQueueStore(s => s.updateDraft)
  const markSent    = useFollowUpQueueStore(s => s.markSent)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const user        = useAuthStore(s => s.user)

  const [subject, setSubject] = useState(item.draftSubject ?? '')
  const [body,    setBody]    = useState(item.draftBody ?? '')
  const [saving,  setSaving]  = useState(false)

  const handleSend = async () => {
    setSaving(true)
    try {
      // Save latest draft edits first
      await updateDraft(item.id, subject || null, body || null)
      // Create email_out activity directly via service to get the returned Activity
      const activity = await ActivitiesService.create({
        workspaceId,
        createdBy: user?.email ?? 'user',
        accountId: item.leadId,
        type: 'email_out',
        direction: 'out' as const,
        title: subject || `Follow-up an ${leadName}`,
        payload: body || undefined,
        status: 'done',
      })
      // Mark queue item as sent
      await markSent(item.id, activity.id)
      onClose()
    } catch {
      // keep modal open on error
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: 560, maxWidth: '92vw', background: 'var(--bg)',
        border: '1px solid var(--border)', borderRadius: 16,
        boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 7,
              background: 'rgba(45,212,191,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Edit3 size={12} style={{ color: '#2dd4bf' }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              Follow-up bearbeiten — {leadName}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center',
              justifyContent: 'center', background: 'none', border: 'none',
              color: 'var(--fg-dim)', cursor: 'pointer',
            }}
          >
            <X size={13} />
          </button>
        </div>

        {/* Fields */}
        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 0', borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 11, color: 'var(--fg-dim)', width: 52, flexShrink: 0, fontWeight: 600 }}>Betreff</span>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: 'var(--fg)' }}
              placeholder="Betreff…"
            />
          </div>
          <textarea
            autoFocus
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Nachricht…"
            style={{
              width: '100%', minHeight: 220, resize: 'vertical', padding: '12px 0',
              background: 'none', border: 'none', outline: 'none',
              fontSize: 13, color: 'var(--fg)', lineHeight: 1.65,
              fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8,
          padding: '12px 20px', borderTop: '1px solid var(--border)',
          background: 'rgba(255,255,255,0.02)',
        }}>
          <button onClick={onClose} className="btn-ghost" style={{ fontSize: 12, padding: '6px 14px' }}>
            Abbrechen
          </button>
          <button
            onClick={handleSend}
            disabled={saving}
            className="btn-primary"
            style={{ fontSize: 12, padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Send size={12} />
            {saving ? 'Senden…' : 'Als gesendet markieren'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function FollowupsDashboardRoute() {
  const followups         = useActivitiesStore(s => s.followups)
  const loadOpenFollowups = useActivitiesStore(s => s.loadOpenFollowups)
  const create            = useActivitiesStore(s => s.create)
  const update            = useActivitiesStore(s => s.update)
  const remove            = useActivitiesStore(s => s.remove)
  const customers = useCustomersStore(s => s.customers)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const user = useAuthStore(s => s.user)
  const setSelectedCustomer = useUiStore(s => s.setSelectedCustomer)
  const setAppView = useUiStore(s => s.setAppView)

  const loadDue     = useFollowUpQueueStore(s => s.loadDue)
  const markSkipped = useFollowUpQueueStore(s => s.markSkipped)
  const leads       = useLeadsStore(s => s.leads)

  const [showCreate, setShowCreate] = useState(false)
  const [composeTarget, setComposeTarget] = useState<ComposeTarget | null>(null)
  const [draftItem, setDraftItem] = useState<FollowUpQueueItem | null>(null)

  useEffect(() => {
    if (workspaceId) {
      loadOpenFollowups(workspaceId)
      loadDue(workspaceId)
    }
  }, [workspaceId])

  const openFollowups = useMemo(() => followups.filter(f => f.status === 'open'), [followups])

  const todayItems = useMemo(() =>
    openFollowups
      .filter(f => f.dueAt ? isTodayOrBefore(f.dueAt) : false)
      .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? '')),
    [openFollowups],
  )

  const nextItems = useMemo(() =>
    openFollowups
      .filter(f => !f.dueAt || !isTodayOrBefore(f.dueAt))
      .sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999')),
    [openFollowups],
  )

  const customerMap = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers])
  const leadMap = useMemo(() => new Map(leads.map(l => [l.id, l])), [leads])
  const dueQueueItems = useFollowUpQueueStore(s => s.dueToday())

  const handleCreate = async (params: { category: Category; customerId?: string; title: string; dueAt?: string }) => {
    await create({
      workspaceId,
      createdBy: user?.email ?? 'user',
      accountId: params.customerId ?? workspaceId,
      customerId: params.customerId,
      type: 'followup',
      title: params.title,
      dueAt: params.dueAt,
      status: 'open',
      payload: JSON.stringify({ category: params.category }),
    })
    setShowCreate(false)
  }

  const handleDone = (id: string) => { update(id, { status: 'done' }) }

  const handleSkip = async (id: string) => {
    try {
      await markSkipped(id)
    } catch {
      // silently ignore — store already sets error state
    }
  }

  const handleAction = (fu: Activity, customer: Customer | undefined, cat: Category) => {
    switch (cat) {
      case 'reply':
      case 'email':
        setComposeTarget({ fu, customer, cat })
        break
      case 'call':
        setComposeTarget({ fu, customer, cat })
        break
      case 'whatsapp':
        setComposeTarget({ fu, customer, cat })
        break
      case 'task':
        handleDone(fu.id)
        break
    }
  }

  return (
    <div className="main-inner">
      {/* Header */}
      <div className="greeting">
        <div>
          <h1 className="greeting-title">Follow-Ups<em>.</em></h1>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
          <div className="greeting-sub">
            <span><strong>{openFollowups.length + dueQueueItems.length}</strong> OFFEN</span>
            {todayItems.length > 0 && (
              <span><strong style={{ color: 'var(--warn)' }}>{todayItems.length}</strong> HEUTE FÄLLIG</span>
            )}
          </div>
          <button
            onClick={() => setShowCreate(v => !v)}
            className="btn-primary"
            style={{ fontSize: 12, padding: '7px 16px' }}
          >
            <Plus size={12} />
            Follow-up erstellen
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="card" style={{ padding: 20, marginBottom: 28 }}>
          <CreateForm
            customers={customers}
            onCreate={handleCreate}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      )}

      {/* AUTOMATISCHE FOLLOW-UPS */}
      {dueQueueItems.length > 0 && (
        <>
          <div className="section-head">
            <h2>Automatische Follow-ups <span className="count">{String(dueQueueItems.length).padStart(2, '0')}</span></h2>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {dueQueueItems.map((item, i) => {
              const lead = leadMap.get(item.leadId)
              return (
                <div key={item.id} style={{ borderBottom: i < dueQueueItems.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <AutoFollowUpRow
                    item={item}
                    leadName={lead?.name ?? 'Unbekannt'}
                    companyName={lead?.companyName ?? null}
                    onEdit={setDraftItem}
                    onSkip={handleSkip}
                  />
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* HEUTE FÄLLIG */}
      <div className="section-head">
        <h2>Heute fällig <span className="count">{String(todayItems.length).padStart(2, '0')}</span></h2>
      </div>

      {todayItems.length === 0 && !showCreate ? (
        <div
          className="card"
          onClick={() => setShowCreate(true)}
          style={{ padding: '32px 24px', textAlign: 'center', cursor: 'pointer', color: 'var(--fg-dim)', fontSize: 12, border: '1.5px dashed var(--border)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface)')}
        >
          Keine fälligen Follow-ups — alles im grünen Bereich.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {todayItems.map((fu, i) => (
            <div key={fu.id} style={{ borderBottom: i < todayItems.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <FollowupRow
                fu={fu}
                customer={customerMap.get(fu.customerId ?? '')}
                onDone={handleDone}
                onDelete={remove}
                onAction={handleAction}
              />
            </div>
          ))}
        </div>
      )}

      {/* ALS NÄCHSTES */}
      {nextItems.length > 0 && (
        <>
          <div className="section-head">
            <h2>Als Nächstes <span className="count">{String(nextItems.length).padStart(2, '0')}</span></h2>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {nextItems.map((fu, i) => (
              <div key={fu.id} style={{ borderBottom: i < nextItems.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <FollowupRow
                  fu={fu}
                  customer={customerMap.get(fu.customerId ?? '')}
                  onDone={handleDone}
                  onDelete={remove}
                  onAction={handleAction}
                />
              </div>
            ))}
          </div>
        </>
      )}

      <p className="card-label" style={{ marginTop: 32, display: 'block' }}>
        Neue Mails werden automatisch als Antworten in 24h Follow-Up angelegt.
      </p>

      <style>{`.fu-row:hover .fu-actions { opacity: 1 !important; }`}</style>

      {composeTarget && (composeTarget.cat === 'email' || composeTarget.cat === 'reply') && (
        <MailComposeModal target={composeTarget} onClose={() => setComposeTarget(null)} />
      )}
      {composeTarget && composeTarget.cat === 'whatsapp' && (
        <WhatsAppModal target={composeTarget} onClose={() => setComposeTarget(null)} />
      )}
      {composeTarget && composeTarget.cat === 'call' && (
        <CallModal target={composeTarget} onClose={() => setComposeTarget(null)} />
      )}
      {draftItem && (
        <DraftEditorModal
          item={draftItem}
          leadName={leadMap.get(draftItem.leadId)?.name ?? 'Unbekannt'}
          onClose={() => setDraftItem(null)}
        />
      )}
    </div>
  )
}
