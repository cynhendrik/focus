import { useState, useCallback } from 'react'
import { useCompanyStore } from '@/store/company.store'
import type { CompanyModules } from '@/types/company.types'
import { Users, CreditCard, Mail, Calendar, Megaphone, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface ModuleDef {
  key:       keyof CompanyModules
  label:     string
  description: string
  icon:      LucideIcon
  color:     string
  defaultOn: boolean
}

const MODULES: ModuleDef[] = [
  {
    key: 'crm',
    label: 'CRM System',
    description: 'Kundenverwaltung, Pipeline, Deals, Follow-Ups und Lead-Verwaltung.',
    icon: Users, color: 'oklch(60% 0.18 240)', defaultOn: true,
  },
  {
    key: 'finanzen',
    label: 'Finanzen',
    description: 'Rechnungen, Angebote, Zahlungsstatus und wiederkehrende Verträge.',
    icon: CreditCard, color: 'oklch(65% 0.18 140)', defaultOn: true,
  },
  {
    key: 'mail',
    label: 'Mail',
    description: 'IMAP/SMTP-Postfach direkt in der App — empfangen, senden, zuordnen.',
    icon: Mail, color: 'oklch(60% 0.15 260)', defaultOn: true,
  },
  {
    key: 'kalender',
    label: 'Kalender',
    description: 'Termine und Meetings verwalten, mit Aufgaben verknüpfen.',
    icon: Calendar, color: 'oklch(65% 0.16 200)', defaultOn: true,
  },
  // Kampagnen vorerst ausgeblendet (späteres Marketing-Tool im SaaS) — Modul/Code bleiben liegen.
  // {
  //   key: 'kampagnen',
  //   label: 'Kampagnen',
  //   description: 'Serienmail-Kampagnen an Kundensegmente planen und versenden.',
  //   icon: Megaphone, color: 'oklch(62% 0.18 320)', defaultOn: false,
  // },
  {
    key: 'corra',
    label: 'KORA KI',
    description: 'KI-Assistent für Analysen, Triage und Aktionen. Benötigt Anthropic API-Key.',
    icon: Sparkles, color: 'var(--accent)', defaultOn: false,
  },
]

function Toggle({ on, saving }: { on: boolean; saving: boolean }) {
  return (
    <div style={{
      width: 44, height: 24, borderRadius: 99, flexShrink: 0,
      background: on ? 'var(--accent)' : 'oklch(50% 0 0 / 0.18)',
      position: 'relative', transition: 'background 200ms',
      opacity: saving ? 0.6 : 1,
      boxShadow: on ? '0 0 0 3px var(--accent-soft)' : undefined,
    }}>
      <span style={{
        position: 'absolute', top: 3,
        left: on ? 23 : 3,
        width: 18, height: 18, borderRadius: 99,
        background: on ? 'var(--accent-ink)' : 'oklch(70% 0 0)',
        transition: 'left 180ms cubic-bezier(.4,0,.2,1)',
        boxShadow: '0 1px 4px oklch(0% 0 0 / 0.2)',
      }} />
    </div>
  )
}

export function ModuleSettings() {
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
    <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>Module</h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
          Deaktivierte Module werden sofort aus der Navigation ausgeblendet.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {MODULES.map(mod => {
          const Icon      = mod.icon
          const on        = isOn(mod.key, mod.defaultOn)
          const isSaving  = saving === mod.key

          return (
            <div
              key={mod.key}
              onClick={() => handleToggle(mod.key, mod.defaultOn)}
              style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '16px 20px', borderRadius: 14, cursor: 'pointer',
                background: 'var(--surface-2)',
                border: `1px solid ${on ? 'var(--border)' : 'oklch(50% 0 0 / 0.07)'}`,
                opacity: on ? 1 : 0.55,
                transition: 'opacity 220ms, border-color 220ms',
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: on ? `${mod.color}18` : 'oklch(50% 0 0 / 0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 220ms',
              }}>
                <Icon size={20} style={{ color: on ? mod.color : 'var(--fg-dim)', transition: 'color 220ms' }} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', marginBottom: 3 }}>
                  {mod.label}
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
                  {mod.description}
                </p>
              </div>

              <Toggle on={on} saving={isSaving} />
            </div>
          )
        })}
      </div>

      <p style={{ fontSize: 11, color: 'var(--fg-dim)', margin: 0 }}>
        Änderungen werden sofort wirksam.
      </p>
    </div>
  )
}
