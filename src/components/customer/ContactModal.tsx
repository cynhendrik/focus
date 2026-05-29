import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Trash2, X, Star, Link as LinkIcon, Mail, Phone, MessageCircle, Users, Cake, Zap,
} from 'lucide-react'
import { useContactsStore } from '@/store/contacts.store'
import type { Contact, DecisionPower, PreferredChannel } from '@/types/contact.types'

interface Props {
  accountId: string
  contact: Contact | null   // null = create mode
  onClose: () => void
}

interface FormState {
  firstName:        string
  lastName:         string
  email:            string
  phone:            string
  role:             string
  isPrimary:        boolean
  linkedinUrl:      string
  decisionPower:    DecisionPower | null
  preferredChannel: PreferredChannel | null
  notes:            string
  birthday:         string
}

const EMPTY: FormState = {
  firstName: '', lastName: '', email: '', phone: '', role: '',
  isPrimary: false,
  linkedinUrl: '', decisionPower: null, preferredChannel: null,
  notes: '', birthday: '',
}

const POWER_OPTIONS: { id: DecisionPower; label: string }[] = [
  { id: 'low',    label: 'Niedrig' },
  { id: 'medium', label: 'Mittel'  },
  { id: 'high',   label: 'Hoch'    },
]

const CHANNEL_OPTIONS: { id: PreferredChannel; label: string; Icon: typeof Mail }[] = [
  { id: 'email',     label: 'Mail',       Icon: Mail           },
  { id: 'phone',     label: 'Anruf',      Icon: Phone          },
  { id: 'whatsapp',  label: 'WhatsApp',   Icon: MessageCircle  },
  { id: 'in_person', label: 'Persönlich', Icon: Users          },
]

