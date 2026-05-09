import { invoke } from '@tauri-apps/api/core'
import type { UpdateCompanyPayload } from '@/types/company.types'

interface RawCompanySettings {
  id: string
  profile: string
  modules: string
  crmConfig: string
  updatedAt: string
}

export const CompanyService = {
  async get() {
    const raw = await invoke<RawCompanySettings>('get_company_settings')
    return parse(raw)
  },
  async update(payload: UpdateCompanyPayload) {
    const raw = await invoke<RawCompanySettings>('update_company_settings', { payload })
    return parse(raw)
  },
}

function parse(raw: RawCompanySettings) {
  return {
    id: raw.id,
    profile: tryParse(raw.profile, {}),
    modules: tryParse(raw.modules, {}),
    crmConfig: tryParse(raw.crmConfig, {}),
    updatedAt: raw.updatedAt,
  }
}

function tryParse(json: string, fallback: unknown) {
  try { return JSON.parse(json) } catch { return fallback }
}
