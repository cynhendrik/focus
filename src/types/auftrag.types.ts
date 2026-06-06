export type AuftragStatus = 'active' | 'completed' | 'billed'
export type AuftragType   = 'hourly' | 'fixed'

export interface Auftrag {
  id:          string
  accountId:   string
  title:       string
  type:        AuftragType
  hourlyRate:  number | null
  fixedAmount: number | null
  status:      AuftragStatus
  notes:       string
  createdAt:   string
}

export interface Zeiteintrag {
  id:          string
  auftragId:   string
  date:        string
  minutes:     number
  description: string
  billed:      boolean
  invoiceId:   string | null
}

export interface CreateAuftragPayload {
  accountId:   string
  title:       string
  type:        AuftragType
  hourlyRate:  number | null
  fixedAmount: number | null
  notes:       string
}

export interface AddZeiteintragPayload {
  auftragId:   string
  date:        string
  minutes:     number
  description: string
}
