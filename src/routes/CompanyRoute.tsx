import { useEffect, useState } from 'react'
import { useCompanyStore } from '@/store/company.store'
import type { CompanyProfile, CompanyModules } from '@/types/company.types'

const MODULE_LABELS: Record<keyof CompanyModules, string> = {
  sales: 'Sales',
  mail: 'Mail-Client',
  instagram: 'Instagram',
  focusAi: 'FOCUS AI',
  zeiterfassung: 'Zeiterfassung',
  pro: 'Pro-Modus',
}

export function CompanyRoute() {
  const { profile, modules, load, saveProfile, saveModules } = useCompanyStore()
  const [form, setForm] = useState<CompanyProfile>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => { load() }, [])
  useEffect(() => { setForm(profile) }, [profile])

  const handleSaveProfile = async () => {
    await saveProfile(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const toggleModule = (key: keyof CompanyModules) => {
    saveModules({ ...modules, [key]: !modules[key] })
  }

  return (
    <div className="flex flex-col gap-8 max-w-2xl mx-auto p-6">
      <h1 className="text-xl font-semibold text-[var(--text)]">Mein Unternehmen</h1>

      {/* Profile */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wider">Unternehmensprofil</h2>
        <div className="grid grid-cols-2 gap-3">
          {(['name', 'address', 'phone', 'email', 'website', 'taxId'] as (keyof CompanyProfile)[]).map(field => (
            <input
              key={field}
              placeholder={fieldLabel(field)}
              value={(form[field] as string) ?? ''}
              onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
              className="text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
            />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveProfile}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark"
          >
            Speichern
          </button>
          {saved && <span className="text-sm text-green-500">Gespeichert ✓</span>}
        </div>
      </section>

      {/* Modules */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wider">Module</h2>
        <div className="flex flex-col gap-2">
          {(Object.keys(MODULE_LABELS) as (keyof CompanyModules)[]).map(key => (
            <label key={key} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--bg1)] cursor-pointer">
              <input
                type="checkbox"
                checked={!!modules[key]}
                onChange={() => toggleModule(key)}
                className="accent-primary w-4 h-4"
              />
              <span className="text-sm text-[var(--text)]">{MODULE_LABELS[key]}</span>
            </label>
          ))}
        </div>
      </section>
    </div>
  )
}

function fieldLabel(field: keyof CompanyProfile): string {
  const labels: Partial<Record<keyof CompanyProfile, string>> = {
    name: 'Firmenname', address: 'Adresse', phone: 'Telefon',
    email: 'E-Mail', website: 'Website', taxId: 'USt-IdNr.',
    iban: 'IBAN', bic: 'BIC', bankName: 'Bank',
  }
  return labels[field] ?? String(field)
}
