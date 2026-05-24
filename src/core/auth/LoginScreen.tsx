import { useState } from 'react'
import { useAuthStore } from '@/store/auth.store'
import { useWorkspaceStore } from '@/store/workspace.store'

const IS_DEV = import.meta.env.DEV

// ── Starburst SVG ────────────────────────────────────────────────────────────

function Starburst() {
  return (
    <svg
      width="160" height="160" viewBox="-80 -80 160 160"
      style={{ color: 'var(--accent)', animation: 'starburst-spin 60s linear infinite' }}
    >
      {/* Main cross lines — long */}
      <line x1="0" y1="-76" x2="0" y2="76"   stroke="currentColor" strokeWidth="0.7" />
      <line x1="-76" y1="0" x2="76" y2="0"   stroke="currentColor" strokeWidth="0.7" />
      {/* Diagonal lines */}
      <line x1="-54" y1="-54" x2="54" y2="54" stroke="currentColor" strokeWidth="0.7" />
      <line x1="54" y1="-54" x2="-54" y2="54" stroke="currentColor" strokeWidth="0.7" />
      {/* Tick marks on cross — short perpendicular */}
      <line x1="-5" y1="-44" x2="5" y2="-44" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
      <line x1="-5" y1="44"  x2="5" y2="44"  stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
      <line x1="-44" y1="-5" x2="-44" y2="5" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
      <line x1="44" y1="-5"  x2="44" y2="5"  stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
      {/* Inner short diagonal ticks */}
      <line x1="-5" y1="-28" x2="5" y2="-28" stroke="currentColor" strokeWidth="0.4" opacity="0.3" />
      <line x1="-5" y1="28"  x2="5" y2="28"  stroke="currentColor" strokeWidth="0.4" opacity="0.3" />
      {/* Center dot */}
      <circle cx="0" cy="0" r="2.5" fill="currentColor" />
    </svg>
  )
}

// ── Field ─────────────────────────────────────────────────────────────────────

function Field({
  label, type = 'text', value, onChange, placeholder, autoFocus,
}: {
  label: string; type?: string; value: string
  onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{
        fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: focused ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)',
        fontFamily: 'var(--font-mono)', transition: 'color 200ms',
      }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        required
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          background: 'transparent',
          border: 'none',
          borderBottom: `1px solid ${focused ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.12)'}`,
          padding: '8px 0 10px',
          fontSize: 13.5,
          color: '#fff',
          outline: 'none',
          width: '100%',
          fontFamily: 'var(--font-sans)',
          transition: 'border-color 200ms',
          caretColor: 'var(--accent)',
        }}
      />
    </div>
  )
}

