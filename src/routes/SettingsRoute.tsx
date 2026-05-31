import { useEffect, useRef, useState } from 'react'
import { useUiStore } from '@/store/ui.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useCompanyStore } from '@/store/company.store'
import type { CompanyProfile, CompanyModules } from '@/types/company.types'
import { Check, Copy, TrendingUp, Users, Mail, Share2, Sparkles, Clock, Zap, Bot, Eye, EyeOff } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Switch } from '@/components/ui/Switch'
import { getApiKey, setApiKey, clearApiKey, getModel, setModel } from '@/lib/ai/briefing'

const SUPABASE_URL    = import.meta.env.VITE_SUPABASE_URL as string | undefined
const WEBHOOK_SECRET  = import.meta.env.VITE_LEAD_WEBHOOK_SECRET as string | undefined

interface ModuleDef {
  key: keyof CompanyModules
  label: string
  description: string
  icon: LucideIcon
}

const MODULE_DEFS: ModuleDef[] = [
  { key: 'sales',         label: 'Sales',         description: 'Leads, Pipeline und Deal-Tracking.',          icon: TrendingUp },
  { key: 'mail',          label: 'Mail-Client',   description: 'E-Mails direkt in Cynera verwalten.',         icon: Mail       },
  { key: 'instagram',     label: 'Social Media',  description: 'Instagram-Analyse und Reporting.',            icon: Share2     },
  { key: 'focusAi',       label: 'FOCUS AI',      description: 'KI-gestützte Analysen und Empfehlungen.',     icon: Sparkles   },
  { key: 'zeiterfassung', label: 'Zeiterfassung', description: 'Stunden erfassen und auswerten.',             icon: Clock      },
]

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

function ModuleCard({ def, on, onToggle }: { def: ModuleDef; on: boolean; onToggle: () => void }) {
  const Icon = def.icon
  return (
    <div style={{
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      borderRadius: 16, padding: '18px 20px',
      display: 'flex', flexDirection: 'column', gap: 14,
      transition: 'border-color 180ms ease, background 180ms ease',
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)' }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: on ? 'var(--accent-soft)' : 'oklch(50% 0 0 / 0.06)',
          border: `1px solid ${on ? 'var(--accent-soft)' : 'var(--border)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 220ms ease, border-color 220ms ease',
        }}>
          <Icon size={18} style={{ color: on ? 'var(--accent)' : 'var(--fg-muted)', transition: 'color 220ms ease' }} />
        </div>
        <Switch on={on} onToggle={onToggle} size="sm" />
      </div>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg)', marginBottom: 4, letterSpacing: '-0.005em' }}>{def.label}</div>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5 }}>{def.description}</div>
      </div>
    </div>
  )
}

function ModuleGrid({ modules, onToggle }: {
  modules: CompanyModules
  onToggle: (key: keyof CompanyModules) => void
}) {
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--fg)', letterSpacing: '-0.03em', marginBottom: 4 }}>
          Module
        </div>
        <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
          Aktiviere oder deaktiviere Funktionen für deinen Workspace
        </div>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 14,
      }}>
        {MODULE_DEFS.map(def => (
          <ModuleCard
            key={def.key}
            def={def}
            on={!!modules[def.key]}
            onToggle={() => onToggle(def.key)}
          />
        ))}
      </div>
    </div>
  )
}

function ProSection({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 20,
        padding: '24px 26px',
        background: on
          ? 'linear-gradient(135deg, var(--accent-soft), oklch(60% 0.18 235 / 0.08))'
          : 'var(--surface-2)',
        border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
        boxShadow: on
          ? '0 12px 36px -18px var(--accent-glow)'
          : 'none',
        overflow: 'hidden',
        transition: 'background 280ms ease, border-color 280ms ease, box-shadow 280ms ease',
      }}
    >
      {/* Glow Akzent rechts oben — nur sichtbar wenn aktiv */}
      <div
        style={{
          position: 'absolute', top: -40, right: -40,
          width: 180, height: 180, borderRadius: '50%',
          background: 'radial-gradient(circle, var(--accent-glow), transparent 70%)',
          opacity: on ? 0.4 : 0,
          transition: 'opacity 320ms ease',
          pointerEvents: 'none',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, position: 'relative' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', minWidth: 0 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: on ? 'var(--accent)' : 'oklch(50% 0 0 / 0.06)',
            border: `1px solid ${on ? 'transparent' : 'var(--border)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: on ? '0 6px 18px -8px var(--accent-glow)' : 'none',
            transition: 'all 240ms ease',
          }}>
            <Zap size={20} style={{ color: on ? 'var(--accent-ink)' : 'var(--fg-muted)', transition: 'color 220ms ease' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.015em' }}>
                Pro-Modus
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9.5,
                padding: '2px 7px', borderRadius: 99,
                background: on ? 'var(--accent)' : 'oklch(50% 0 0 / 0.1)',
                color: on ? 'var(--accent-ink)' : 'var(--fg-muted)',
                fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                transition: 'all 220ms ease',
              }}>
                {on ? 'aktiv' : 'optional'}
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.55 }}>
              Schaltet erweiterte Workspace-Features frei: <strong style={{ color: 'var(--fg-2)' }}>Kampagnen</strong> für Team-Outreach und <strong style={{ color: 'var(--fg-2)' }}>Automationen</strong> für wiederkehrende Workflows.
            </div>
          </div>
        </div>
        <Switch on={on} onToggle={onToggle} size="md" />
      </div>

      {on && (
        <div
          style={{
            marginTop: 18,
            padding: '14px 16px',
            borderRadius: 12,
            background: 'oklch(50% 0 0 / 0.04)',
            border: '1px solid oklch(50% 0 0 / 0.06)',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}
        >
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'var(--fg-dim)', fontWeight: 600,
          }}>
            Enthalten
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <ProFeatureItem icon="📣" label="Kampagnen" hint="Outreach im Team" />
            <ProFeatureItem icon="⚡" label="Automationen" hint="Trigger & Workflows" />
          </div>
        </div>
      )}
    </div>
  )
}

