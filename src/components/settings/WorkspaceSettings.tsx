import { useState, useEffect } from 'react'
import { Check, Copy } from 'lucide-react'
import { useCompanyStore } from '@/store/company.store'
import { useUiStore } from '@/store/ui.store'
import type { CompanyProfile } from '@/types/company.types'

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </label>
      <div style={{ display: 'flex', gap: 6 }}>
        <input readOnly value={value} style={{
          flex: 1, padding: '8px 12px', fontSize: 12,
          borderRadius: 8, border: '1px solid var(--border)',
          background: 'var(--surface-2)', color: 'var(--fg-dim)',
          outline: 'none', fontFamily: 'var(--font-mono)',
        }} />
        <button
          onClick={copy}
          style={{
            padding: '0 12px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--fg-muted)',
            display: 'flex', alignItems: 'center',
          }}
        >
          {copied ? <Check size={14} style={{ color: 'var(--ok)' }} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          padding: '8px 12px', fontSize: 13, borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--surface-2)',
          color: 'var(--fg)', outline: 'none', fontFamily: 'inherit', width: '100%',
          boxSizing: 'border-box' as const,
        }}
      />
    </div>
  )
}

interface Props { workspaceId: string }

export function WorkspaceSettings({ workspaceId }: Props) {
  const profile     = useCompanyStore(s => s.profile)
  const load        = useCompanyStore(s => s.load)
  const saveProfile = useCompanyStore(s => s.saveProfile)
  const theme       = useUiStore(s => s.theme)
  const toggleTheme = useUiStore(s => s.toggleTheme)
  const [form, setForm] = useState<CompanyProfile>(profile)
  const [saved, setSaved] = useState(false)

  useEffect(() => { load() }, [load])
  useEffect(() => { setForm(profile) }, [profile])

  const f   = (key: keyof CompanyProfile) => (v: string) => setForm(p => ({ ...p, [key]: v }))
  const val = (key: keyof CompanyProfile) => (form[key] as string) ?? ''

  const handleSave = async () => {
    await saveProfile(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 600 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Unternehmen</h2>
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: 0 }}>Firmendaten, Rechnungsdesign und Erscheinungsbild</p>
      </div>

      {/* Workspace */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Unternehmensname
          </label>
          <Field label="" value={val('name')} onChange={f('name')} placeholder="Muster GmbH" />
        </div>
        <div style={{ padding: '16px 20px' }}>
          <CopyField label="Workspace ID" value={workspaceId} />
        </div>
      </div>

      {/* Company Profile */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Unternehmensprofil</div>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 1 }}>Wird auf Rechnungen und Angeboten verwendet</div>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="E-Mail" value={val('email')} onChange={f('email')} placeholder="hallo@firma.de" />
            <Field label="Telefon" value={val('phone')} onChange={f('phone')} placeholder="+49 30 ..." />
          </div>
          <Field label="Adresse" value={val('address')} onChange={f('address')} placeholder="Musterstraße 1, 10115 Berlin" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Website" value={val('website')} onChange={f('website')} placeholder="https://firma.de" />
            <Field label="Steuernummer" value={val('steuernummer')} onChange={f('steuernummer')} placeholder="30/456/78901" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="USt-IdNr." value={val('taxId')} onChange={f('taxId')} placeholder="DE123456789" />
            <Field label="IBAN" value={val('iban')} onChange={f('iban')} placeholder="DE89 3704 0044 ..." />
          </div>
          <div
            onClick={() => setForm(p => ({ ...p, kleinunternehmer: !p.kleinunternehmer }))}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
              border: `1px solid ${form.kleinunternehmer ? 'var(--accent)' : 'var(--border)'}`,
              background: form.kleinunternehmer ? 'oklch(92% 0.2 125 / 0.06)' : 'var(--surface-2)',
              transition: 'all 180ms',
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>§19 UStG Kleinunternehmer</div>
              <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>Keine Mehrwertsteuer auf Rechnungen ausweisen</div>
            </div>
            <div style={{
              width: 36, height: 20, borderRadius: 10, flexShrink: 0,
              background: form.kleinunternehmer ? 'var(--accent)' : 'var(--surface-3)',
              position: 'relative', transition: 'background 180ms',
            }}>
              <div style={{
                position: 'absolute', top: 2,
                left: form.kleinunternehmer ? 18 : 2,
                width: 16, height: 16, borderRadius: '50%',
                background: form.kleinunternehmer ? 'var(--accent-ink)' : 'var(--fg-dim)',
                transition: 'left 180ms',
              }} />
            </div>
          </div>
        </div>
      </div>

      {/* Rechnungsdesign */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Rechnungsdesign</div>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 1 }}>Logo und Farbe für Rechnungen &amp; Angebote</div>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Logo */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Logo
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {form.logoBase64 ? (
                <div style={{
                  width: 56, height: 56, borderRadius: 10, overflow: 'hidden',
                  border: '1px solid var(--border)', background: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <img src={form.logoBase64} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
              ) : (
                <div style={{
                  width: 56, height: 56, borderRadius: 10,
                  border: '1px dashed var(--border)', background: 'var(--surface-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  fontSize: 20, color: 'var(--fg-dim)',
                }}>
                  🏢
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={{
                  padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  border: '1px solid var(--border)', background: 'var(--surface-2)',
                  color: 'var(--fg)', cursor: 'pointer',
                }}>
                  {form.logoBase64 ? 'Ersetzen' : 'Hochladen'}
                  <input
                    type="file" accept="image/*"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const reader = new FileReader()
                      reader.onload = ev => setForm(p => ({ ...p, logoBase64: ev.target?.result as string }))
                      reader.readAsDataURL(file)
                    }}
                  />
                </label>
                {form.logoBase64 && (
                  <button
                    onClick={() => setForm(p => ({ ...p, logoBase64: undefined }))}
                    style={{
                      padding: '7px 14px', borderRadius: 8, fontSize: 12,
                      border: '1px solid var(--border)', background: 'transparent',
                      color: 'var(--fg-dim)', cursor: 'pointer',
                    }}
                  >
                    Entfernen
                  </button>
                )}
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--fg-dim)', margin: 0 }}>PNG oder SVG empfohlen, max. 1 MB</p>
          </div>

          {/* Akzentfarbe */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Akzentfarbe
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {['#111111', '#1e40af', '#065f46', '#7c3aed', '#b45309', '#be123c'].map(color => (
                <button
                  key={color}
                  onClick={() => setForm(p => ({ ...p, invoiceAccentColor: color }))}
                  style={{
                    width: 28, height: 28, borderRadius: '50%', border: 'none',
                    background: color, cursor: 'pointer', flexShrink: 0,
                    outline: (form.invoiceAccentColor ?? '#111111') === color
                      ? '2px solid var(--accent)' : '2px solid transparent',
                    outlineOffset: 2,
                  }}
                />
              ))}
              <input
                type="color"
                value={form.invoiceAccentColor ?? '#111111'}
                onChange={e => setForm(p => ({ ...p, invoiceAccentColor: e.target.value }))}
                style={{
                  width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--border)',
                  padding: 0, cursor: 'pointer', background: 'transparent',
                }}
                title="Eigene Farbe"
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <div style={{ width: 32, height: 3, borderRadius: 2, background: form.invoiceAccentColor ?? '#111111' }} />
              <span style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
                {form.invoiceAccentColor ?? '#111111'}
              </span>
            </div>
          </div>

        </div>
      </div>

      {/* Erscheinungsbild */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Erscheinungsbild</div>
        </div>
        <div
          onClick={toggleTheme}
          style={{
            padding: '14px 20px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 13, color: 'var(--fg)' }}>
            {theme === 'dark' ? 'Dunkles Theme' : 'Helles Theme'}
          </div>
          <div style={{
            width: 36, height: 20, borderRadius: 10,
            background: theme === 'dark' ? 'var(--accent)' : 'var(--surface-3)',
            position: 'relative', transition: 'background 180ms',
          }}>
            <div style={{
              position: 'absolute', top: 2,
              left: theme === 'dark' ? 18 : 2,
              width: 16, height: 16, borderRadius: '50%',
              background: theme === 'dark' ? 'var(--accent-ink)' : 'var(--fg-dim)',
              transition: 'left 180ms',
            }} />
          </div>
        </div>
      </div>

      {/* Save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={handleSave} className="btn-primary" style={{ fontSize: 12, padding: '7px 18px' }}>
          {saved ? '✓ Gespeichert' : 'Speichern'}
        </button>
      </div>
    </div>
  )
}
