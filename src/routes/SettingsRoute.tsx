import { useEffect, useRef, useState } from 'react'
import { useUiStore } from '@/store/ui.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useCompanyStore } from '@/store/company.store'
import type { CompanyProfile, CompanyModules } from '@/types/company.types'
import { Check, Copy } from 'lucide-react'

const SUPABASE_URL    = import.meta.env.VITE_SUPABASE_URL as string | undefined
const WEBHOOK_SECRET  = import.meta.env.VITE_LEAD_WEBHOOK_SECRET as string | undefined

const MODULE_LABELS: Record<keyof CompanyModules, string> = {
  sales: 'Sales',
  crm: 'CRM', mail: 'Mail-Client', instagram: 'Instagram',
  focusAi: 'FOCUS AI', zeiterfassung: 'Zeiterfassung',
}

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)', fontWeight: 600 }}>
        {title}
      </div>
      {hint && <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 3 }}>{hint}</div>}
    </div>
  )
}

function Field({ label, value, onChange, placeholder, textarea, type }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; textarea?: boolean; type?: string
}) {
  const common: React.CSSProperties = {
    width: '100%', padding: '8px 12px', fontSize: 13,
    borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--surface-2)', color: 'var(--fg)',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
    transition: 'border-color 120ms',
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', letterSpacing: '0.04em' }}>
        {label}
      </label>
      {textarea
        ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3}
            style={{ ...common, resize: 'vertical' }} />
        : <input type={type ?? 'text'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
            style={common} />
      }
    </div>
  )
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {children}
    </div>
  )
}

function CopyField({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', letterSpacing: '0.04em' }}>{label}</label>
      <div style={{ display: 'flex', gap: 6 }}>
        <input readOnly value={url} style={{
          flex: 1, padding: '8px 12px', fontSize: 12, borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--surface-2)',
          color: 'var(--fg-dim)', outline: 'none', fontFamily: 'var(--font-mono)',
        }} />
        <button className="icon-btn glass" onClick={copy} title="Kopieren">
          {copied ? <Check size={14} style={{ color: 'var(--ok)' }} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  )
}

