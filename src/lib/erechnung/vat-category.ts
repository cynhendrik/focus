import type { TaxMode } from '@/types/finance.types'

export interface VatCategory {
  /** EN16931 BT-151/BT-95: S=Standard, Z=Zero-rated, AE=Reverse Charge, E=steuerbefreit. */
  code: 'S' | 'Z' | 'AE' | 'E'
  rate: number
  exemptionReason?: string
}

/** USt-Kategorie + Satz für die E-Rechnung aus dem Rechnungs-Steuermodus ableiten. */
export function vatCategory(taxMode: TaxMode, itemRate: number): VatCategory {
  switch (taxMode) {
    case 'reverse_charge':
      return { code: 'AE', rate: 0, exemptionReason: 'Steuerschuldnerschaft des Leistungsempfängers (§13b UStG)' }
    case 'kleinunternehmer':
      return { code: 'E', rate: 0, exemptionReason: 'Gemäß §19 UStG wird keine Mehrwertsteuer berechnet.' }
    case 'standard':
    case 'reduced':
    default:
      // EN16931: Kategorie S erfordert rate > 0; ein 0%-Posten ist Z (Zero-rated).
      return itemRate === 0
        ? { code: 'Z', rate: 0 }
        : { code: 'S', rate: itemRate }
  }
}
