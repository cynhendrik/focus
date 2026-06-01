import { useState, useEffect } from 'react'
import { Check, Copy } from 'lucide-react'
import { useCompanyStore } from '@/store/company.store'
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
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Workspace</h2>
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: 0 }}>Workspace- und Unternehmenseinstellungen</p>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              id="kleinunternehmer"
              checked={!!form.kleinunternehmer}
              onChange={e => setForm(p => ({ ...p, kleinunternehmer: e.target.checked }))}
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="kleinunternehmer" style={{ fontSize: 13, color: 'var(--fg)', cursor: 'pointer' }}>
              Kleinunternehmer (§19 UStG) — keine Mehrwertsteuer auf Rechnungen
            </label>
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
