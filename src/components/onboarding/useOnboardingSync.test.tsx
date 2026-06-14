import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useOnboardingSync } from './useOnboardingSync'
import { useOnboardingStore } from '@/store/onboarding.store'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import type { Customer } from '@/types/customer.types'

beforeEach(() => {
  localStorage.clear()
  useOnboardingStore.setState({
    done: { kunde: false, notiz: false, aufgabe: false, lead: false, corra: false },
    corraOpened: false, welcomeSeen: false, barDismissed: false, bootstrapped: true,
  })
  useCustomersStore.setState({ customers: [] })
  useUiStore.setState({ appView: 'dashboard' })
})

describe('useOnboardingSync', () => {
  it('reconciles when a data store changes', () => {
    renderHook(() => useOnboardingSync())
    useCustomersStore.setState({ customers: [{ id: 'c1', name: 'A' } as Customer] })
    expect(useOnboardingStore.getState().done.kunde).toBe(true)
  })

  it('marks corra opened when appView becomes corra', () => {
    renderHook(() => useOnboardingSync())
    useUiStore.getState().setAppView('corra')
    expect(useOnboardingStore.getState().done.corra).toBe(true)
  })
})
