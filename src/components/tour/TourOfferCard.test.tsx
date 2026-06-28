import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
vi.mock('@/store/onboarding.store', () => ({ useOnboardingStore: (sel: any) => sel({ companyDone: true, bootstrapped: true }) }))
vi.mock('@/store/workspace.store', () => ({ useWorkspaceStore: (sel: any) => sel({ activeWorkspaceId: 'real-ws' }) }))
import { TourOfferCard } from './TourOfferCard'
import { useTourStore } from '@/store/tour.store'

beforeEach(() => { useTourStore.setState({ active: false, step: 0, seen: false }) })
afterEach(cleanup)

describe('TourOfferCard', () => {
  it('sichtbar bei !seen; Start startet die Tour', () => {
    render(<TourOfferCard />)
    expect(screen.getByText(/zeigt dir die App/)).toBeTruthy()
    fireEvent.click(screen.getByText(/Tour starten|Start/))
    expect(useTourStore.getState().active).toBe(true)
  })
  it('Später setzt seen ohne Tour', () => {
    render(<TourOfferCard />)
    fireEvent.click(screen.getByText('Später'))
    expect(useTourStore.getState().seen).toBe(true)
    expect(useTourStore.getState().active).toBe(false)
  })
  it('unsichtbar wenn schon gesehen', () => {
    useTourStore.setState({ seen: true })
    const { container } = render(<TourOfferCard />)
    expect(container.firstChild).toBeNull()
  })
})
