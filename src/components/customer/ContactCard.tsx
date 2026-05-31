import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Pencil, Link as LinkIcon, Mail, Phone, MessageCircle, Users, Cake, Zap, Star,
  Quote,
} from 'lucide-react'
import { useContactsStore } from '@/store/contacts.store'
import type { Contact, DecisionPower, PreferredChannel } from '@/types/contact.types'

// ─────────────────────────────────────────────────────────────────────────────
// ContactCard — inline, stackable card showing one contact's full profile.
// Used inside the Activities-tab left rail. Notes are inline-editable.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  contact: Contact
  onEdit: () => void
  mentionCount?: number
}

const POWER_META: Record<DecisionPower, { label: string; color: string }> = {
  high:   { label: 'Hoch',    color: 'oklch(78% 0.18 60)'  },
  medium: { label: 'Mittel',  color: 'oklch(78% 0.13 200)' },
  low:    { label: 'Niedrig', color: 'var(--fg-dim)'       },
}

const CHANNEL_META: Record<PreferredChannel, { label: string; Icon: typeof Mail; color: string }> = {
  email:     { label: 'Mail',       Icon: Mail,          color: 'oklch(78% 0.13 210)' },
  phone:     { label: 'Anruf',      Icon: Phone,         color: 'oklch(78% 0.16 65)'  },
  whatsapp:  { label: 'WhatsApp',   Icon: MessageCircle, color: 'oklch(75% 0.17 150)' },
  in_person: { label: 'Persönlich', Icon: Users,         color: 'oklch(72% 0.18 290)' },
}

function contactColor(name: string): string {
  const palette = [
    'oklch(72% 0.16 200)', 'oklch(75% 0.16 65)', 'oklch(72% 0.18 290)',
    'oklch(72% 0.16 25)',  'oklch(75% 0.17 150)','oklch(72% 0.14 330)',
  ]
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0
  return palette[Math.abs(h) % palette.length]
}

function initialsOf(c: Contact): string {
  return ((c.firstName.charAt(0) + (c.lastName?.charAt(0) ?? '')).toUpperCase() || '?')
}

function fullNameOf(c: Contact): string {
  return c.lastName ? `${c.firstName} ${c.lastName}` : c.firstName
}

function formatBirthday(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'long' })
}

function daysUntilBirthday(iso: string): number | null {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date()
  const tYear = today.getFullYear()
  const next = new Date(tYear, d.getMonth(), d.getDate())
  if (next < new Date(tYear, today.getMonth(), today.getDate())) {
    next.setFullYear(tYear + 1)
  }
  return Math.round((next.getTime() - today.getTime()) / 86_400_000)
}

