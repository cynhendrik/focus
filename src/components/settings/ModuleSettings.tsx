import { useState, useCallback } from 'react'
import { useCompanyStore } from '@/store/company.store'
import type { CompanyModules } from '@/types/company.types'
import { Users, CreditCard, Mail, Calendar, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { SettingsPage, SettingRow, AuroraToggle } from './ui'

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
    <SettingsPage title="Module" subtitle="Deaktivierte Module verschwinden sofort aus der Navigation.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {MODULES.map(mod => {
          const Icon = mod.icon
          const on = isOn(mod.key, mod.defaultOn)
          const isSaving = saving === mod.key
          return (
            <SettingRow
              key={mod.key}
              icon={<Icon size={21} />}
              color={mod.color}
              title={mod.label}
              description={mod.description}
              dim={!on}
              onClick={() => handleToggle(mod.key, mod.defaultOn)}
              control={<AuroraToggle on={on} saving={isSaving} onChange={() => handleToggle(mod.key, mod.defaultOn)} />}
            />
          )
        })}
      </div>
      <p style={{ fontSize: 11, color: 'var(--fg-dim)', margin: 0 }}>Änderungen werden sofort wirksam.</p>
    </SettingsPage>
  )
}
