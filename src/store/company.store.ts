import { create } from 'zustand'
import { CompanyService } from '@/services/company.service'
import { log } from '@/lib/logger'
import type { CompanyProfile, CompanyModules } from '@/types/company.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface CompanyState {
  profile: CompanyProfile
  modules: CompanyModules
  crmConfig: Record<string, unknown>
  isLoading: boolean
  error: AppError | null
  isAdmin: boolean
  load: () => Promise<void>
  saveProfile: (profile: CompanyProfile) => Promise<void>
  saveModules: (modules: CompanyModules) => Promise<void>
}

export const useCompanyStore = create<CompanyState>()((set) => ({
  profile: {},
  modules: {},
  crmConfig: {},
  isLoading: false,
  error: null,
  isAdmin: true,

  load: async () => {
    set({ isLoading: true, error: null })
    try {
      const s = await CompanyService.get()
      const isAdmin = s.profile.userRole !== 'employee'
      set({ profile: s.profile, modules: s.modules, crmConfig: s.crmConfig, isLoading: false, isAdmin })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load company settings', { error })
    }
  },

  saveProfile: async (profile) => {
    try {
      const s = await CompanyService.update({ profile: JSON.stringify(profile) })
      const isAdmin = s.profile.userRole !== 'employee'
      set({ profile: s.profile, isAdmin })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  saveModules: async (modules) => {
    try {
      const s = await CompanyService.update({ modules: JSON.stringify(modules) })
      set({ modules: s.modules })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },
}))
