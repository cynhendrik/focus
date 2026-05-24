import { useState } from 'react'
import { useAuthStore } from '@/store/auth.store'

export function LoginScreen() {
  const signIn = useAuthStore(s => s.signIn)
  const signUp = useAuthStore(s => s.signUp)

  const [mode,     setMode]     = useState<'login' | 'register'>('login')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [success,  setSuccess]  = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)
    try {
      if (mode === 'login') {
        await signIn(email, password)
      } else {
        await signUp(email, password)
        setSuccess('Konto erstellt! Bitte bestätige deine E-Mail-Adresse und logge dich dann ein.')
        setMode('login')
        setPassword('')
      }
    } catch (err: any) {
      setError(err?.message ?? (mode === 'login' ? 'Login fehlgeschlagen' : 'Registrierung fehlgeschlagen'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#fff',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 360,
        padding: '40px 36px',
        borderRadius: 20,
        background: '#fff',
        border: '1px solid #ebebeb',
        boxShadow: '0 2px 32px rgba(0,0,0,0.06)',
      }}>

        {/* Logo + Titel */}
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <div style={{
            fontSize: 11,
            letterSpacing: '0.22em',
            textTransform: 'uppercase' as const,
            color: '#bbb',
            fontFamily: 'var(--font-mono)',
            marginBottom: 10,
          }}>
            Cynera Focus
          </div>
          <h1 style={{
            fontSize: 22,
            fontWeight: 300,
            color: '#111',
            letterSpacing: '-0.02em',
            margin: 0,
          }}>
            {mode === 'login' ? 'Willkommen zurück.' : 'Konto erstellen.'}
          </h1>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* E-Mail */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, color: '#999', letterSpacing: '0.04em' }}>
              E-Mail
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="deine@email.de"
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid #e5e5e5',
                fontSize: 13.5,
                color: '#111',
                background: '#fafafa',
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box' as const,
              }}
              onFocus={e => (e.currentTarget.style.borderColor = '#111')}
              onBlur={e => (e.currentTarget.style.borderColor = '#e5e5e5')}
            />
          </div>

          {/* Passwort */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, color: '#999', letterSpacing: '0.04em' }}>
              Passwort
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid #e5e5e5',
                fontSize: 13.5,
                color: '#111',
                background: '#fafafa',
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box' as const,
              }}
              onFocus={e => (e.currentTarget.style.borderColor = '#111')}
              onBlur={e => (e.currentTarget.style.borderColor = '#e5e5e5')}
            />
          </div>

          {/* Fehler */}
          {error && (
            <div style={{
              fontSize: 12,
              color: '#e55',
              background: 'rgba(220,50,50,0.06)',
              border: '1px solid rgba(220,50,50,0.15)',
              borderRadius: 8,
              padding: '9px 12px',
            }}>
              {error}
            </div>
          )}

          {/* Erfolg */}
          {success && (
            <div style={{
              fontSize: 12,
              color: '#2a9',
              background: 'rgba(40,180,120,0.06)',
              border: '1px solid rgba(40,180,120,0.2)',
              borderRadius: 8,
              padding: '9px 12px',
            }}>
              {success}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              padding: '11px 0',
              borderRadius: 10,
              background: '#111',
              color: '#fff',
              fontSize: 13.5,
              fontWeight: 500,
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              transition: 'opacity 150ms',
              letterSpacing: '-0.01em',
            }}
          >
            {loading
              ? (mode === 'login' ? 'Einloggen…' : 'Konto erstellen…')
              : (mode === 'login' ? 'Einloggen' : 'Konto erstellen')
            }
          </button>
        </form>

        {/* Toggle Login / Registrieren */}
        <div style={{ marginTop: 22, textAlign: 'center' }}>
          <span style={{ fontSize: 12, color: '#aaa' }}>
            {mode === 'login' ? 'Noch kein Konto?' : 'Bereits registriert?'}
          </span>
          {' '}
          <button
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); setSuccess(null) }}
            style={{
              fontSize: 12,
              color: '#111',
              fontWeight: 500,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: 2,
            }}
          >
            {mode === 'login' ? 'Registrieren' : 'Einloggen'}
          </button>
        </div>

      </div>
    </div>
  )
}
