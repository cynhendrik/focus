import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const setAppView = vi.fn(); const openCustomerAt = vi.fn()
vi.mock('@/store/ui.store', () => ({ useUiStore: Object.assign(
  (sel: any) => sel({ setAppView, openCustomerAt }),
  { getState: () => ({ setAppView, openCustomerAt }) }) }))
vi.mock('@/store/workspace.store', () => ({ useWorkspaceStore: Object.assign(
  (sel: any) => sel({ activeWorkspaceId: 'real-ws' }), { getState: () => ({ activeWorkspaceId: 'real-ws' }) }) }))
vi.mock('@/lib/tour/apply', () => ({ applyTourFixtures: vi.fn(), clearTourFixtures: vi.fn() }))

import { TourGuide } from './TourGuide'
import { useTourStore } from '@/store/tour.store'

beforeEach(() => { setAppView.mockClear(); openCustomerAt.mockClear(); useTourStore.setState({ active: false, step: 0, seen: false }) })
afterEach(cleanup)

describe('TourGuide', () => {
  it('rendert nichts wenn inaktiv', () => {
    render(<TourGuide />)
    expect(screen.queryByText('KORA')).toBeNull()
  })
  it('zeigt den Text des aktuellen Stopps und navigiert pro Schritt', () => {
    useTourStore.setState({ active: true, step: 0 })
    render(<TourGuide />)
    expect(screen.getByText(/Tag/)).toBeTruthy()       // Stopp 0 = Dashboard-Text
    fireEvent.click(screen.getByText('Weiter'))
    expect(useTourStore.getState().step).toBe(1)
  })
  it('letzter Stopp beendet die Tour', () => {
    useTourStore.setState({ active: true, step: 4 })
    render(<TourGuide />)
    fireEvent.click(screen.getByText(/Los geht/))
    expect(useTourStore.getState().active).toBe(false)
    expect(useTourStore.getState().seen).toBe(true)
  })
})
