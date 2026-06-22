import type { CompanyProfile, CompanyModules } from '@/types/company.types'

export interface CompanySettingsData {
  id: string
  profile: CompanyProfile
  modules: CompanyModules
  crmConfig: Record<string, unknown>
  updatedAt: string
}

/** jsonb (Objekt) ODER JSON-String → Objekt. */
function asObj(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  if (typeof v === 'string') { try { const p = JSON.parse(v); return p && typeof p === 'object' && !Array.isArray(p) ? p : {} } catch { return {} } }
  return {}
}

/** Supabase-`company_settings`-Zeile (profile/modules/crm_config = jsonb) → CompanySettingsData. */
export function companyRowToSettings(r: any): CompanySettingsData {
  return {
    id: r.id,
    profile: asObj(r.profile) as CompanyProfile,
    modules: asObj(r.modules) as CompanyModules,
    crmConfig: asObj(r.crm_config),
    updatedAt: r.updated_at ?? '',
  }
}

/** Leere Firma (Workspace ohne angelegte Firmendaten). */
export function emptyCompanySettings(id: string): CompanySettingsData {
  return { id, profile: {}, modules: {}, crmConfig: {}, updatedAt: '' }
}
