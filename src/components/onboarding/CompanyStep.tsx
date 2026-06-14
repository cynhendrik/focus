import { useState } from 'react'
import { Building2, ArrowRight } from 'lucide-react'
import { useCompanyStore } from '@/store/company.store'
import { useOnboardingStore } from '@/store/onboarding.store'
import type { CompanyProfile } from '@/types/company.types'

/**
 * Erster Schritt nach dem Willkommen: die eigenen Unternehmensdaten erfassen.
 * Deckt alle Felder ab, die in Rechnungen/Angeboten auftauchen (Absender,
 * Steuer, Bank, Rechtliches). Speichert über `useCompanyStore.saveProfile`;
 * „Überspringen" geht auch.
 */
export function CompanyStep() {
  const welcomeSeen     = useOnboardingStore(s => s.welcomeSeen)
  const companyDone     = useOnboardingStore(s => s.companyDone)
  const markCompanyDone = useOnboardingStore(s => s.markCompanyDone)
  const profile         = useCompanyStore(s => s.profile)
  const saveProfile     = useCompanyStore(s => s.saveProfile)

  const [form, setForm]   = useState<CompanyProfile>(() => ({ ...profile }))
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<CompanyProfile>) => setForm(f => ({ ...f, ...patch }))

  if (!welcomeSeen || companyDone) return null

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveProfile({ ...profile, ...form })
    } catch {
      /* kein Backend (z. B. Browser-Vorschau) — trotzdem weiter */
    }
    setSaving(false)
    markCompanyDone()
  }

  return (
    <div className="onboarding-card__overlay">
      <div className="onboarding-card company-step" onClick={(e) => e.stopPropagation()}>
        <div className="company-step__head">
          <div className="company-step__icon"><Building2 size={20} /></div>
          <div>
            <h2 className="onboarding-card__title">Unternehmensdaten</h2>
            <p className="onboarding-card__sub">
              Diese Angaben erscheinen auf deinen Rechnungen & Angeboten. Alles später unter Einstellungen änderbar.
            </p>
          </div>
        </div>

        <div className="company-step__fields">
          <div className="company-step__section-label">Unternehmen</div>
          <label className="company-field">
            <span>Firmenname</span>
            <input value={form.name ?? ''} onChange={(e) => set({ name: e.target.value })} placeholder="Mustermann GmbH" autoFocus />
          </label>
          <label className="company-field">
            <span>Anschrift</span>
            <input value={form.address ?? ''} onChange={(e) => set({ address: e.target.value })} placeholder="Musterstraße 1, 12345 Musterstadt" />
          </label>
          <div className="company-step__row">
            <label className="company-field">
              <span>E-Mail</span>
              <input type="email" value={form.email ?? ''} onChange={(e) => set({ email: e.target.value })} placeholder="kontakt@firma.de" />
            </label>
            <label className="company-field">
              <span>Telefon</span>
              <input value={form.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} placeholder="+49 …" />
            </label>
          </div>
          <label className="company-field">
            <span>Website</span>
            <input value={form.website ?? ''} onChange={(e) => set({ website: e.target.value })} placeholder="www.firma.de" />
          </label>

          <div className="company-step__section-label">Steuer</div>
          <div className="company-step__row">
            <label className="company-field">
              <span>USt-IdNr.</span>
              <input value={form.taxId ?? ''} onChange={(e) => set({ taxId: e.target.value })} placeholder="DE123456789" />
            </label>
            <label className="company-field">
              <span>Steuernummer</span>
              <input value={form.steuernummer ?? ''} onChange={(e) => set({ steuernummer: e.target.value })} placeholder="12/345/67890" />
            </label>
          </div>
          <label className="company-check">
            <input type="checkbox" checked={!!form.kleinunternehmer} onChange={(e) => set({ kleinunternehmer: e.target.checked })} />
            <span>Kleinunternehmer nach §19 UStG (keine Mehrwertsteuer ausweisen)</span>
          </label>

          <div className="company-step__section-label">Bankverbindung</div>
          <label className="company-field">
            <span>IBAN</span>
            <input value={form.iban ?? ''} onChange={(e) => set({ iban: e.target.value })} placeholder="DE12 3456 7890 1234 5678 90" />
          </label>
          <div className="company-step__row">
            <label className="company-field">
              <span>BIC</span>
              <input value={form.bic ?? ''} onChange={(e) => set({ bic: e.target.value })} placeholder="ABCDDEFFXXX" />
            </label>
            <label className="company-field">
              <span>Bank</span>
              <input value={form.bankName ?? ''} onChange={(e) => set({ bankName: e.target.value })} placeholder="Musterbank" />
            </label>
          </div>

          <div className="company-step__section-label">Rechnung & Rechtliches</div>
          <div className="company-step__row">
            <label className="company-field">
              <span>Zahlungsziel (Tage)</span>
              <input
                type="number"
                value={form.zahlungszielTage ?? ''}
                onChange={(e) => set({ zahlungszielTage: e.target.value === '' ? undefined : Number(e.target.value) })}
                placeholder="14"
              />
            </label>
            <label className="company-field">
              <span>Leistungszeitpunkt</span>
              <select
                value={form.leistungszeitpunkt ?? 'rechnungsdatum'}
                onChange={(e) => set({ leistungszeitpunkt: e.target.value as CompanyProfile['leistungszeitpunkt'] })}
              >
                <option value="rechnungsdatum">Rechnungsdatum</option>
                <option value="monatsende">Monatsende</option>
              </select>
            </label>
          </div>
          <label className="company-field">
            <span>Geschäftsführer</span>
            <input value={form.geschaeftsfuehrer ?? ''} onChange={(e) => set({ geschaeftsfuehrer: e.target.value })} placeholder="Max Mustermann" />
          </label>
          <div className="company-step__row">
            <label className="company-field">
              <span>Handelsregister</span>
              <input value={form.handelsregister ?? ''} onChange={(e) => set({ handelsregister: e.target.value })} placeholder="HRB 12345" />
            </label>
            <label className="company-field">
              <span>Registergericht</span>
              <input value={form.registergericht ?? ''} onChange={(e) => set({ registergericht: e.target.value })} placeholder="Amtsgericht Musterstadt" />
            </label>
          </div>
        </div>

        <div className="company-step__actions">
          <button type="button" className="company-step__skip" onClick={markCompanyDone}>
            Überspringen
          </button>
          <button type="button" className="company-step__next" onClick={handleSave} disabled={saving}>
            Weiter <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
