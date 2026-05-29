import { useMemo, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { useContactsStore } from '@/store/contacts.store'
import type { Contact } from '@/types/contact.types'
import { ContactModal } from './ContactModal'
import { contactColor, initialsOf, fullNameOf } from './ContactCard'

// ─────────────────────────────────────────────────────────────────────────────
// PrimaryContact — the "Ansprechpartner"-Zeile im Header.
// Zeigt den primary contact (or affordance to add) zwischen H1 und PulseBar.
// Sichtbar auf jedem Tab — der Account ist die Firma, das hier ist der Mensch.
// ─────────────────────────────────────────────────────────────────────────────

interface Props { customerId: string }

export function PrimaryContact({ customerId }: Props) {
  const contacts = useContactsStore(s => s.contacts)
  const primary = useMemo(
    () => contacts.find(c => c.accountId === customerId && c.isPrimary) ?? null,
    [contacts, customerId],
  )

  const [modalContact, setModalContact] = useState<Contact | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const handleOpen = () => {
    setModalContact(primary)
    setModalOpen(true)
  }

  return (
    <>
      <div style={{ marginTop: 8, marginBottom: 2 }}>
        {primary ? (
          <PrimaryChip contact={primary} onClick={handleOpen} />
        ) : (
          <AddAffordance onClick={handleOpen} />
        )}
      </div>

      {modalOpen && (
        <ContactModal
          accountId={customerId}
          contact={modalContact}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}

// ─── Primary contact chip ──────────────────────────────────────────────────

function PrimaryChip({ contact, onClick }: { contact: Contact; onClick: () => void }) {
  const color = contactColor(fullNameOf(contact))
  const initials = initialsOf(contact)
  const [hover, setHover] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '3px 14px 3px 3px',
        borderRadius: 999,
        background: hover ? 'var(--surface-2)' : 'var(--surface)',
        border: '1px solid var(--border)',
        cursor: 'pointer',
        transition: 'background 180ms ease, border-color 180ms ease',
        maxWidth: '100%',
      }}
      onMouseDown={e => { e.currentTarget.style.borderColor = 'var(--border-strong)' }}
      onMouseUp={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      {/* Avatar */}
      <span style={{
        width: 24, height: 24, borderRadius: '50%',
        background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`,
        color: 'oklch(15% 0 0)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10.5, fontWeight: 700, letterSpacing: '-0.02em',
        flexShrink: 0,
        boxShadow: `0 2px 8px -3px ${color}80`,
      }}>
        {initials}
      </span>

      {/* "mit" label — establishes the account ↔ person relationship */}
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10,
        letterSpacing: '0.14em', textTransform: 'uppercase',
        color: 'var(--fg-dim)', fontWeight: 500,
        flexShrink: 0,
      }}>
        mit
      </span>

      {/* Name + role */}
      <span style={{
        display: 'inline-flex', alignItems: 'baseline', gap: 6,
        minWidth: 0, overflow: 'hidden',
      }}>
        <span style={{
          fontSize: 13, color: 'var(--fg)',
          fontWeight: 600, letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
        }}>
          {fullNameOf(contact)}
        </span>
        {contact.role && (
          <span style={{
            fontSize: 11.5, color: 'var(--fg-muted)',
            letterSpacing: '-0.005em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            · {contact.role}
          </span>
        )}
      </span>
    </button>
  )
}

// ─── Add affordance (when no primary set) ──────────────────────────────────

function AddAffordance({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 12px 4px 9px',
        borderRadius: 999,
        background: 'transparent',
        border: '1px dashed var(--border-strong)',
        color: hover ? 'var(--accent)' : 'var(--fg-dim)',
        fontSize: 12, fontWeight: 500,
        letterSpacing: '-0.005em',
        cursor: 'pointer',
        transition: 'border-color 180ms ease, color 180ms ease',
        borderColor: hover ? 'var(--accent)' : 'var(--border-strong)',
      }}
    >
      <UserPlus size={11} strokeWidth={2.4} />
      Ansprechpartner hinzufügen
    </button>
  )
}