function ProFeatureItem({ icon, label, hint }: { icon: string; label: string; hint: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg)' }}>{label}</span>
        <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{hint}</span>
      </div>
    </div>
  )
}

const AI_MODELS: { id: string; label: string; hint: string }[] = [
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', hint: 'Schnell + günstig — empfohlen' },
  { id: 'claude-opus-4-7',   label: 'Opus 4.7',   hint: 'Maximale Qualität — etwas langsamer + teurer' },
  { id: 'claude-haiku-4-5',  label: 'Haiku 4.5',  hint: 'Sehr günstig — für einfache Zusammenfassungen' },
]

function AiSection() {
  const [keyInput, setKeyInput]     = useState('')
  const [hasKey, setHasKey]         = useState<boolean>(() => !!getApiKey())
  const [showInput, setShowInput]   = useState<boolean>(() => !getApiKey())
  const [reveal, setReveal]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [model, setModelState]      = useState<string>(() => getModel())

  useEffect(() => {
    if (hasKey) setKeyInput(getApiKey() ?? '')
    else        setKeyInput('')
  }, [hasKey])

  const handleSave = () => {
    const trimmed = keyInput.trim()
    if (!trimmed) return
    setApiKey(trimmed)
    setHasKey(true)
    setShowInput(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  const handleRemove = () => {
    clearApiKey()
    setHasKey(false)
    setKeyInput('')
    setShowInput(true)
  }

  const handleModel = (id: string) => {
    setModel(id)
    setModelState(id)
  }

  const masked = (key: string) => key ? `${key.slice(0, 8)}…${key.slice(-4)}` : ''

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 20,
        padding: '24px 26px',
        background: hasKey
          ? 'linear-gradient(135deg, oklch(60% 0.18 280 / 0.10), oklch(60% 0.16 235 / 0.06))'
          : 'var(--surface-2)',
        border: `1px solid ${hasKey ? 'oklch(60% 0.18 280 / 0.45)' : 'var(--border)'}`,
        boxShadow: hasKey
          ? '0 12px 36px -18px oklch(60% 0.18 280 / 0.5)'
          : 'none',
        overflow: 'hidden',
        transition: 'all 280ms ease',
      }}
    >
      <div style={{
        position: 'absolute', top: -40, right: -40,
        width: 180, height: 180, borderRadius: '50%',
        background: 'radial-gradient(circle, oklch(60% 0.18 280 / 0.35), transparent 70%)',
        opacity: hasKey ? 0.5 : 0,
        transition: 'opacity 320ms ease',
        pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, position: 'relative' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', minWidth: 0 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: hasKey ? 'oklch(60% 0.18 280)' : 'oklch(50% 0 0 / 0.06)',
            border: `1px solid ${hasKey ? 'transparent' : 'var(--border)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: hasKey ? '0 6px 18px -8px oklch(60% 0.18 280 / 0.6)' : 'none',
            transition: 'all 240ms ease',
          }}>
            <Bot size={20} style={{ color: hasKey ? '#fff' : 'var(--fg-muted)', transition: 'color 220ms ease' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.015em' }}>
                KI-Briefings
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9.5,
                padding: '2px 7px', borderRadius: 99,
                background: hasKey ? 'oklch(60% 0.18 280)' : 'oklch(50% 0 0 / 0.1)',
                color: hasKey ? '#fff' : 'var(--fg-muted)',
                fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                transition: 'all 220ms ease',
              }}>
                {hasKey ? 'aktiv' : 'nicht konfiguriert'}
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.55 }}>
              Claude erstellt aus den Kundendaten ein <strong style={{ color: 'var(--fg-2)' }}>30-Sekunden-Briefing</strong> vor jedem Call. Eigener API-Key erforderlich — Daten gehen direkt an Anthropic, nicht über Cynera-Server.
            </div>
          </div>
        </div>
      </div>

      {/* API Key Section */}
      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="card-label">API-Key</span>

        {hasKey && !showInput ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 12,
            background: 'oklch(50% 0 0 / 0.06)',
            border: '1px solid var(--border)',
          }}>
            <Check size={14} style={{ color: 'var(--ok)', flexShrink: 0 }} />
            <span style={{
              flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12,
              color: 'var(--fg-muted)', letterSpacing: '0.02em',
            }}>
              {reveal ? (getApiKey() ?? '') : masked(getApiKey() ?? '')}
            </span>
            <button onClick={() => setReveal(v => !v)} className="btn-ghost" style={{ fontSize: 11, padding: '5px 10px' }}>
              {reveal ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
            <button onClick={() => setShowInput(true)} className="btn-ghost" style={{ fontSize: 11, padding: '5px 10px' }}>
              Ändern
            </button>
            <button
              onClick={handleRemove}
              style={{
                fontSize: 11, padding: '5px 10px', borderRadius: 99,
                background: 'transparent', color: 'var(--danger)',
                border: '1px solid var(--border)', cursor: 'pointer',
              }}
            >
              Entfernen
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type={reveal ? 'text' : 'password'}
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              placeholder="sk-ant-api03-..."
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              style={{
                flex: 1, padding: '10px 14px', fontSize: 12.5,
                borderRadius: 12, border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--fg)',
                outline: 'none', fontFamily: 'var(--font-mono)',
                letterSpacing: '0.01em',
                transition: 'border-color 150ms',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'oklch(60% 0.18 280)' }}
              onBlur ={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
            />
            <button onClick={() => setReveal(v => !v)} className="btn-ghost" style={{ padding: '0 12px' }}>
              {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button
              onClick={handleSave}
              disabled={!keyInput.trim()}
              style={{
                padding: '10px 18px', borderRadius: 12,
                background: keyInput.trim() ? 'oklch(60% 0.18 280)' : 'oklch(50% 0 0 / 0.1)',
                color: keyInput.trim() ? '#fff' : 'var(--fg-dim)',
                fontSize: 13, fontWeight: 600,
                cursor: keyInput.trim() ? 'pointer' : 'not-allowed',
                border: 'none',
                transition: 'background 150ms',
              }}
            >
              Speichern
            </button>
          </div>
        )}

        {saved && (
          <span style={{ fontSize: 11.5, color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Check size={12} /> Gespeichert
          </span>
        )}

        <span style={{ fontSize: 11.5, color: 'var(--fg-dim)', lineHeight: 1.5 }}>
          Hol dir einen Key auf <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)' }}>console.anthropic.com</span> → API Keys. Wird nur lokal auf deinem Gerät gespeichert.
        </span>
      </div>

      {/* Model Selection */}
      {hasKey && (
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="card-label">Modell</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {AI_MODELS.map(m => {
              const active = model === m.id
              return (
                <button
                  key={m.id}
                  onClick={() => handleModel(m.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px', borderRadius: 12,
                    background: active ? 'oklch(60% 0.18 280 / 0.12)' : 'oklch(50% 0 0 / 0.04)',
                    border: `1px solid ${active ? 'oklch(60% 0.18 280 / 0.45)' : 'var(--border)'}`,
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'all 180ms ease',
                  }}
                >
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%',
                    background: active ? 'oklch(60% 0.18 280)' : 'transparent',
                    border: `2px solid ${active ? 'oklch(60% 0.18 280)' : 'var(--border-strong)'}`,
                    flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {active && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{m.label}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--fg-dim)', marginTop: 1 }}>{m.hint}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
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
      <ModuleGrid modules={modules} onToggle={toggleModule} />

      {/* ── Pro-Modus ───────────────────────────────────────────────────────── */}
      <ProSection on={!!modules.pro} onToggle={() => toggleModule('pro')} />

      {/* ── KI-Briefings (Claude API) ──────────────────────────────────────── */}
      <AiSection />

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
