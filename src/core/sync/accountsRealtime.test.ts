import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/data/accounts.gateway', () => ({ AccountsGateway: {} }))

import { useLeadsStore } from '@/store/leads.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useCustomersStore } from '@/store/customers.store'
import { applyAccountsRealtimeChange } from './accountsRealtime'

const clientRow = {
  id: 'a1', workspace_id: 'ws1', created_by: 'u1', name: 'ACME',
  kind: 'company', status: 'aktiv', priority: 'normal', tags: [], goals: [],
  is_private: false, social_links: '{}', lead_score: 0, score_factors: {},
  account_type: 'client', archived_at: null, created_at: '', updated_at: '',
}

describe('applyAccountsRealtimeChange', () => {
  beforeEach(() => {
    useLeadsStore.setState({ leads: [], isLoading: false, error: null })
    useAccountsStore.setState({ accounts: [], isLoading: false, error: null } as any)
    useCustomersStore.setState({ customers: [], isLoading: false, error: null })
  })

  it('INSERT eines client-Accounts landet in accounts UND customers', () => {
    applyAccountsRealtimeChange({ eventType: 'INSERT', new: clientRow, old: null })
    expect(useAccountsStore.getState().accounts).toHaveLength(1)
    expect(useCustomersStore.getState().customers).toHaveLength(1)
    expect(useCustomersStore.getState().customers[0].id).toBe('a1')
  })

  it('Wechsel zu account_type=lead entfernt aus accounts/customers und fügt in leads', () => {
    useAccountsStore.setState({ accounts: [{ id: 'a1' } as any], isLoading: false, error: null } as any)
    useCustomersStore.setState({ customers: [{ id: 'a1' } as any], isLoading: false, error: null })
    applyAccountsRealtimeChange({
      eventType: 'UPDATE',
      new: { ...clientRow, account_type: 'lead', lead_status: 'neu', pipeline_stage: 'inbox', lead_source: 'manual' },
      old: clientRow,
    })
    expect(useAccountsStore.getState().accounts).toHaveLength(0)
    expect(useCustomersStore.getState().customers).toHaveLength(0)
    expect(useLeadsStore.getState().leads).toHaveLength(1)
  })

  it('DELETE entfernt aus allen drei Stores', () => {
    useAccountsStore.setState({ accounts: [{ id: 'a1' } as any], isLoading: false, error: null } as any)
    useCustomersStore.setState({ customers: [{ id: 'a1' } as any], isLoading: false, error: null })
    applyAccountsRealtimeChange({ eventType: 'DELETE', new: null, old: { id: 'a1' } })
    expect(useAccountsStore.getState().accounts).toHaveLength(0)
    expect(useCustomersStore.getState().customers).toHaveLength(0)
  })
})
