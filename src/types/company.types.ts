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
  // Kern
  crm?: boolean        // Kundenverwaltung, Pipeline, Deals, Follow-Ups (default: true)
  finanzen?: boolean   // Rechnungen & Angebote (default: true)
  focus?: boolean      // Focus-Modus (default: true)
  // Kommunikation
  mail?: boolean       // E-Mail Integration (default: true)
  kalender?: boolean   // Kalender & Termine (default: true)
  // Erweiterungen
  leads?: boolean      // Lead Management (default: false)
  kampagnen?: boolean  // E-Mail Kampagnen (default: false)
  // KI
  corra?: boolean      // CORRA KI-Assistent (default: false)
  // Legacy
  sales?: boolean
  instagram?: boolean
  focusAi?: boolean
  zeiterfassung?: boolean
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