// ── LoginScreen ───────────────────────────────────────────────────────────────

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
    setError(null); setSuccess(null); setLoading(true)
    try {
      if (mode === 'login') {
        await signIn(email, password)
      } else {
        await signUp(email, password)
        setSuccess('Konto erstellt — bitte E-Mail bestätigen.')
        setMode('login'); setPassword('')
      }
    } catch (err: any) {
      setError(err?.message ?? 'Fehler aufgetreten')
    } finally {
      setLoading(false)
    }
  }

  function handleDevSkip() {
    useWorkspaceStore.getState().setActiveWorkspace('dev')
    useAuthStore.setState({ user: { id: 'dev', email: 'dev@cynera.local' } as any, loading: false })
  }

  function switchMode() {
    setMode(m => m === 'login' ? 'register' : 'login')
    setError(null); setSuccess(null)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000',
      display: 'grid', gridTemplateColumns: '40% 60%',
    }}>

      {/* ── LEFT: Decorative ────────────────────────────────────────────── */}
      <div style={{
        background: '#000',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column',
        padding: '28px 32px',
        position: 'relative', overflow: 'hidden',
      }}>

        {/* Brand */}
        <div style={{
          fontSize: 11.5, fontFamily: 'var(--font-sans)', fontWeight: 500,
          color: 'rgba(255,255,255,0.7)', letterSpacing: '0.01em',
        }}>
          Cynera Focus<sup style={{ fontSize: 8 }}>®</sup>
        </div>

        {/* Starburst */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Starburst />
        </div>

        {/* Bottom */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{
            fontSize: 12, fontFamily: 'var(--font-sans)', fontWeight: 300,
            color: 'var(--accent)', letterSpacing: '-0.01em', margin: 0,
          }}>
            If we build, we build to lead.
          </p>
          <p style={{
            fontSize: 9.5, fontFamily: 'var(--font-mono)',
            color: 'rgba(255,255,255,0.18)', margin: 0, letterSpacing: '0.04em',
          }}>
            © 2026 Cynera. All rights reserved.
          </p>
        </div>
      </div>

      {/* ── RIGHT: Login form ────────────────────────────────────────────── */}
      <div style={{
        background: '#080808',
        display: 'flex', flexDirection: 'column',
        padding: '28px 52px',
        animation: 'login-card-in 700ms cubic-bezier(.2,.7,.1,1) 120ms both',
      }}>

        {/* Top row */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={switchMode}
            style={{
              fontSize: 11, color: 'rgba(255,255,255,0.35)', background: 'none',
              border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)',
              letterSpacing: '0.02em', padding: 0,
              transition: 'color 150ms',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
          >
            {mode === 'login' ? 'Konto erstellen' : 'Einloggen'}
          </button>
        </div>

        {/* Form — vertically centered */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <form onSubmit={handleSubmit} style={{ maxWidth: 380 }}>

            {/* Heading */}
            <h1 style={{
              fontSize: 52, fontWeight: 300, color: '#fff',
              letterSpacing: '-0.04em', margin: '0 0 44px',
              fontFamily: 'var(--font-sans)', lineHeight: 1,
            }}>
              {mode === 'login' ? 'Login' : 'Register'}
            </h1>

            {/* Inputs — 2 col grid like reference */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 28px', marginBottom: 28 }}>
              <Field label="E-Mail"   type="email"    value={email}    onChange={setEmail}    placeholder="deine@email.de" autoFocus />
              <Field label="Passwort" type="password" value={password} onChange={setPassword} placeholder="••••••••" />
            </div>

            {/* Error / Success */}
            {error && (
              <p style={{
                fontSize: 11.5, color: 'oklch(72% 0.18 25)',
                fontFamily: 'var(--font-mono)', marginBottom: 16,
                letterSpacing: '0.02em',
              }}>
                ↳ {error}
              </p>
            )}
            {success && (
              <p style={{
                fontSize: 11.5, color: 'var(--accent)',
                fontFamily: 'var(--font-mono)', marginBottom: 16,
                letterSpacing: '0.02em',
              }}>
                ✓ {success}
              </p>
            )}

            {/* Submit row — button right-aligned like reference */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: 62, height: 62, borderRadius: '50%',
                  background: loading ? 'rgba(255,255,255,0.7)' : '#fff',
                  color: '#000', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: loading ? 11 : 18,
                  fontFamily: loading ? 'var(--font-mono)' : 'var(--font-sans)',
                  fontWeight: 500, letterSpacing: loading ? '0.06em' : 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'transform 200ms, background 150ms',
                  flexShrink: 0,
                }}
                onMouseEnter={e => { if (!loading) (e.currentTarget.style.transform = 'scale(1.07)') }}
                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
              >
                {loading ? '…' : '→'}
              </button>
            </div>

          </form>
        </div>

        {/* Dev skip — bottom right */}
        {IS_DEV && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleDevSkip}
              style={{
                fontSize: 9.5, color: 'rgba(255,255,255,0.15)',
                background: 'none', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 5, padding: '3px 8px', cursor: 'pointer',
                fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
                textTransform: 'uppercase', transition: 'color 150ms, border-color 150ms',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'rgba(255,255,255,0.45)'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'rgba(255,255,255,0.15)'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
              }}
            >
              dev skip
            </button>
          </div>
        )}
      </div>

    </div>
  )
}
