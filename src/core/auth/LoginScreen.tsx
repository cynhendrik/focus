import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/auth.store'
import { getCurrentWindow } from '@tauri-apps/api/window'

const IS_DEV = import.meta.env.DEV
const BLUE   = '#F2754F'

async function minimizeWin() { await getCurrentWindow().minimize() }
async function closeWin()    { await getCurrentWindow().close() }

// ── Intro ─────────────────────────────────────────────────────────────────────

const INTRO_WORDS = ['You', "don't", 'find', 'yourself,', 'you', 'create', 'yourself.']

function IntroOverlay({ fading }: { fading: boolean }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: fading ? 0 : 1,
      transition: 'opacity 500ms cubic-bezier(.4,0,.2,1)',
      pointerEvents: fading ? 'none' : 'auto',
    }}>
      <p style={{
        margin: 0,
        fontFamily: 'var(--font-sans)',
        fontSize: 'clamp(17px, 2.1vw, 27px)',
        fontWeight: 300,
        letterSpacing: '-0.025em',
        lineHeight: 1,
        color: '#fff',
        textShadow: '0 2px 48px rgba(255,255,255,0.12)',
        display: 'flex', gap: '0.3em', flexWrap: 'wrap', justifyContent: 'center',
      }}>
        {INTRO_WORDS.map((word, i) => (
          <span
            key={i}
            style={{
              display: 'inline-block',
              willChange: 'transform, opacity, filter',
              animation: `intro-word-rise 1500ms cubic-bezier(.16,1,.3,1) ${220 + i * 150}ms both`,
            }}
          >
            {word}
          </span>
        ))}
      </p>
    </div>
  )
}

// ── Starburst ─────────────────────────────────────────────────────────────────

function Starburst() {
  return (
    <svg
      width="160" height="160" viewBox="-80 -80 160 160"
      style={{ color: 'rgba(255,255,255,0.55)', animation: 'starburst-spin 60s linear infinite' }}
    >
      <line x1="0"   y1="-76" x2="0"   y2="76"  stroke="currentColor" strokeWidth="0.7" />
      <line x1="-76" y1="0"   x2="76"  y2="0"   stroke="currentColor" strokeWidth="0.7" />
      <line x1="-54" y1="-54" x2="54"  y2="54"  stroke="currentColor" strokeWidth="0.7" />
      <line x1="54"  y1="-54" x2="-54" y2="54"  stroke="currentColor" strokeWidth="0.7" />
      <line x1="-5"  y1="-44" x2="5"   y2="-44" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
      <line x1="-5"  y1="44"  x2="5"   y2="44"  stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
      <line x1="-44" y1="-5"  x2="-44" y2="5"   stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
      <line x1="44"  y1="-5"  x2="44"  y2="5"   stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
      <line x1="-5"  y1="-28" x2="5"   y2="-28" stroke="currentColor" strokeWidth="0.4" opacity="0.3" />
      <line x1="-5"  y1="28"  x2="5"   y2="28"  stroke="currentColor" strokeWidth="0.4" opacity="0.3" />
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
        color: focused ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.3)',
        fontFamily: 'var(--font-mono)', transition: 'color 200ms',
      }}>
        {label}
      </label>
      <input
        className="login-field"
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
          borderBottom: `1px solid ${focused ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.2)'}`,
          padding: '8px 0 10px',
          fontSize: 13.5,
          color: '#fff',
          outline: 'none',
          width: '100%',
          fontFamily: 'var(--font-sans)',
          transition: 'border-color 200ms',
          caretColor: '#fff',
        }}
      />
    </div>
  )
}

// ── LoginScreen ───────────────────────────────────────────────────────────────

