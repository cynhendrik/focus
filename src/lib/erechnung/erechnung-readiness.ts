import type { CompanyProfile } from '@/types/company.types'
import type { Account } from '@/types/account.types'

/** Liefert die für eine gültige E-Rechnung fehlenden Stammdaten-Felder (leer = bereit). */
export function checkErechnungReadiness(profile: CompanyProfile, account: Account): string[] {
  const missing: string[] = []
  if (!profile.name) missing.push('Unternehmensname')
  if (!profile.address) missing.push('Unternehmensadresse')
  if (!profile.taxId && !profile.steuernummer) missing.push('USt-IdNr. oder Steuernummer')
  if (!profile.iban) missing.push('IBAN')
  if (!account.name) missing.push('Kundenname')
  if (!account.street || !account.zip || !account.city) missing.push('Kundenadresse')
  return missing
}
