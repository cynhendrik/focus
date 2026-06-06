export type AuftragStatus = 'active' | 'archived'

export interface Auftrag {
  id:                string
  title:             string
  defaultHourlyRate: number | null  // Default-Stundensatz, überschreibbar per Eintrag
  notes:             string
  status:            AuftragStatus
  createdAt:         string
}

export interface Zeiteintrag {
  id:          string
  auftragId:   string | null  // welcher Auftrag (Service-Typ)
  accountId:   string | null  // welcher Kunde
  date:        string
  minutes:     number
  description: string
  hourlyRate:  number | null  // überschreibt Auftrag-Default; null = Auftrag-Rate nutzen
  billed:      boolean
  invoiceId:   string | null
}

export interface CreateAuftragPayload {
  title:             string
  defaultHourlyRate: number | null
  notes:             string
}

export interface AddZeiteintragPayload {
  auftragId:   string | null
  accountId:   string | null
  date:        string
  minutes:     number
  description: string
  hourlyRate:  number | null
}
