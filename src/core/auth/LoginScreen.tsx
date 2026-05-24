import { useState } from 'react'
import { useAuthStore } from '@/store/auth.store'
import { useWorkspaceStore } from '@/store/workspace.store'

const IS_DEV = import.meta.env.DEV

export function LoginScreen() {
  const signIn = useAuthStore(s => s.signIn)
  const signUp = useAuthStore(s => s.signUp)
  const setActiveWorkspace = useWorkspaceStore(s => s.setActiveWorkspace)

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
        setSuccess('Konto erstellt! Bestätige deine E-Mail und logge dich dann ein.')
        setMode('login')
        setPassword('')
      }
    } catch (err: any) {
      setError(err?.message ?? (mode === 'login' ? 'Login fehlgeschlagen' : 'Registrierung fehlgeschlagen'))
    } finally {
      setLoading(false)
    }
  }

  function handleDevSkip() {
    useWorkspaceStore.getState().setActiveWorkspace('dev')
    useAuthStore.setState({ user: { id: 'dev', email: 'dev@cynera.local' } as any, loading: false })
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: '#000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>

      {/* Login-Karte */}
      <div style={{
        width: 360,
        background: 'var(--accent)',
        borderRadius: 20,
        padding: '40px 36px 36px',
        animation: 'login-card-in 600ms cubic-bezier(.2,.7,.1,1) 80ms both',
        position: 'relative',
      }}>

        {/* Toggle oben rechts */}
        <button
          onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError(null); setSuccess(null) }}
          style={{
            position: 'absolute',
            top: 20, right: 22,
            fontSize: 11,
            color: 'rgba(0,0,0,0.45)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            letterSpacing: '0.03em',
            padding: 0,
          }}
        >
          {mode === 'login' ? 'Konto erstellen' : 'Einloggen'}
        </button>

        {/* Heading */}
        <h1 style={{
          fontSize: 36,
          fontWeight: 400,
          color: '#000',
          letterSpacing: '-0.03em',
          margin: '0 0 32px',
          lineHeight: 1,
        }}>
          {mode === 'login' ? 'Login' : 'Registrieren'}
        </h1>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* E-Mail */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10.5, color: 'rgba(0,0,0,0.5)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
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
                padding: '10px 0',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid rgba(0,0,0,0.2)',
                fontSize: 13.5,
                color: '#000',
                outline: 'none',
                width: '100%',
                transition: 'border-color 150ms',
              }}
              onFocus={e => (e.currentTarget.style.borderBottomColor = '#000')}
              onBlur={e => (e.currentTarget.style.borderBottomColor = 'rgba(0,0,0,0.2)')}
            />
          </div>

          {/* Passwort */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10.5, color: 'rgba(0,0,0,0.5)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Passwort
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{
                padding: '10px 0',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid rgba(0,0,0,0.2)',
                fontSize: 13.5,
                color: '#000',
                outline: 'none',
                width: '100%',
                transition: 'border-color 150ms',
              }}
              onFocus={e => (e.currentTarget.style.borderBottomColor = '#000')}
              onBlur={e => (e.currentTarget.style.borderBottomColor = 'rgba(0,0,0,0.2)')}
            />
          </div>

          {/* Fehler / Erfolg */}
          {error && (
            <p style={{ fontSize: 12, color: '#000', background: 'rgba(0,0,0,0.1)', borderRadius: 8, padding: '8px 12px', margin: 0 }}>
              {error}
            </p>
          )}
          {success && (
            <p style={{ fontSize: 12, color: '#000', background: 'rgba(0,0,0,0.1)', borderRadius: 8, padding: '8px 12px', margin: 0 }}>
              {success}
            </p>
          )}

          {/* Submit — runder schwarzer Button, rechts ausgerichtet */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                width: 54, height: 54,
                borderRadius: '50%',
                background: '#000',
                color: 'var(--accent)',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.04em',
                transition: 'transform 150ms, opacity 150ms',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={e => { if (!loading) (e.currentTarget.style.transform = 'scale(1.06)') }}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              {loading ? '…' : '→'}
            </button>
          </div>

        </form>
      </div>

      {/* Dev-Skip — nur in Entwicklung sichtbar */}
      {IS_DEV && (
        <button
          onClick={handleDevSkip}
          style={{
            position: 'fixed',
            bottom: 16, right: 16,
            fontSize: 10,
            color: 'rgba(255,255,255,0.2)',
            background: 'none',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            padding: '4px 8px',
            cursor: 'pointer',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            transition: 'color 150ms, border-color 150ms',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = 'rgba(255,255,255,0.5)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'rgba(255,255,255,0.2)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
          }}
        >
          dev skip
        </button>
      )}

    </div>
  )
}
