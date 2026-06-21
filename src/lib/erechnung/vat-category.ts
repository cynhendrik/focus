import type { TaxMode } from '@/types/finance.types'

export interface VatCategory {
  /** EN16931 BT-151/BT-95: S=Standard, AE=Reverse Charge, E=steuerbefreit. */
  code: 'S' | 'AE' | 'E'
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
      return { code: 'S', rate: itemRate }
  }
}
