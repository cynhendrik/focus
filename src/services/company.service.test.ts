import { describe, it, expect, vi, beforeEach } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { log } from '@/lib/logger'
import { useToastStore } from '@/store/toast.store'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

describe('CompanyService.get: korruptes JSON', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] })
  })

  it('loggt eine Warnung mit Feldname und zeigt einen Fehler-Toast, faellt aber auf {} zurueck', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      id: 'c1', profile: '{kaputt', modules: '{}', crmConfig: '{}', updatedAt: '2026-01-01',
    })
    const warnSpy = vi.spyOn(log, 'warn')

    const { CompanyService } = await import('./company.service')
    const result = await CompanyService.get()

    expect(result.profile).toEqual({})
    expect(warnSpy).toHaveBeenCalledWith(
      'company settings field corrupt, using fallback',
      expect.objectContaining({ field: 'profile' })
    )
    expect(useToastStore.getState().toasts[0]?.variant).toBe('error')
    warnSpy.mockRestore()
  })

  it('bleibt still wenn alle Felder valides JSON sind', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      id: 'c1', profile: '{}', modules: '{}', crmConfig: '{}', updatedAt: '2026-01-01',
    })
    const { CompanyService } = await import('./company.service')
    await CompanyService.get()
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })
})
