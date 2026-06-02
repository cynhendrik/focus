import { useState, useCallback } from 'react'
import { useCompanyStore } from '@/store/company.store'
import type { CompanyModules } from '@/types/company.types'
import {
  Users, CreditCard, Mail, Calendar, Target,
  Megaphone, Zap, Sparkles, LockKeyhole,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface ModuleDef {
  key: keyof CompanyModules
  label: string
  description: string
  icon: LucideIcon
  color: string
  badge?: 'lizenz' | 'beta' | 'ki' | 'addon'
  defaultOn: boolean
}

const SECTIONS: { section: string; items: ModuleDef[] }[] = [
  {
    section: 'Kern',
    items: [
      {
        key: 'crm',
        label: 'CRM System',
        description: 'Kundenverwaltung, Pipeline, Deals und Follow-Ups. Kernmodul der Plattform.',
        icon: Users,
        color: 'oklch(60% 0.18 240)',
        badge: 'lizenz',
        defaultOn: true,
      },
      {
        key: 'finanzen',
        label: 'Finanzen',
        description: 'Rechnungen, Angebote, Zahlungsstatus und automatische Mahnungen.',
        icon: CreditCard,
        color: 'oklch(65% 0.18 140)',
        badge: 'lizenz',
        defaultOn: true,
      },
      {
        key: 'focus',
        label: 'Focus-Modus',
        description: 'Priorisiertes Abarbeiten des Tages ohne Ablenkung.',
        icon: Zap,
        color: 'var(--accent)',
        defaultOn: true,
      },
    ],
  },
  {
    section: 'Kommunikation',
    items: [
      {
        key: 'mail',
        label: 'E-Mail Integration',
        description: 'IMAP/SMTP-Postfach direkt in der App — empfangen, senden, zuordnen.',
        icon: Mail,
        color: 'oklch(60% 0.15 260)',
        defaultOn: true,
      },
      {
        key: 'kalender',
        label: 'Kalender',
        description: 'Termine und Meetings verwalten, mit Aufgaben verknüpfen.',
        icon: Calendar,
        color: 'oklch(65% 0.16 200)',
        defaultOn: true,
      },
    ],
  },
  {
    section: 'Erweiterungen',
    items: [
      {
        key: 'leads',
        label: 'Lead Management',
        description: 'Neue Interessenten erfassen, qualifizieren und in Kunden umwandeln.',
        icon: Target,
        color: 'oklch(68% 0.2 50)',
        badge: 'addon',
        defaultOn: true,
      },
      {
        key: 'kampagnen',
        label: 'E-Mail Kampagnen',
        description: 'Serienmail-Kampagnen an Kundensegmente planen und versenden.',
        icon: Megaphone,
        color: 'oklch(62% 0.18 320)',
        badge: 'addon',
        defaultOn: false,
      },
    ],
  },
  {
    section: 'KI & Automatisierung',
    items: [
      {
        key: 'corra',
        label: 'CORRA KI',
        description: 'Entwürfe, Analysen und Antworten per KI. Benötigt Anthropic API-Key in den Entwickler-Einstellungen.',
        icon: Sparkles,
        color: 'var(--accent)',
        badge: 'ki',
        defaultOn: false,
      },
    ],
  },
]

const BADGE_CONFIG = {
  lizenz: { label: 'Lizenzpflichtig', bg: 'oklch(60% 0.18 240 / 0.12)', color: 'oklch(60% 0.18 240)' },
  beta:   { label: 'Beta',            bg: 'oklch(65% 0.18 50 / 0.12)',   color: 'oklch(65% 0.18 50)'  },
  ki:     { label: 'KI',              bg: 'var(--accent-soft)',           color: 'var(--accent)'        },
  addon:  { label: 'Add-on',          bg: 'oklch(50% 0 0 / 0.08)',        color: 'var(--fg-muted)'      },
}

function Toggle({ on, onChange, saving }: { on: boolean; onChange: () => void; saving?: boolean }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={saving}
      aria-checked={on}
      role="switch"
      style={{
        width: 44, height: 24, borderRadius: 99, flexShrink: 0,
        background: on ? 'var(--accent)' : 'oklch(50% 0 0 / 0.18)',
        border: 'none', cursor: saving ? 'wait' : 'pointer',
        position: 'relative', transition: 'background 200ms',
        boxShadow: on ? '0 0 0 3px var(--accent-soft)' : undefined,
        opacity: saving ? 0.6 : 1,
      }}
    >
      <span style={{
        position: 'absolute', top: 3,
        left: on ? 23 : 3,
        width: 18, height: 18, borderRadius: 99,
        background: on ? 'var(--accent-ink)' : 'oklch(70% 0 0)',
        transition: 'left 180ms cubic-bezier(.4,0,.2,1)',
        boxShadow: '0 1px 4px oklch(0% 0 0 / 0.2)',
      }} />
    </button>
  )
}

