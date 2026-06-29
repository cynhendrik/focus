import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { OnboardingBar } from './OnboardingBar'
import { useOnboardingStore } from '@/store/onboarding.store'
import { useUiStore } from '@/store/ui.store'

beforeEach(() => {
  localStorage.clear()
  useOnboardingStore.setState({
    done: { kunde: true, notiz: false, aufgabe: false, lead: false, corra: false },
    corraOpened: false, welcomeSeen: true, companyDone: true, cardCollapsed: true, barDismissed: false, bootstrapped: true,
  })
})
afterEach(cleanup)

describe('OnboardingBar', () => {
  it('shows progress n/5', () => {
    render(<OnboardingBar />)
    expect(screen.getByText('1 / 5')).toBeTruthy()
  })

  it('renders nothing when welcome not yet seen', () => {
    useOnboardingStore.setState({ welcomeSeen: false })
    const { container } = render(<OnboardingBar />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when all steps are done', () => {
    useOnboardingStore.setState({ done: { kunde: true, notiz: true, aufgabe: true, lead: true, corra: true } })
    const { container } = render(<OnboardingBar />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when dismissed', () => {
    useOnboardingStore.setState({ barDismissed: true })
    const { container } = render(<OnboardingBar />)
    expect(container.firstChild).toBeNull()
  })

  it('navigates when a step pill is clicked', () => {
    render(<OnboardingBar />)
    fireEvent.click(screen.getByRole('button', { name: /Kunde anlegen/i }))
    expect(useUiStore.getState().appView).toBe('clients')
  })

  it('opens Quick Capture for the "Notiz anlegen" step (no separate notes view)', () => {
    useUiStore.setState({ quickCaptureOpen: false })
    render(<OnboardingBar />)
    fireEvent.click(screen.getByRole('button', { name: /Notiz anlegen/i }))
    expect(useUiStore.getState().quickCaptureOpen).toBe(true)
  })

  it('dismisses on the close button', () => {
    render(<OnboardingBar />)
    fireEvent.click(screen.getByRole('button', { name: /Ausblenden/i }))
    expect(useOnboardingStore.getState().barDismissed).toBe(true)
  })
})
