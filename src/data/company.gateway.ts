import { supabase } from '@/lib/supabase'
import { CompanyService } from '@/services/company.service'
import { useWorkspaceStore } from '@/store/workspace.store'
import { companyRowToSettings, emptyCompanySettings, type CompanySettingsData } from './company.mapper'
import type { UpdateCompanyPayload } from '@/types/company.types'

function shared(): boolean { return useWorkspaceStore.getState().isActiveWorkspaceShared() }
function wsId(): string { return useWorkspaceStore.getState().activeWorkspaceId ?? '' }
function fail(error: { message?: string; code?: string } | null): never {
  const e = error ?? {}; throw new Error(e.code ? `${e.message ?? 'Supabase-Fehler'} (${e.code})` : (e.message ?? 'Supabase-Fehler'))
}
/** JSON-String → Objekt; undefined bleibt undefined (Feld nicht ändern). */
function asJsonObj(s?: string): Record<string, unknown> | undefined {
  if (s === undefined) return undefined
  try { const p = JSON.parse(s); return p && typeof p === 'object' ? p : {} } catch { return {} }
}

/**
 * Firmendaten. Lokal/solo: eine Firma über den bestehenden Rust-Pfad (unverändert).
 * Shared: eine Zeile je Workspace (id = workspace_id), Lesen=Mitglied, Schreiben=Owner (RLS).
 */
export const CompanyGateway = {
  async get(): Promise<CompanySettingsData> {
    if (!shared()) return CompanyService.get()
    const ws = wsId()
    const { data, error } = await supabase.from('company_settings').select('*').eq('workspace_id', ws).maybeSingle()
    if (error) fail(error)
    return data ? companyRowToSettings(data) : emptyCompanySettings(ws)
  },

  async update(payload: UpdateCompanyPayload): Promise<CompanySettingsData> {
    if (!shared()) return CompanyService.update(payload)
    const ws = wsId()
    const row: Record<string, unknown> = { id: ws, workspace_id: ws, updated_at: new Date().toISOString() }
    const profile = asJsonObj(payload.profile);   if (profile !== undefined) row.profile = profile
    const modules = asJsonObj(payload.modules);   if (modules !== undefined) row.modules = modules
    const crm = asJsonObj(payload.crmConfig);     if (crm !== undefined) row.crm_config = crm
    const { data, error } = await supabase.from('company_settings').upsert(row, { onConflict: 'id' }).select('*').single()
    if (error) fail(error)
    return companyRowToSettings(data)
  },
}
