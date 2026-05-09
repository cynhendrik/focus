export interface CompanyProfile {
  name?: string
  address?: string
  phone?: string
  email?: string
  website?: string
  taxId?: string
}

export interface CompanyModules {
  crm?: boolean
  mail?: boolean
  instagram?: boolean
  focusAi?: boolean
  zeiterfassung?: boolean
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