export function ContactModal({ accountId, contact, onClose }: Props) {
  const upsert = useContactsStore(s => s.upsert)
  const remove = useContactsStore(s => s.remove)

  const [form, setForm]             = useState<FormState>(EMPTY)
  const [saving, setSaving]         = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  useEffect(() => {
    if (contact) {
      setForm({
        firstName:        contact.firstName,
        lastName:         contact.lastName        ?? '',
        email:            contact.email           ?? '',
        phone:            contact.phone           ?? '',
        role:             contact.role            ?? '',
        isPrimary:        contact.isPrimary,
        linkedinUrl:      contact.linkedinUrl     ?? '',
        decisionPower:    contact.decisionPower   ?? null,
        preferredChannel: contact.preferredChannel?? null,
        notes:            contact.notes           ?? '',
        birthday:         contact.birthday        ?? '',
      })
    } else {
      setForm(EMPTY)
    }
  }, [contact])

  const initials = (form.firstName.charAt(0) + form.lastName.charAt(0)).toUpperCase() || '?'

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.firstName.trim()) return
    setSaving(true); setError(null)
    try {
      await upsert({
        id:               contact?.id,
        accountId,
        firstName:        form.firstName.trim(),
        lastName:         form.lastName.trim()        || undefined,
        email:            form.email.trim()           || undefined,
        phone:            form.phone.trim()           || undefined,
        role:             form.role.trim()            || undefined,
        isPrimary:        form.isPrimary,
        linkedinUrl:      form.linkedinUrl.trim()     || undefined,
        decisionPower:    form.decisionPower         ?? undefined,
        preferredChannel: form.preferredChannel      ?? undefined,
        notes:            form.notes.trim()           || undefined,
        birthday:         form.birthday              || undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!contact) return
    setSaving(true)
    try {
      await remove(contact.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit   ={{ opacity: 0 }}
        transition={{ duration: 0.14 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'oklch(0% 0 0 / 0.55)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1,    y: 0 }}
          exit   ={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.18, ease: [0.2, 0.7, 0.1, 1] }}
          onClick={e => e.stopPropagation()}
          style={{
            width: 520, maxWidth: '94vw', maxHeight: '92vh',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 18,
            overflow: 'hidden',
            boxShadow: 'var(--shadow-2)',
            display: 'flex', flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '20px 22px 18px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'var(--accent-soft)', color: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 600, letterSpacing: '-0.02em',
              flexShrink: 0,
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 600, letterSpacing: '-0.02em' }}>
                {contact ? 'Kontakt bearbeiten' : 'Neuer Kontakt'}
              </h2>
              <p style={{ margin: '3px 0 0', fontSize: 11.5, color: 'var(--fg-dim)',
                fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
                {contact ? `seit ${new Date(contact.createdAt).toLocaleDateString('de-DE')}` : 'Eine Person zum Account'}
              </p>
            </div>
            <button onClick={onClose} className="icon-btn" style={{ width: 32, height: 32 }}>
              <X size={14} />
            </button>
          </div>

          {/* Body — scrollable */}
          <div style={{
            padding: '18px 22px 8px',
            display: 'flex', flexDirection: 'column', gap: 18,
            overflowY: 'auto',
            flex: 1,
          }}>
            {/* Section: Person */}
            <Section label="Person">
              <Row>
                <Field
                  label="Vorname"
                  value={form.firstName}
                  onChange={v => set('firstName', v)}
                  autoFocus required
                />
                <Field
                  label="Nachname"
                  value={form.lastName}
                  onChange={v => set('lastName', v)}
                />
              </Row>

              <Field
                label="Rolle"
                placeholder="z.B. CEO, Champion, Tech Buyer, Procurement"
                value={form.role}
                onChange={v => set('role', v)}
              />

              <Row>
                <Field
                  label="E-Mail"
                  type="email"
                  value={form.email}
                  onChange={v => set('email', v)}
                />
                <Field
                  label="Telefon"
                  value={form.phone}
                  onChange={v => set('phone', v)}
                />
              </Row>

              <Field
                label="LinkedIn"
                icon={<LinkIcon size={11} />}
                placeholder="https://linkedin.com/in/..."
                value={form.linkedinUrl}
                onChange={v => set('linkedinUrl', v)}
              />
            </Section>

            {/* Section: Verkaufsprofil */}
            <Section label="Verkaufsprofil">
              <PillGroup
                label="Entscheidungsmacht"
                icon={<Zap size={10} strokeWidth={2.4} />}
                options={POWER_OPTIONS}
                value={form.decisionPower}
                onChange={v => set('decisionPower', v)}
              />

              <PillGroup
                label="Bevorzugter Kanal"
                icon={<Phone size={10} strokeWidth={2.4} />}
                options={CHANNEL_OPTIONS}
                value={form.preferredChannel}
                onChange={v => set('preferredChannel', v)}
                renderIcon
              />

              <Field
                label="Geburtstag"
                icon={<Cake size={11} />}
                type="date"
                value={form.birthday}
                onChange={v => set('birthday', v)}
              />
            </Section>

            {/* Section: Notiz */}
            <Section label="Notiz">
              <TextareaField
                placeholder="Was du dir merken willst — Vorlieben, persönliches, gemeinsame Themen, …"
                value={form.notes}
                onChange={v => set('notes', v)}
              />
            </Section>

            {/* Primary toggle */}
            <button
              onClick={() => set('isPrimary', !form.isPrimary)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 10,
                background: form.isPrimary ? 'var(--accent-soft)' : 'var(--surface-2)',
                border: form.isPrimary ? '1px solid var(--accent)' : '1px solid var(--border)',
                color: form.isPrimary ? 'var(--accent)' : 'var(--fg-muted)',
                cursor: 'pointer',
                fontSize: 12.5, fontWeight: 500,
                letterSpacing: '-0.005em',
                transition: 'all 180ms ease',
              }}
            >
              <Star
                size={13}
                strokeWidth={2.2}
                fill={form.isPrimary ? 'var(--accent)' : 'transparent'}
              />
              {form.isPrimary
                ? 'Hauptkontakt — als Standard nutzen'
                : 'Als Hauptkontakt markieren'}
            </button>

            {error && (
              <p style={{
                fontSize: 12, color: 'var(--danger)',
                background: 'oklch(72% 0.18 25 / 0.12)',
                padding: '8px 12px', borderRadius: 8, margin: 0,
              }}>
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '14px 22px', borderTop: '1px solid var(--border)',
            background: 'oklch(100% 0 0 / 0.015)',
            flexShrink: 0,
          }}>
            {contact && !confirmDel && (
              <button
                onClick={() => setConfirmDel(true)}
                style={{
                  padding: '7px 12px', borderRadius: 8,
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  color: 'var(--fg-dim)', fontSize: 12,
                  background: 'transparent',
                  transition: 'color 180ms ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-dim)' }}
              >
                <Trash2 size={11} /> Entfernen
              </button>
            )}
            {contact && confirmDel && (
              <button
                onClick={handleDelete}
                disabled={saving}
                style={{
                  padding: '7px 12px', borderRadius: 8,
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  background: 'var(--danger)', color: '#fff',
                  fontSize: 12, fontWeight: 600,
                }}
              >
                <Trash2 size={11} /> Wirklich entfernen?
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button onClick={onClose} className="btn-ghost" style={{ fontSize: 12 }}>
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.firstName.trim()}
              className="btn-primary"
              style={{
                fontSize: 12,
                opacity: form.firstName.trim() ? 1 : 0.4,
              }}
            >
              {saving ? '…' : (contact ? 'Speichern' : 'Anlegen')}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section header
// ─────────────────────────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9.5,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--fg-dim)', fontWeight: 600,
        }}>
          {label}
        </span>
        <div style={{
          flex: 1, height: 1,
          background: 'linear-gradient(90deg, var(--border) 0%, transparent 100%)',
        }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>
}

// ─────────────────────────────────────────────────────────────────────────────
// Field primitives
// ─────────────────────────────────────────────────────────────────────────────

interface FieldProps {
  label?: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  autoFocus?: boolean
  required?: boolean
  icon?: React.ReactNode
}

function Field({ label, value, onChange, type, placeholder, autoFocus, required, icon }: FieldProps) {
  const [focused, setFocused] = useState(false)
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      {label && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontFamily: 'var(--font-mono)', fontSize: 10,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: focused ? 'var(--accent)' : 'var(--fg-dim)',
          fontWeight: 500,
          transition: 'color 180ms ease',
        }}>
          {icon && <span style={{ display: 'flex' }}>{icon}</span>}
          {label}{required && <span style={{ color: 'var(--accent)', marginLeft: 2 }}>·</span>}
        </span>
      )}
      <input
        type={type ?? 'text'}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '8px 11px',
          borderRadius: 9,
          background: 'var(--surface-2)',
          border: `1px solid ${focused ? 'var(--accent)' : 'var(--border)'}`,
          color: 'var(--fg)',
          fontSize: 13,
          letterSpacing: '-0.005em',
          transition: 'border-color 180ms ease',
          fontFamily: type === 'date' ? 'var(--font-mono)' : 'inherit',
        }}
      />
    </label>
  )
}

