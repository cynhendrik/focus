export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'overdue' | 'cancelled'
export type OfferStatus = 'draft' | 'sent' | 'accepted' | 'rejected'
export type TaxMode = 'standard' | 'reduced' | 'reverse_charge' | 'kleinunternehmer'

export interface Invoice {
  id: string
  workspaceId: string
  createdBy: string
  accountId: string
  dealId?: string
  number?: string
  date: string
  dueDate: string
  status: InvoiceStatus
  taxMode: TaxMode
  subtotal: number
  taxAmount: number
  total: number
  bankInfo: string
  notes?: string
  pdfPath?: string
  isSuggestion: boolean
  suggestedBy?: string
  approvedBy?: string
  pendingSync: boolean
  createdAt: string
  updatedAt: string
}

export interface InvoiceItem {
  id: string
  invoiceId: string
  title: string
  description?: string
  quantity: number
  unitPrice: number
  taxRate: number
  total: number
  sortOrder: number
  itemDate?: string
  unit?: string
}

export interface InvoiceWithItems {
  invoice: Invoice
  items: InvoiceItem[]
}

export interface UpsertInvoicePayload {
  id?: string
  workspaceId: string
  createdBy: string
  accountId: string
  dealId?: string
  date: string
  dueDate: string
  status?: InvoiceStatus
  taxMode?: TaxMode
  subtotal: number
  taxAmount: number
  total: number
  bankInfo?: string
  notes?: string
  isSuggestion?: boolean
  suggestedBy?: string
  items: UpsertInvoiceItemPayload[]
}

export interface UpsertInvoiceItemPayload {
  id?: string
  title: string
  description?: string
  quantity: number
  unitPrice: number
  taxRate: number
  total: number
  sortOrder: number
  itemDate?: string
  unit?: string
}

export interface Offer {
  id: string
  workspaceId: string
  createdBy: string
  accountId: string
  number?: string
  title: string
  status: OfferStatus
  validUntil: string
  taxMode: TaxMode
  subtotal: number
  taxAmount: number
  total: number
  notes?: string
  pdfPath?: string
  convertedInvoiceId?: string
  pendingSync: boolean
  createdAt: string
  updatedAt: string
}

export interface OfferItem {
  id: string
  offerId: string
  title: string
  description?: string
  quantity: number
  unitPrice: number
  taxRate: number
  total: number
  sortOrder: number
  itemDate?: string
  unit?: string
}

export interface OfferWithItems {
  offer: Offer
  items: OfferItem[]
}

export interface UpsertOfferPayload {
  id?: string
  workspaceId: string
  createdBy: string
  accountId: string
  title: string
  status?: OfferStatus
  validUntil: string
  taxMode?: TaxMode
  subtotal: number
  taxAmount: number
  total: number
  notes?: string
  items: UpsertOfferItemPayload[]
}

export interface UpsertOfferItemPayload {
  id?: string
  title: string
  description?: string
  quantity: number
  unitPrice: number
  taxRate: number
  total: number
  sortOrder: number
  itemDate?: string
  unit?: string
}

export interface ClientRevenue {
  accountId: string
  name: string
  total: number
}

export interface FinanceKpis {
  monthRevenue: number
  yearRevenue: number
  openCount: number
  openTotal: number
  overdueCount: number
  overdueTotal: number
  suggestionCount: number
  topClients: ClientRevenue[]
}
