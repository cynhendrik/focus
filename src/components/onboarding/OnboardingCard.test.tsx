import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { OnboardingCard } from './OnboardingCard'
import { useOnboardingStore } from '@/store/onboarding.store'
import { useUiStore } from '@/store/ui.store'

beforeEach(() => {
  localStorage.clear()
  useOnboardingStore.setState({
    done: { kunde: false, notiz: false, aufgabe: false, lead: false, corra: false },
    corraOpened: false, welcomeSeen: true, companyDone: true, cardCollapsed: false, barDismissed: false, bootstrapped: true,
  })
})
afterEach(cleanup)

describe('OnboardingCard', () => {
  it('renders the 5 step tiles with progress', () => {
    render(<OnboardingCard />)
    expect(screen.getByText('0 / 5')).toBeTruthy()
    expect(screen.getByText('Kunde anlegen')).toBeTruthy()
    expect(screen.getByText('KI-Briefing öffnen')).toBeTruthy()
  })

  it('renders nothing when welcome not yet seen', () => {
    useOnboardingStore.setState({ welcomeSeen: false })
    const { container } = render(<OnboardingCard />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing once collapsed', () => {
    useOnboardingStore.setState({ cardCollapsed: true })
    const { container } = render(<OnboardingCard />)
    expect(container.firstChild).toBeNull()
  })

  it('clicking a tile navigates and collapses the card', () => {
    render(<OnboardingCard />)
    fireEvent.click(screen.getByRole('button', { name: /Notiz anlegen/i }))
    expect(useUiStore.getState().appView).toBe('notes')
    expect(useOnboardingStore.getState().cardCollapsed).toBe(true)
  })

  it('collapses via the close button', () => {
    render(<OnboardingCard />)
    fireEvent.click(screen.getByRole('button', { name: /Einklappen/i }))
    expect(useOnboardingStore.getState().cardCollapsed).toBe(true)
  })
})
