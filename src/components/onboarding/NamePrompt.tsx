import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth.store'
import { useMembersStore } from '@/store/members.store'

/**
 * Einmaliger Hinweis beim ersten Login ohne gesetzten Namen: damit niemand als
 * E-Mail-Präfix ("team") oder Nummer im Chat/Mitgliederliste auftaucht. Schreibt
 * Auth-`full_name` (lokales Begrüßungs-/Avatar-Label) UND das geteilte Profil
 * (`profiles.display_name`, sichtbar für Team/Chat). Versteckt sich selbst, sobald
 * ein Name existiert oder „Später" gewählt wurde.
 */
export function NamePrompt() {
  const user = useAuthStore(s => s.user)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const hasName = !!((user?.user_metadata?.full_name as string | undefined)?.trim())
  if (!user || hasName || dismissed) return null

  const save = async () => {
    const n = name.trim()
    if (!n) return
    setSaving(true)
    try {
      await supabase.auth.updateUser({ data: { full_name: n } })
      await useMembersStore.getState().setMyDisplayName(n)
      setDismissed(true)
    } catch {
      // Fehler nicht blockierend — der Nutzer kann es später im Profil setzen.
      setDismissed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'oklch(0% 0 0 / 0.35)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 901,
        width: 'min(420px, calc(100vw - 48px))', background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 16, boxShadow: 'var(--shadow-2)', padding: 24,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>Wie heißt du?</div>
        <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
          Dein Name erscheint im Team-Chat und in der Mitgliederliste — statt deiner E-Mail.
        </div>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void save() }}
          placeholder="Vor- und Nachname"
          style={{
            padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--surface-2)', color: 'var(--fg)', fontSize: 14, outline: 'none',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button
            onClick={() => setDismissed(true)}
            style={{ fontSize: 12.5, color: 'var(--fg-dim)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px 12px' }}
          >
            Später
          </button>
          <button
            onClick={() => void save()}
            disabled={!name.trim() || saving}
            className="btn-primary"
            style={{ fontSize: 13, padding: '8px 16px', opacity: !name.trim() || saving ? 0.5 : 1 }}
          >
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </>
  )
}
