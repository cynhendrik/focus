import { useState } from 'react'
import { invoke } from '@tauri-apps/api/tauri'
import { useStore } from '../../store'

const STEPS = ['E-Mail', 'Passwort', 'Verbinden']

export function AccountSetupModal({ open, onClose }) {
  const addEmailAccount    = useStore(s => s.addEmailAccount)
  const setEmailSyncStatus = useStore(s => s.setEmailSyncStatus)

  const [step,        setStep]        = useState(0)
  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [imapHost,    setImapHost]    = useState('')
  const [imapPort,    setImapPort]    = useState(993)
  const [displayName, setDisplayName] = useState('')
  const [detected,    setDetected]    = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  if (!open) return null

  const reset = () => {
    setStep(0); setEmail(''); setPassword(''); setImapHost('')
    setImapPort(993); setDisplayName(''); setDetected(false)
    setError(''); setLoading(false)
  }

  const handleClose = () => { reset(); onClose() }

  const handleEmailNext = async () => {
    if (!email.includes('@')) { setError('Bitte gültige E-Mail-Adresse eingeben.'); return }
    setError('')
    setLoading(true)
    try {
      const result = await invoke('email_detect_provider', { email })
      if (result) {
        const [host, port] = result
        setImapHost(host)
        setImapPort(port)
        setDetected(true)
      } else {
        setDetected(false)
      }
      setDisplayName(email.split('@')[0])
      setStep(1)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleTest = async () => {
    if (!password) { setError('Bitte Passwort eingeben.'); return }
    if (!imapHost) { setError('Bitte IMAP-Server eingeben.'); return }
    setError('')
    setLoading(true)
    try {
      await invoke('email_test_connection', { email, password, imapHost, imapPort })
      setStep(2)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setLoading(true)
    setError('')
    try {
      const account = await invoke('email_add_account', {
        email, password, imapHost, imapPort, displayName,
      })
      addEmailAccount(account)
      setEmailSyncStatus(account.id, { phase: 'idle', progress: 0, error: null })
      handleClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => e.target === e.currentTarget && handleClose()}>
      <div style={{
        width: 420, background: 'var(--bg1)', borderRadius: 16,
        border: '1px solid var(--border)', padding: 28,
        boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
      }}>
        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
          {STEPS.map((label, i) => (
            <div key={label} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{
                height: 3, borderRadius: 2, marginBottom: 6,
                background: i <= step ? 'var(--p)' : 'var(--border2)',
              }} />
              <div style={{
                fontSize: 10, fontWeight: i === step ? 700 : 400,
                color: i === step ? 'var(--p)' : 'var(--text4)',
              }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Step 0: E-Mail */}
        {step === 0 && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              E-Mail-Konto verbinden
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 20 }}>
              Server-Einstellungen werden automatisch erkannt.
            </div>
            <Field label="E-Mail-Adresse" value={email} onChange={setEmail}
              placeholder="du@beispiel.de" type="email" autoFocus
              onKeyDown={e => e.key === 'Enter' && handleEmailNext()} />
            {!detected && imapHost === '' && email.includes('@') && (
              <>
                <Field label="IMAP-Server" value={imapHost} onChange={setImapHost}
                  placeholder="imap.beispiel.de" />
                <Field label="Port" value={String(imapPort)}
                  onChange={v => setImapPort(Number(v))} placeholder="993" />
              </>
            )}
            {error && <ErrorMsg msg={error} />}
            <BtnRow onCancel={handleClose} onNext={handleEmailNext} loading={loading} nextLabel="Weiter" />
          </>
        )}

        {/* Step 1: Password */}
        {step === 1 && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              Passwort eingeben
            </div>
            {detected ? (
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
                Server erkannt: <strong style={{ color: 'var(--text)' }}>{imapHost}:{imapPort}</strong>
              </div>
            ) : (
              <>
                <Field label="IMAP-Server" value={imapHost} onChange={setImapHost} placeholder="imap.beispiel.de" />
                <Field label="Port" value={String(imapPort)} onChange={v => setImapPort(Number(v))} placeholder="993" />
              </>
            )}
            <Field label="Passwort" value={password} onChange={setPassword}
              type="password" autoFocus placeholder="••••••••"
              onKeyDown={e => e.key === 'Enter' && handleTest()} />
            <div style={{ fontSize: 11, color: 'var(--text4)', marginBottom: 16 }}>
              🔒 Wird sicher im Windows Credential Manager gespeichert — nicht in Dateien.
            </div>
            {error && <ErrorMsg msg={error} />}
            <BtnRow onCancel={() => setStep(0)} onNext={handleTest} loading={loading} nextLabel="Verbindung testen" />
          </>
        )}

        {/* Step 2: Confirm */}
        {step === 2 && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              Verbindung erfolgreich ✓
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 20 }}>
              Konto wird hinzugefügt. Danach kannst du synchronisieren.
            </div>
            <Field label="Anzeigename" value={displayName} onChange={setDisplayName}
              placeholder="Mein GMX-Konto" autoFocus />
            {error && <ErrorMsg msg={error} />}
            <BtnRow onCancel={() => setStep(1)} onNext={handleSave} loading={loading} nextLabel="Konto hinzufügen" />
          </>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, onChange, ...props }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: 'block', fontSize: 10, fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--text3)', marginBottom: 5,
      }}>{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
          background: 'var(--bg2)', border: '1px solid var(--border2)',
          color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
        }}
        onFocus={e => e.target.style.borderColor = 'rgba(124,58,237,0.5)'}
        onBlur={e => e.target.style.borderColor = 'var(--border2)'}
        {...props}
      />
    </div>
  )
}

function ErrorMsg({ msg }) {
  return (
    <div style={{
      fontSize: 12, color: '#ef4444',
      background: 'rgba(239,68,68,0.08)',
      border: '1px solid rgba(239,68,68,0.2)',
      borderRadius: 8, padding: '8px 12px', marginBottom: 14,
    }}>
      {msg}
    </div>
  )
}

function BtnRow({ onCancel, onNext, loading, nextLabel }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
      <button onClick={onCancel} style={{
        padding: '10px 16px', borderRadius: 8, background: 'transparent',
        border: '1px solid var(--border2)', color: 'var(--text3)',
        fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
      }}>Zurück</button>
      <button onClick={onNext} disabled={loading} style={{
        flex: 1, padding: '10px 0', borderRadius: 8, background: 'var(--p)',
        border: 'none', color: '#fff', fontSize: 13, fontWeight: 600,
        cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit',
        opacity: loading ? 0.7 : 1,
      }}>{loading ? 'Bitte warten…' : nextLabel}</button>
    </div>
  )
}