function TextareaField({
  value, onChange, placeholder,
}: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 64)}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      placeholder={placeholder}
      rows={3}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%',
        padding: '9px 11px',
        borderRadius: 9,
        background: 'var(--surface-2)',
        border: `1px solid ${focused ? 'var(--accent)' : 'var(--border)'}`,
        color: 'var(--fg)',
        fontSize: 13,
        lineHeight: 1.55,
        letterSpacing: '-0.005em',
        transition: 'border-color 180ms ease',
        resize: 'none',
        fontFamily: 'inherit',
        overflow: 'hidden',
      }}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Pill-group (single-select, deselectable)
// ─────────────────────────────────────────────────────────────────────────────

interface PillOption<T> {
  id: T
  label: string
  Icon?: typeof Mail
}

interface PillGroupProps<T extends string> {
  label: string
  icon?: React.ReactNode
  options: PillOption<T>[]
  value: T | null
  onChange: (v: T | null) => void
  renderIcon?: boolean
}

function PillGroup<T extends string>({
  label, icon, options, value, onChange, renderIcon,
}: PillGroupProps<T>) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontFamily: 'var(--font-mono)', fontSize: 10,
        letterSpacing: '0.12em', textTransform: 'uppercase',
        color: 'var(--fg-dim)', fontWeight: 500,
      }}>
        {icon && <span style={{ display: 'flex' }}>{icon}</span>}
        {label}
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {options.map(opt => {
          const active = value === opt.id
          const Icon = opt.Icon
          return (
            <button
              key={opt.id}
              onClick={() => onChange(active ? null : opt.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 11px', borderRadius: 999,
                background: active ? 'var(--accent-soft)' : 'var(--surface-2)',
                border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                color: active ? 'var(--accent)' : 'var(--fg-muted)',
                fontSize: 11.5, fontWeight: 500,
                letterSpacing: '-0.005em',
                cursor: 'pointer',
                transition: 'all 180ms ease',
              }}
            >
              {renderIcon && Icon && <Icon size={10} strokeWidth={2.4} />}
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
