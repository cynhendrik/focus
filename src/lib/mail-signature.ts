import type { CompanyProfile } from '@/types/company.types'

/** Baut einen Signatur-Textblock aus den gesetzten Feldern des Firmenprofils. */
export function buildSignatureFromProfile(p: CompanyProfile): string {
  const lines: string[] = []
  if (p.name)    lines.push(p.name)
  if (p.address) lines.push(p.address)

  const contact = [
    p.phone   ? `Tel: ${p.phone}` : '',
    p.email   || '',
    p.website || '',
  ].filter(Boolean).join(' · ')
  if (contact) lines.push(contact)

  const tax = [
    p.taxId        ? `USt-IdNr.: ${p.taxId}` : '',
    p.steuernummer ? `StNr.: ${p.steuernummer}` : '',
  ].filter(Boolean).join(' · ')
  if (tax) lines.push(tax)

  const register = [
    [p.registergericht, p.handelsregister].filter(Boolean).join(' '),
    p.geschaeftsfuehrer ? `GF: ${p.geschaeftsfuehrer}` : '',
  ].filter(Boolean).join(' · ')
  if (register) lines.push(register)

  const bank = [
    p.bankName || '',
    p.iban ? `IBAN: ${p.iban}` : '',
    p.bic  ? `BIC: ${p.bic}`  : '',
  ].filter(Boolean).join(' · ')
  if (bank) lines.push(bank)

  return lines.join('\n')
}

/** Hängt eine Signatur mit dem Standard-Trenner an den Body. Leere Signatur → Body unverändert. */
export function appendSignature(body: string, signature?: string): string {
  const sig = (signature ?? '').trim()
  if (!sig) return body
  if (!body) return `-- \n${sig}`
  return `${body}\n\n-- \n${sig}`
}