export function SettingsRoute() {
  const theme = useUiStore(s => s.theme)
  const toggleTheme = useUiStore(s => s.toggleTheme)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId)

  const { profile, modules, load, saveProfile, saveModules } = useCompanyStore()
  const [form, setForm] = useState<CompanyProfile>({})
  const [saved, setSaved] = useState(false)
  const [taxModel, setTaxModel] = useState<'regelbesteuerung' | 'kleinunternehmer' | 'other'>('regelbesteuerung')

  const logoInputRef = useRef<HTMLInputElement>(null)

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 300 * 1024) {
      alert('Logo ist zu groß (max. 300 KB). Bitte ein kleineres Bild wählen.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setForm(p => ({ ...p, logoBase64: reader.result as string }))
    }
    reader.readAsDataURL(file)
  }

  const handleLogoRemove = () => {
    setForm(p => ({ ...p, logoBase64: undefined }))
    if (logoInputRef.current) logoInputRef.current.value = ''
  }

  useEffect(() => { load() }, [load])
  useEffect(() => {
    setForm(profile)
    setTaxModel(profile.kleinunternehmer ? 'kleinunternehmer' : 'regelbesteuerung')
  }, [profile])

  const f = (key: keyof CompanyProfile) => (v: string) => setForm(p => ({ ...p, [key]: v }))
  const val = (key: keyof CompanyProfile) => (form[key] as string) ?? ''

  const handleSave = async () => {
    await saveProfile(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2200)
  }

  const loadDemoProfile = async () => {
    const demo: CompanyProfile = {
      name:              'Cynera Media GmbH',
      address:           'Friedrichstraße 12, 10117 Berlin',
      email:             'hallo@cynera.de',
      phone:             '+49 30 12345678',
      website:           'https://cynera.de',
      taxId:             'DE123456789',
      steuernummer:      '30/456/78901',
      iban:              'DE89 3704 0044 0532 0130 00',
      bankName:          'Commerzbank AG',
      handelsregister:   'HRB 234567',
      registergericht:   'Amtsgericht Berlin-Charlottenburg',
      geschaeftsfuehrer: 'Hendrik Weber',
      invoiceIntro:      'Vielen Dank für Ihr Vertrauen. Wir stellen Ihnen folgende Leistungen in Rechnung:',
      kleinunternehmer:  false,
      zahlungszielTage:  14,
      leistungszeitpunkt: 'rechnungsdatum',
    }
    await saveProfile(demo)
    setForm(demo)
    setTaxModel('regelbesteuerung')
    setSaved(true)
    setTimeout(() => setSaved(false), 2200)
  }

  const toggleModule = (key: keyof CompanyModules) => {
    saveModules({ ...modules, [key]: !modules[key] })
  }

  const secretMissing = !WEBHOOK_SECRET
  const base   = SUPABASE_URL ?? ''
  const secret = WEBHOOK_SECRET ?? ''
  const wid    = workspaceId ?? ''

  return (
    <div className="main-inner" style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 720 }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="greeting-title" style={{ margin: 0 }}>Einstellungen<em>.</em></h1>
        <button onClick={loadDemoProfile} style={{
          fontSize: 11, padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
          background: 'oklch(92% 0.2 125 / 0.15)', border: '1px solid oklch(75% 0.2 125 / 0.4)',
          color: 'oklch(38% 0.15 125)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
          fontWeight: 600,
        }}>
          ⚡ Demo-Profil laden
        </button>
      </div>

      {/* ── Unternehmensangaben ─────────────────────────────────────────────── */}
      <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <SectionHeader title="Unternehmensangaben" hint="Erscheinen auf Rechnungen und Angeboten (§14 UStG)" />
        <FieldGrid>
          <Field label="Firmenname *"      value={val('name')}    onChange={f('name')}    placeholder="Cynera GmbH" />
          <Field label="E-Mail"            value={val('email')}   onChange={f('email')}   placeholder="info@cynera.de" />
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Anschrift *"     value={val('address')} onChange={f('address')} placeholder="Musterstraße 1, 12345 Berlin" />
          </div>
          <Field label="Telefon"           value={val('phone')}   onChange={f('phone')}   placeholder="+49 30 12345678" />
          <Field label="Website"           value={val('website')} onChange={f('website')} placeholder="https://cynera.de" />
        </FieldGrid>
      </div>

      {/* ── Steuermodell ────────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <SectionHeader title="Steuermodell" hint="Bestimmt die Rechnungslogik für alle neuen Rechnungen" />

        {/* Steuermodell dropdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <select
            value={taxModel}
            onChange={e => {
              const v = e.target.value as typeof taxModel
              setTaxModel(v)
              setForm(p => ({ ...p, kleinunternehmer: v === 'kleinunternehmer' }))
            }}
            style={{ padding: '10px 14px', fontSize: 13, borderRadius: 10, border: `2px solid ${taxModel === 'kleinunternehmer' ? 'var(--accent)' : 'var(--border)'}`, background: 'var(--surface-2)', color: 'var(--fg)', outline: 'none', boxSizing: 'border-box' as const, cursor: 'pointer', transition: 'border-color 150ms' }}
          >
            <option value="regelbesteuerung">Regelbesteuerung</option>
            <option value="kleinunternehmer">Kleinunternehmer (§19 UStG)</option>
            <option value="other">Sonstiges</option>
          </select>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5, paddingLeft: 2 }}>
            {taxModel === 'kleinunternehmer'
              ? 'Keine MwSt auf Rechnungen. Automatischer Hinweis gem. §19 UStG wird auf jede Rechnung gedruckt.'
              : taxModel === 'other'
              ? 'Regelbesteuerung wird angewendet. MwSt 19 % / 7 % je nach Position.'
              : 'Standard-Umsatzsteuer mit 19 % / 7 % MwSt.'}
          </div>
        </div>

        <FieldGrid>
          <Field label="Steuernummer" value={val('steuernummer')} onChange={f('steuernummer')} placeholder="123/456/78901" />
          <Field label="USt-IdNr." value={val('taxId')} onChange={f('taxId')} placeholder="DE123456789" />
          <Field label="Zahlungsziel (Tage)" value={String(form.zahlungszielTage ?? 14)} onChange={v => setForm(p => ({ ...p, zahlungszielTage: parseInt(v) || 14 }))} placeholder="14" type="number" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', letterSpacing: '0.04em' }}>Leistungszeitpunkt</label>
            <select value={form.leistungszeitpunkt ?? 'rechnungsdatum'} onChange={e => setForm(p => ({ ...p, leistungszeitpunkt: e.target.value as 'rechnungsdatum' | 'monatsende' }))}
              style={{ padding: '8px 12px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)', outline: 'none', boxSizing: 'border-box' as const }}>
              <option value="rechnungsdatum">Rechnungsdatum</option>
              <option value="monatsende">Ende des Monats</option>
            </select>
          </div>
        </FieldGrid>
      </div>

      {/* ── Steuer & Rechtliches ────────────────────────────────────────────── */}
      <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <SectionHeader title="Steuer & Rechtliches" hint="Pflichtangaben für korrekte Rechnungsstellung" />
        <FieldGrid>
          <Field label="Handelsregisternummer" value={val('handelsregister')}   onChange={f('handelsregister')}  placeholder="HRB 12345" />
          <Field label="Registergericht"       value={val('registergericht')}   onChange={f('registergericht')}  placeholder="Amtsgericht München" />
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Geschäftsführer"     value={val('geschaeftsfuehrer')} onChange={f('geschaeftsfuehrer')} placeholder="Max Mustermann" />
          </div>
        </FieldGrid>
      </div>

      {/* ── Bankverbindung ──────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <SectionHeader title="Bankverbindung" hint="Standard-Bankdaten für neue Rechnungen" />
        <FieldGrid>
          <Field label="IBAN" value={val('iban')}     onChange={f('iban')}     placeholder="DE89 3704 0044 0532 0130 00" />
          <Field label="Bank" value={val('bankName')} onChange={f('bankName')} placeholder="Commerzbank AG" />
        </FieldGrid>
      </div>

      {/* ── Rechnungstext ───────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <SectionHeader title="Rechnungstext" hint="Optionaler Einleitungstext auf jeder Rechnung" />
        <Field
          label="Einleitungstext (optional)"
          value={val('invoiceIntro')}
          onChange={f('invoiceIntro')}
          textarea
          placeholder="Vielen Dank für Ihr Vertrauen. Wir stellen Ihnen folgende Leistungen in Rechnung:"
        />
      </div>

      {/* ── Firmenlogo ─────────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SectionHeader title="Firmenlogo" hint="Erscheint oben rechts auf Rechnungen und Angeboten (PNG/JPG/SVG, max. 300 KB)" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Vorschau */}
          <div style={{
            width: 48, height: 48, borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--surface-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', flexShrink: 0,
          }}>
            {form.logoBase64
              ? <img src={form.logoBase64} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg-dim)' }}>
                  {(form.name ?? 'U').slice(0, 1).toUpperCase()}
                </span>
            }
          </div>
          {/* Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              className="btn-ghost"
              onClick={() => logoInputRef.current?.click()}
              style={{ fontSize: 12, padding: '5px 12px' }}
            >
              Logo hochladen
            </button>
            {form.logoBase64 && (
              <button
                onClick={handleLogoRemove}
                style={{ fontSize: 11, color: 'var(--fg-dim)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
              >
                Entfernen
              </button>
            )}
          </div>
        </div>
        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          onChange={handleLogoUpload}
          style={{ display: 'none' }}
        />
      </div>

      {/* Save button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn-primary" onClick={handleSave}>Speichern</button>
        {saved && (
          <span style={{ fontSize: 12, color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Check size={13} /> Gespeichert
          </span>
        )}
      </div>

      {/* ── Module ──────────────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SectionHeader title="Module" />
        {(Object.keys(MODULE_LABELS) as (keyof CompanyModules)[]).map(key => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={!!modules[key]} onChange={() => toggleModule(key)}
              style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer' }} />
            <span>{MODULE_LABELS[key]}</span>
          </label>
        ))}
      </div>

      {/* ── Leads & Integrationen ────────────────────────────────────────────── */}
      <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SectionHeader title="Leads & Integrationen" hint="Webhook-URLs für externe Lead-Quellen (Zoom, Wix, Zapier)" />
        {secretMissing
          ? <span style={{ fontSize: 12, color: 'var(--warn)' }}>VITE_LEAD_WEBHOOK_SECRET nicht konfiguriert</span>
          : (
            <>
              <CopyField label="Zoom Webhook URL"                    url={`${base}/functions/v1/lead-intake?workspace_id=${wid}&secret=${secret}&source=zoom`} />
              <CopyField label="Generic Webhook URL (Wix, Zapier)"   url={`${base}/functions/v1/lead-intake?workspace_id=${wid}&secret=${secret}&source=generic`} />
            </>
          )
        }
      </div>

      {/* ── App-Info ────────────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Theme</div>
          <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 2 }}>{theme === 'dark' ? 'Dunkel' : 'Hell'}</div>
        </div>
        <button className="btn-ghost" onClick={toggleTheme}>
          {theme === 'dark' ? '☀ Hell' : '🌙 Dunkel'}
        </button>
      </div>

      <div style={{ paddingBottom: 32, fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
        Cynera Focus · v2.0.0
      </div>
    </div>
  )
}
