import { useState, useEffect } from 'react'
import { User, Shield, CreditCard, LogOut, Check, MessageSquare, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth.store'
import { useMembersStore } from '@/store/members.store'
import { useToastStore } from '@/store/toast.store'

// ── Section shell ──────────────────────────────────────────────────────────────

function Section({ icon: Icon, title, subtitle, children }: {
  icon: typeof User
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 16, padding: 22,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Icon size={16} style={{ color: 'var(--fg-muted)' }} />
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</h2>
      </div>
      {subtitle && (
        <p style={{ margin: '0 0 16px 26px', fontSize: 12, color: 'var(--fg-dim)' }}>{subtitle}</p>
      )}
      <div style={{ marginTop: subtitle ? 0 : 16 }}>{children}</div>
    </div>
  )
}

function FieldLabel({ children }: { children: string }) {
  return (
    <label style={{
      fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)',
      textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6,
    }}>
      {children}
    </label>
  )
}

// ── Profile section ────────────────────────────────────────────────────────────

function ProfilSection() {
  const user      = useAuthStore(s => s.user)
  const showToast = useToastStore(s => s.show)

  const initialName = (user?.user_metadata?.full_name as string) ?? ''
  const [name, setName]     = useState(initialName)
  const [saving, setSaving] = useState(false)

  const email   = user?.email ?? '—'
  const initial = (name || email).trim().charAt(0).toUpperCase() || 'C'
  const dirty   = name.trim() !== initialName

  async function handleSave() {
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } })
      if (error) throw error
      // Geteiltes Profil (Chat/Mitglieder) sofort mitschreiben — nicht erst beim nächsten Start.
      await useMembersStore.getState().setMyDisplayName(name.trim())
      showToast({ message: 'Profil gespeichert.', variant: 'success' })
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Speichern fehlgeschlagen', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section icon={User} title="Profil">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16, flexShrink: 0,
          background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 800, color: 'var(--accent-text)', fontFamily: 'var(--font-mono)',
        }}>
          {initial}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{name.trim() || 'Cultera User'}</div>
          <div style={{ fontSize: 12, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>{email}</div>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Name</FieldLabel>
        <input
          className="mock-input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Dein Name"
          style={{ fontSize: 14, maxWidth: 360 }}
        />
      </div>
      <div style={{ marginBottom: 18 }}>
        <FieldLabel>E-Mail</FieldLabel>
        <input className="mock-input" value={email} readOnly disabled style={{ fontSize: 14, maxWidth: 360, opacity: 0.7 }} />
      </div>

      <button className="btn-primary" onClick={handleSave} disabled={!dirty || saving} style={{ fontSize: 13, padding: '8px 16px' }}>
        {saving ? 'Speichern…' : 'Speichern'}
      </button>
    </Section>
  )
}

// ── Security section ───────────────────────────────────────────────────────────

function SicherheitSection() {
  const signOut   = useAuthStore(s => s.signOut)
  const showToast = useToastStore(s => s.show)

  const [pw1, setPw1]       = useState('')
  const [pw2, setPw2]       = useState('')
  const [saving, setSaving] = useState(false)

  const tooShort = pw1.length > 0 && pw1.length < 6
  const mismatch = pw2.length > 0 && pw1 !== pw2
  const canSave  = pw1.length >= 6 && pw1 === pw2 && !saving

  async function handleChangePassword() {
    if (!canSave) return
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pw1 })
      if (error) throw error
      setPw1(''); setPw2('')
      showToast({ message: 'Passwort geändert.', variant: 'success' })
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Passwort konnte nicht geändert werden', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section icon={Shield} title="Sicherheit">
      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Neues Passwort</FieldLabel>
        <input
          className="mock-input"
          type="password"
          value={pw1}
          onChange={e => setPw1(e.target.value)}
          placeholder="Mindestens 6 Zeichen"
          style={{ fontSize: 14, maxWidth: 360 }}
        />
        {tooShort && <div style={{ fontSize: 11, color: '#f87171', marginTop: 5 }}>Mindestens 6 Zeichen.</div>}
      </div>
      <div style={{ marginBottom: 18 }}>
        <FieldLabel>Passwort wiederholen</FieldLabel>
        <input
          className="mock-input"
          type="password"
          value={pw2}
          onChange={e => setPw2(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
          placeholder="Zur Bestätigung erneut eingeben"
          style={{ fontSize: 14, maxWidth: 360 }}
        />
        {mismatch && <div style={{ fontSize: 11, color: '#f87171', marginTop: 5 }}>Passwörter stimmen nicht überein.</div>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button className="btn-primary" onClick={handleChangePassword} disabled={!canSave} style={{ fontSize: 13, padding: '8px 16px' }}>
          {saving ? 'Ändern…' : 'Passwort ändern'}
        </button>
        <button
          onClick={() => signOut()}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 13, padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
            background: 'transparent', border: '1px solid var(--border)', color: 'var(--fg-muted)',
            fontFamily: 'inherit',
          }}
        >
          <LogOut size={13} /> Abmelden
        </button>
      </div>
    </Section>
  )
}

