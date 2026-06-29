import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

let onb: any
let auth: any
vi.mock('@/store/onboarding.store', () => ({ useOnboardingStore: (sel: any) => sel(onb) }))
vi.mock('@/store/workspace.store', () => ({ useWorkspaceStore: (sel: any) => sel({ activeWorkspaceId: 'real-ws' }) }))
vi.mock('@/store/auth.store', () => ({ useAuthStore: (sel: any) => sel(auth) }))
import { TourOfferCard } from './TourOfferCard'
import { useTourStore } from '@/store/tour.store'

beforeEach(() => {
  useTourStore.setState({ active: false, step: 0, seen: false })
  onb = { companyDone: true, bootstrapped: true, nameDone: true }
  auth = { user: { user_metadata: {} } }
})
afterEach(cleanup)

describe('TourOfferCard', () => {
  it('sichtbar bei !seen (Name erledigt); Start startet die Tour', () => {
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

  it('unsichtbar solange die Namensabfrage offen ist (nameDone=false, kein Name)', () => {
    onb = { ...onb, nameDone: false }
    const { container } = render(<TourOfferCard />)
    expect(container.firstChild).toBeNull()
  })

  it('sichtbar wenn bereits ein Name gesetzt ist (auch ohne nameDone)', () => {
    onb = { ...onb, nameDone: false }
    auth = { user: { user_metadata: { full_name: 'Hendrik' } } }
    render(<TourOfferCard />)
    expect(screen.getByText(/zeigt dir die App/)).toBeTruthy()
  })
})
