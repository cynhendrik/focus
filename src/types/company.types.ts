export type UserRole = 'admin' | 'employee'

export interface CompanyProfile {
  name?: string
  address?: string
  phone?: string
  email?: string
  website?: string
  taxId?: string
  iban?: string
  bic?: string
  bankName?: string
  handelsregister?: string
  registergericht?: string
  geschaeftsfuehrer?: string
  invoiceIntro?: string
  userRole?: UserRole
  kleinunternehmer?: boolean
  steuernummer?: string
  zahlungszielTage?: number
  leistungszeitpunkt?: 'rechnungsdatum' | 'monatsende'
  logoBase64?: string
}

export interface CompanyModules {
  sales?: boolean
  crm?: boolean
  mail?: boolean
  instagram?: boolean
  focusAi?: boolean
  zeiterfassung?: boolean
  /** Pro-Bündel: schaltet Kampagnen + Automationen frei. */
  pro?: boolean
}

export interface CompanySettings {
  id: string
  profile: CompanyProfile
  modules: CompanyModules
  crmConfig: Record<string, unknown>
  updatedAt: string
}

export interface UpdateCompanyPayload {
  profile?: string
  modules?: string
  crmConfig?: string
}