// ── Subscription / License section (placeholder until billing is wired) ─────────

function AboSection() {
  return (
    <Section icon={CreditCard} title="Abo & Lizenz">
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        padding: '14px 16px', borderRadius: 12,
        background: 'var(--surface-2)', border: '1px solid var(--border)',
      }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            Aktueller Plan
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>Cultera</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
              background: 'var(--accent-soft)', color: 'var(--accent-text)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              Aktiv
            </span>
          </div>
        </div>
        <button
          disabled
          title="Verfügbar, sobald die Abrechnung verbunden ist"
          style={{
            fontSize: 12, padding: '8px 14px', borderRadius: 8,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--fg-dim)', cursor: 'not-allowed', fontFamily: 'inherit', flexShrink: 0,
          }}
        >
          Abo verwalten
        </button>
      </div>

      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14,
        fontSize: 12, color: 'var(--fg-dim)', lineHeight: 1.5,
      }}>
        <Check size={14} style={{ flexShrink: 0, marginTop: 1, opacity: 0.6 }} />
        <span>
          Plan, Laufzeit, Zahlung und Rechnungen erscheinen hier, sobald die Abrechnung
          angebunden ist. Die Verwaltung (Upgrade, Kündigung, Rechnungen) wird dann hier eingebunden.
        </span>
      </div>
    </Section>
  )
}

// ── Feedback section (Testphase — lokale Notizen, exportierbar) ─────────────────

const FEEDBACK_STORE = 'cultera:feedback:v1'

function FeedbackSection() {
  const showToast = useToastStore(s => s.show)
  const [text, setText] = useState(() => {
    try { return localStorage.getItem(FEEDBACK_STORE) ?? '' } catch { return '' }
  })

  useEffect(() => {
    try { localStorage.setItem(FEEDBACK_STORE, text) } catch { /* ignore */ }
  }, [text])

  function exportFeedback() {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const fname = `cultera-feedback-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.txt`
    const content = `Cultera Focus — Feedback\nExportiert: ${now.toLocaleString('de-DE')}\n\n${text}`
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fname
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    showToast({ message: 'Feedback exportiert.', variant: 'success' })
  }

  return (
    <Section icon={MessageSquare} title="Feedback" subtitle="Notizen zur Testphase — wird lokal gespeichert und ist exportierbar.">
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Was läuft gut, was fehlt, was nervt? Schreib's hier rein…"
        rows={6}
        style={{
          width: '100%', resize: 'vertical', minHeight: 120, lineHeight: 1.55,
          fontSize: 14, fontFamily: 'inherit', padding: '12px 14px',
          borderRadius: 10, border: '1px solid var(--border)',
          background: 'var(--surface-2)', color: 'var(--fg)', outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
        <button
          className="btn-primary"
          onClick={exportFeedback}
          disabled={!text.trim()}
          style={{ fontSize: 13, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Download size={14} /> Exportieren
        </button>
        <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
          {text.trim() ? `${text.length} Zeichen · automatisch gespeichert` : 'Noch kein Feedback'}
        </span>
      </div>
    </Section>
  )
}

// ── Route ───────────────────────────────────────────────────────────────────────

export function ProfileRoute() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Konto.</h1>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--fg-dim)' }}>Profil, Sicherheit und Lizenz</p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640, margin: '0 auto' }}>
          <ProfilSection />
          <FeedbackSection />
          <SicherheitSection />
          <AboSection />
        </div>
      </div>
    </div>
  )
}