export function ContactCard({ contact, onEdit, mentionCount = 0 }: Props) {
  const upsert = useContactsStore(s => s.upsert)
  const color = contactColor(fullNameOf(contact))
  const initials = initialsOf(contact)
  // Defensive: wenn das Feld einen Wert hat, der nicht im META-Mapping
  // ist (z.B. Daten-Migration mit altem Enum-Wert), null statt undefined.
  const power = contact.decisionPower ? (POWER_META[contact.decisionPower] ?? null) : null
  const channel = contact.preferredChannel ? (CHANNEL_META[contact.preferredChannel] ?? null) : null
  const bdayDays = contact.birthday ? daysUntilBirthday(contact.birthday) : null

  const [hover, setHover]     = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(contact.notes ?? '')
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setDraft(contact.notes ?? '')
    setEditing(false)
  }, [contact.id, contact.notes])

  useEffect(() => {
    if (!editing) return
    const el = taRef.current
    if (!el) return
    el.focus()
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
    el.setSelectionRange(el.value.length, el.value.length)
  }, [editing])

  useEffect(() => {
    const el = taRef.current
    if (!el || !editing) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft, editing])

  const commitNotes = async () => {
    const next = draft.trim()
    setEditing(false)
    if (next === (contact.notes ?? '').trim()) return
    await upsert({
      id:               contact.id,
      accountId:        contact.accountId,
      firstName:        contact.firstName,
      lastName:         contact.lastName,
      email:            contact.email,
      phone:            contact.phone,
      role:             contact.role,
      isPrimary:        contact.isPrimary,
      avatarUrl:        contact.avatarUrl,
      linkedinUrl:      contact.linkedinUrl,
      decisionPower:    contact.decisionPower,
      preferredChannel: contact.preferredChannel,
      notes:            next || undefined,
      birthday:         contact.birthday,
    })
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit   ={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.18, ease: [0.2, 0.7, 0.1, 1] }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '11px 13px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Top row: avatar + name + edit */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          position: 'relative',
          width: 34, height: 34, borderRadius: 10,
          background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`,
          color: 'oklch(15% 0 0)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, letterSpacing: '-0.02em',
          flexShrink: 0,
          boxShadow: `0 4px 14px -6px ${color}80`,
        }}>
          {initials}
          {contact.isPrimary && (
            <Star
              size={9}
              strokeWidth={2.4}
              fill="var(--accent)"
              style={{
                position: 'absolute', top: -3, right: -3,
                color: 'var(--accent)',
                background: 'var(--bg)',
                borderRadius: 3, padding: 1,
              }}
            />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 13.5, fontWeight: 600, color: 'var(--fg)',
              letterSpacing: '-0.015em', lineHeight: 1.2,
            }}>
              {fullNameOf(contact)}
            </span>
            {contact.role && (
              <span style={{
                fontSize: 11, color: 'var(--fg-muted)',
                letterSpacing: '-0.005em',
              }}>
                · {contact.role}
              </span>
            )}
            {mentionCount > 0 && (
              <span
                title={`In ${mentionCount} Notiz${mentionCount === 1 ? '' : 'en'} erwähnt`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  fontSize: 10.5, color: 'var(--accent)',
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.04em',
                  fontWeight: 600,
                  marginLeft: 2,
                }}>
                <Quote size={9} strokeWidth={2.4} />
                {mentionCount}×
              </span>
            )}
          </div>
        </div>

        <button
          onClick={onEdit}
          aria-label="Bearbeiten"
          style={{
            width: 24, height: 24, borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent',
            color: 'var(--fg-dim)',
            opacity: hover ? 1 : 0,
            transition: 'opacity 180ms ease, color 180ms ease, background 180ms ease',
            flexShrink: 0,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = 'var(--accent)'
            e.currentTarget.style.background = 'oklch(100% 0 0 / 0.06)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'var(--fg-dim)'
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <Pencil size={11} />
        </button>
      </div>

      {/* Profile badges + quick-actions (one row if possible) */}
      {(power || channel || contact.birthday || contact.phone || contact.email || contact.linkedinUrl) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
          {power && (
            <Badge color={power.color} icon={<Zap size={9} strokeWidth={2.4} />}>
              {power.label}
            </Badge>
          )}
          {channel && (
            <Badge color={channel.color} icon={<channel.Icon size={9} strokeWidth={2.4} />}>
              {channel.label}
            </Badge>
          )}
          {contact.birthday && (
            <Badge
              color="oklch(72% 0.14 330)"
              icon={<Cake size={9} strokeWidth={2.4} />}
              hint={bdayDays !== null && bdayDays <= 30 ? `in ${bdayDays}d` : undefined}
            >
              {formatBirthday(contact.birthday)}
            </Badge>
          )}
          {(contact.phone || contact.email || contact.linkedinUrl) && (
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
              {contact.phone && (
                <QuickIcon href={`tel:${contact.phone}`} title={contact.phone}>
                  <Phone size={10} />
                </QuickIcon>
              )}
              {contact.email && (
                <QuickIcon href={`mailto:${contact.email}`} title={contact.email}>
                  <Mail size={10} />
                </QuickIcon>
              )}
              {contact.linkedinUrl && (
                <QuickIcon href={contact.linkedinUrl} title="LinkedIn" external>
                  <LinkIcon size={10} />
                </QuickIcon>
              )}
            </span>
          )}
        </div>
      )}

      {/* Notes — inline editable */}
      {editing ? (
        <textarea
          ref={taRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitNotes}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              e.preventDefault()
              setDraft(contact.notes ?? '')
              setEditing(false)
            } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              taRef.current?.blur()
            }
          }}
          placeholder="Was du dir merken willst — Vorlieben, persönliches…"
          style={{
            width: '100%',
            minHeight: 56,
            padding: '8px 10px',
            borderRadius: 8,
            background: 'var(--surface-2)',
            border: '1px solid var(--accent)',
            boxShadow: '0 0 0 3px var(--accent-soft)',
            color: 'var(--fg)',
            fontSize: 12.5, lineHeight: 1.55,
            letterSpacing: '-0.005em',
            resize: 'none',
            fontFamily: 'inherit',
            overflow: 'hidden',
          }}
        />
      ) : contact.notes ? (
        <button
          onClick={() => setEditing(true)}
          style={{
            display: 'block', width: '100%',
            padding: '8px 10px',
            borderRadius: 8,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            color: 'var(--fg-2)',
            fontSize: 12.5, lineHeight: 1.55,
            letterSpacing: '-0.005em',
            textAlign: 'left',
            cursor: 'text',
            whiteSpace: 'pre-wrap',
            transition: 'border-color 180ms ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
        >
          {contact.notes}
        </button>
      ) : (
        <button
          onClick={() => setEditing(true)}
          style={{
            display: 'block', width: '100%',
            padding: '8px 10px',
            borderRadius: 8,
            background: 'transparent',
            border: '1px dashed var(--border)',
            color: 'var(--fg-dim)',
            fontSize: 12, fontStyle: 'italic',
            textAlign: 'left',
            cursor: 'text',
            transition: 'border-color 180ms ease, color 180ms ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--accent)'
            e.currentTarget.style.color = 'var(--accent)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--fg-dim)'
          }}
        >
          + Notiz zur Person
        </button>
      )}
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Visual primitives
// ─────────────────────────────────────────────────────────────────────────────

function Badge({
  color, icon, hint, children,
}: { color: string; icon: React.ReactNode; hint?: string; children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 7px', borderRadius: 999,
      background: `${color}1f`,
      border: `1px solid ${color}33`,
      color,
      fontSize: 10.5, fontWeight: 500,
      letterSpacing: '-0.005em',
    }}>
      {icon}
      {children}
      {hint && (
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9.5,
          letterSpacing: '0.04em', opacity: 0.75,
          marginLeft: 1,
        }}>
          · {hint}
        </span>
      )}
    </span>
  )
}

function QuickIcon({
  href, title, external, children,
}: { href: string; title: string; external?: boolean; children: React.ReactNode }) {
  return (
    <a
      href={href}
      title={title}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      onClick={e => e.stopPropagation()}
      style={{
        width: 22, height: 22, borderRadius: 6,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'oklch(100% 0 0 / 0.04)',
        color: 'var(--fg-muted)',
        transition: 'color 180ms ease, background 180ms ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color = 'var(--accent)'
        e.currentTarget.style.background = 'var(--accent-soft)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color = 'var(--fg-muted)'
        e.currentTarget.style.background = 'oklch(100% 0 0 / 0.04)'
      }}
    >
      {children}
    </a>
  )
}

// Re-export the helpers so other components can render compact contact previews
// using the same color/initials/name conventions.
export { contactColor, initialsOf, fullNameOf }
