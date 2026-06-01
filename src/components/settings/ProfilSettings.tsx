import { useAuthStore } from '@/store/auth.store'

export function ProfilSettings() {
  const user = useAuthStore(s => s.user)
  const email = user?.email ?? '—'
  const initials = email.slice(0, 2).toUpperCase()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 560 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Profil</h2>
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: 0 }}>Deine Nutzerdaten</p>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'var(--surface-3)', border: '1px solid var(--border-strong)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 700, color: 'var(--fg-muted)',
            fontFamily: 'var(--font-mono)',
          }}>
            {initials}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{email}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 2 }}>Administrator</div>
          </div>
        </div>

        <div style={{ padding: '16px 20px' }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
            E-Mail
          </label>
          <input
            readOnly value={email}
            style={{
              width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--fg-dim)', outline: 'none', fontFamily: 'inherit',
              boxSizing: 'border-box' as const,
            }}
          />
          <p style={{ fontSize: 11, color: 'var(--fg-dim)', margin: '6px 0 0' }}>
            E-Mail-Adresse wird über dein Supabase-Konto verwaltet.
          </p>
        </div>
      </div>
    </div>
  )
}