export function LoginScreen() {
  const signIn = useAuthStore(s => s.signIn)
  const signUp = useAuthStore(s => s.signUp)

  const [phase,    setPhase]    = useState<'intro' | 'fading' | 'login'>('intro')
  const [mode,     setMode]     = useState<'login' | 'register'>('login')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [success,  setSuccess]  = useState<string | null>(null)

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('fading'), IS_DEV ?  100 : 3200)
    const t2 = setTimeout(() => setPhase('login'),  IS_DEV ?  200 : 3700)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

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

  function switchMode() {
    setMode(m => m === 'login' ? 'register' : 'login')
    setError(null); setSuccess(null)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: BLUE, overflow: 'hidden' }}>

      {/* placeholder color for login inputs */}
      <style>{`.login-field::placeholder { color: rgba(255,255,255,0.28); }`}</style>

      {/* ── Window controls ─────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', top: 16, right: 16, zIndex: 20,
        display: 'flex', gap: 6,
      }}>
        {(['minimize', 'close'] as const).map(action => (
          <button
            key={action}
            onClick={action === 'minimize' ? minimizeWin : closeWin}
            title={action === 'minimize' ? 'Minimieren' : 'Schließen'}
            style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontFamily: 'var(--font-sans)',
              transition: 'background 150ms, color 150ms, border-color 150ms',
            }}
            onMouseEnter={e => {
              if (action === 'close') {
                e.currentTarget.style.background    = 'rgba(255,80,80,0.25)'
                e.currentTarget.style.color         = 'rgba(255,200,200,0.9)'
                e.currentTarget.style.borderColor   = 'rgba(255,120,120,0.4)'
              } else {
                e.currentTarget.style.background    = 'rgba(255,255,255,0.12)'
                e.currentTarget.style.color         = 'rgba(255,255,255,0.7)'
                e.currentTarget.style.borderColor   = 'rgba(255,255,255,0.3)'
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background  = 'transparent'
              e.currentTarget.style.color       = 'rgba(255,255,255,0.4)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'
            }}
          >
            {action === 'minimize' ? '−' : '✕'}
          </button>
        ))}
      </div>

      {/* ── Intro overlay ───────────────────────────────────────────────── */}
      {phase !== 'login' && <IntroOverlay fading={phase === 'fading'} />}

      {/* ── Login form ──────────────────────────────────────────────────── */}
      {phase !== 'intro' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'grid', gridTemplateColumns: '40% 60%',
          animation: 'login-card-in 700ms cubic-bezier(.2,.7,.1,1) both',
        }}>

          {/* LEFT: decorative */}
          <div style={{
            background: 'transparent',
            borderRight: '1px solid rgba(255,255,255,0.1)',
            display: 'flex', flexDirection: 'column',
            padding: '28px 32px',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              fontSize: 11.5, fontFamily: 'var(--font-sans)', fontWeight: 500,
              color: 'rgba(255,255,255,0.7)', letterSpacing: '0.01em',
            }}>
              Cultera OS<sup style={{ fontSize: 8 }}>®</sup>
            </div>

            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Starburst />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={{
                fontSize: 12, fontFamily: 'var(--font-sans)', fontWeight: 300,
                color: 'rgba(255,255,255,0.8)', letterSpacing: '-0.01em', margin: 0,
              }}>
                If we build, we build to lead.
              </p>
              <p style={{
                fontSize: 9.5, fontFamily: 'var(--font-mono)',
                color: 'rgba(255,255,255,0.2)', margin: 0, letterSpacing: '0.04em',
              }}>
                © 2026 Cultera. All rights reserved.
              </p>
            </div>
          </div>

          {/* RIGHT: login form */}
          <div style={{
            display: 'flex', flexDirection: 'column',
            padding: '28px 52px',
          }}>

            {/* Top row */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={switchMode}
                style={{
                  fontSize: 11, color: 'rgba(255,255,255,0.4)', background: 'none',
                  border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  letterSpacing: '0.02em', padding: 0,
                  transition: 'color 150ms',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.85)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
              >
                {mode === 'login' ? 'Konto erstellen' : 'Einloggen'}
              </button>
            </div>

            {/* Form — vertically centered */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <form onSubmit={handleSubmit} style={{ maxWidth: 380 }}>

                <h1 style={{
                  fontSize: 52, fontWeight: 300, color: '#fff',
                  letterSpacing: '-0.04em', margin: '0 0 44px',
                  fontFamily: 'var(--font-sans)', lineHeight: 1,
                }}>
                  {mode === 'login' ? 'Login' : 'Register'}
                </h1>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 28px', marginBottom: 28 }}>
                  <Field label="E-Mail"   type="email"    value={email}    onChange={setEmail}    placeholder="deine@email.de" autoFocus />
                  <Field label="Passwort" type="password" value={password} onChange={setPassword} placeholder="••••••••" />
                </div>

                {error && (
                  <p style={{
                    fontSize: 11.5, color: 'rgba(255,200,200,0.9)',
                    fontFamily: 'var(--font-mono)', marginBottom: 16,
                    letterSpacing: '0.02em',
                  }}>
                    ↳ {error}
                  </p>
                )}
                {success && (
                  <p style={{
                    fontSize: 11.5, color: 'rgba(210,255,225,0.9)',
                    fontFamily: 'var(--font-mono)', marginBottom: 16,
                    letterSpacing: '0.02em',
                  }}>
                    ✓ {success}
                  </p>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      width: 62, height: 62, borderRadius: '50%',
                      background: loading ? 'rgba(255,255,255,0.75)' : '#fff',
                      color: BLUE, border: 'none',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontSize: loading ? 11 : 18,
                      fontFamily: loading ? 'var(--font-mono)' : 'var(--font-sans)',
                      fontWeight: 600, letterSpacing: loading ? '0.06em' : 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'transform 200ms, background 150ms',
                      flexShrink: 0,
                      boxShadow: '0 4px 28px rgba(0,0,0,0.22)',
                    }}
                    onMouseEnter={e => { if (!loading) e.currentTarget.style.transform = 'scale(1.07)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                  >
                    {loading ? '…' : '→'}
                  </button>
                </div>

              </form>
            </div>

          </div>

        </div>
      )}

    </div>
  )
}