export function IntegrationenSettings() {
  const modules     = useCompanyStore(s => s.modules)
  const saveModules = useCompanyStore(s => s.saveModules)
  const [saving, setSaving] = useState<keyof CompanyModules | null>(null)

  const isOn = useCallback((key: keyof CompanyModules, defaultOn: boolean): boolean => {
    const val = modules[key]
    return val === undefined ? defaultOn : !!val
  }, [modules])

  const handleToggle = async (key: keyof CompanyModules, defaultOn: boolean) => {
    if (saving) return
    setSaving(key)
    try {
      await saveModules({ ...modules, [key]: !isOn(key, defaultOn) })
    } finally {
      setSaving(null)
    }
  }

  return (
    <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 40 }}>
      <div>
        <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>
          Module & Integrationen
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
          Aktiviere nur was du brauchst. Deaktivierte Module werden aus der Navigation ausgeblendet und sofort wirksam.
        </p>
      </div>

      {SECTIONS.map(({ section, items }) => (
        <div key={section}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--fg-dim)',
            fontFamily: 'var(--font-mono)', marginBottom: 12,
          }}>
            {section}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(mod => {
              const Icon  = mod.icon
              const on    = isOn(mod.key, mod.defaultOn)
              const badge = mod.badge ? BADGE_CONFIG[mod.badge] : null
              const isSaving = saving === mod.key

              return (
                <div
                  key={mod.key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    padding: '16px 20px',
                    background: 'var(--surface-2)',
                    border: `1px solid ${on ? 'var(--border)' : 'oklch(50% 0 0 / 0.07)'}`,
                    borderRadius: 14,
                    opacity: on ? 1 : 0.55,
                    transition: 'opacity 220ms, border-color 220ms',
                    cursor: isSaving ? 'wait' : undefined,
                  }}
                >
                  {/* Icon */}
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                    background: on ? `${mod.color}18` : 'oklch(50% 0 0 / 0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 220ms',
                  }}>
                    <Icon
                      size={20}
                      style={{ color: on ? mod.color : 'var(--fg-dim)', transition: 'color 220ms' }}
                    />
                  </div>

                  {/* Text */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>
                        {mod.label}
                      </span>
                      {badge && (
                        <span style={{
                          fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em',
                          textTransform: 'uppercase', fontFamily: 'var(--font-mono)',
                          padding: '2px 7px', borderRadius: 99,
                          background: badge.bg, color: badge.color,
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                          {mod.badge === 'lizenz' && <LockKeyhole size={8} />}
                          {badge.label}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
                      {mod.description}
                    </p>
                  </div>

                  {/* Toggle */}
                  <Toggle
                    on={on}
                    onChange={() => handleToggle(mod.key, mod.defaultOn)}
                    saving={isSaving}
                  />
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <p style={{ fontSize: 11, color: 'var(--fg-dim)', margin: 0, lineHeight: 1.6 }}>
        Lizenzpflichtige Module erfordern einen aktiven Plan. Alle anderen Module sind kostenlos verfügbar.
        Einstellungen werden sofort im gesamten Workspace wirksam.
      </p>
    </div>
  )
}
