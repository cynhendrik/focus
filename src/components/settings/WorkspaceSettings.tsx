import { useState, useEffect } from 'react'
import { Check, Copy } from 'lucide-react'
import { useCompanyStore } from '@/store/company.store'
import { useUiStore } from '@/store/ui.store'
import type { CompanyProfile } from '@/types/company.types'
import { InvoiceNumberSettings } from './InvoiceNumberSettings'
import { buildSignatureFromProfile } from '@/lib/mail-signature'
import { JoinCodeRow } from '@/core/workspace/JoinCodeRow'
import { MembersSettings } from '@/components/workspace/MembersSettings'
import { ShareWorkspaceButton } from '@/components/workspace/ShareWorkspaceButton'
import { SettingsPage, SettingCard, FieldRow, AuroraToggle } from './ui'
import { bankNameFromIban } from '@/lib/banking/iban'

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <FieldRow label={label}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input readOnly value={value} style={{
          flex: 1, padding: '8px 12px', fontSize: 12,
          borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
          background: 'var(--surface-2)', color: 'var(--fg-dim)',
          outline: 'none', fontFamily: 'var(--font-mono)',
        }} />
        <button
          onClick={copy}
          style={{
            padding: '0 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
            background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--fg-muted)',
            display: 'flex', alignItems: 'center',
          }}
        >
          {copied ? <Check size={14} style={{ color: 'var(--ok)' }} /> : <Copy size={14} />}
        </button>
      </div>
    </FieldRow>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <FieldRow label={label}>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          padding: '8px 12px', fontSize: 13, borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)', background: 'var(--surface-2)',
          color: 'var(--fg)', outline: 'none', fontFamily: 'inherit', width: '100%',
          boxSizing: 'border-box' as const,
        }}
      />
    </FieldRow>
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

  const handleIbanChange = (iban: string) => {
    setForm(p => ({ ...p, iban }))
    bankNameFromIban(iban).then(name => {
      if (name) setForm(p => ({ ...p, bankName: p.bankName?.trim() ? p.bankName : name }))
    }).catch(() => {/* ignore */})
  }

  const handleSave = async () => {
    await saveProfile(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <SettingsPage title="Unternehmen" subtitle="Firmendaten, Rechnungsdesign und Erscheinungsbild" maxWidth={600}>

      {/* Workspace */}
      <SettingCard style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Field label="Unternehmensname" value={val('name')} onChange={f('name')} placeholder="Muster GmbH" />
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <CopyField label="Workspace ID" value={workspaceId} />
          <ShareWorkspaceButton />
          <JoinCodeRow />
          <MembersSettings />
        </div>
      </SettingCard>

      {/* Company Profile */}
      <SettingCard style={{ padding: 0, overflow: 'hidden' }}>
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
            <Field label="IBAN" value={val('iban')} onChange={handleIbanChange} placeholder="DE89 3704 0044 ..." />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="BIC" value={val('bic')} onChange={f('bic')} placeholder="COBADEFFXXX" />
            <Field label="Bankname" value={val('bankName')} onChange={f('bankName')} placeholder="Commerzbank AG" />
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-dim)', letterSpacing: '0.05em', textTransform: 'uppercase', paddingTop: 4 }}>Rechtliches</div>
          <Field label="Geschäftsführer" value={val('geschaeftsfuehrer')} onChange={f('geschaeftsfuehrer')} placeholder="Max Mustermann" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Handelsregister" value={val('handelsregister')} onChange={f('handelsregister')} placeholder="HRB 12345" />
            <Field label="Registergericht" value={val('registergericht')} onChange={f('registergericht')} placeholder="Amtsgericht Berlin-Charlottenburg" />
          </div>
          <div
            onClick={() => setForm(p => ({ ...p, kleinunternehmer: !p.kleinunternehmer }))}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              border: `1px solid ${form.kleinunternehmer ? 'var(--accent)' : 'var(--border)'}`,
              background: form.kleinunternehmer ? 'oklch(68% 0.16 41 / 0.06)' : 'var(--surface-2)',
              transition: 'all 180ms',
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>§19 UStG Kleinunternehmer</div>
              <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>Keine Mehrwertsteuer auf Rechnungen ausweisen</div>
            </div>
            <AuroraToggle on={form.kleinunternehmer ?? false} onChange={() => setForm(p => ({ ...p, kleinunternehmer: !p.kleinunternehmer }))} />
          </div>
        </div>
      </SettingCard>

      {/* Mahngebühren */}
      <SettingCard style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Mahngebühren</div>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 1 }}>Gestaffelt je Mahnstufe (Euro)</div>
        </div>
        <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {['Zahlungserinnerung', '1. Mahnung', '2. Mahnung'].map((lbl, i) => (
            <Field
              key={i}
              label={lbl}
              value={String((form.dunningFees ?? [0, 5, 10])[i] ?? 0)}
              onChange={(v) => setForm(p => {
                const next = [...(p.dunningFees ?? [0, 5, 10])]
                const n = Number(v)
                next[i] = v === '' || Number.isNaN(n) ? 0 : n
                return { ...p, dunningFees: next }
              })}
              placeholder="0"
            />
          ))}
        </div>
      </SettingCard>

      {/* E-Mail-Signatur */}
      <SettingCard style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>E-Mail-Signatur</div>
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 1 }}>Wird automatisch an neue Mails gehängt (editierbar pro Mail)</div>
          </div>
          <button
            type="button"
            onClick={() => setForm(p => ({ ...p, emailSignature: buildSignatureFromProfile(p) }))}
            style={{
              flexShrink: 0, height: 30, padding: '0 12px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--fg)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}
          >
            Aus Firmenprofil übernehmen
          </button>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <textarea
            value={form.emailSignature ?? ''}
            onChange={e => setForm(p => ({ ...p, emailSignature: e.target.value }))}
            rows={7}
            placeholder={'Mit freundlichen Grüßen\n\nMuster GmbH\n…'}
            style={{
              width: '100%', resize: 'vertical', boxSizing: 'border-box',
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 14px', color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.6,
              outline: 'none',
            }}
          />
        </div>
      </SettingCard>

      <InvoiceNumberSettings />

      {/* Rechnungsdesign */}
      <SettingCard style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Rechnungsdesign</div>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 1 }}>Logo und Farbe für Rechnungen &amp; Angebote</div>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Logo */}
          <FieldRow label="Logo" hint="PNG oder SVG empfohlen, max. 1 MB">
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
                  padding: '7px 14px', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 600,
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
                      padding: '7px 14px', borderRadius: 'var(--radius-sm)', fontSize: 12,
                      border: '1px solid var(--border)', background: 'transparent',
                      color: 'var(--fg-dim)', cursor: 'pointer',
                    }}
                  >
                    Entfernen
                  </button>
                )}
              </div>
            </div>
          </FieldRow>

          {/* Akzentfarbe */}
          <FieldRow label="Akzentfarbe">
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
          </FieldRow>

        </div>
      </SettingCard>

      {/* Erscheinungsbild */}
      <SettingCard style={{ padding: 0, overflow: 'hidden' }}>
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
          <AuroraToggle on={theme === 'dark'} onChange={toggleTheme} />
        </div>
      </SettingCard>

      {/* Save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={handleSave} className="btn-primary" style={{ fontSize: 12, padding: '7px 18px' }}>
          {saved ? '✓ Gespeichert' : 'Speichern'}
        </button>
      </div>
    </SettingsPage>
  )
}
