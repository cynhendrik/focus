import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { HelpDrawer } from './HelpDrawer'
import { useUiStore } from '@/store/ui.store'
import { useOnboardingStore } from '@/store/onboarding.store'

beforeEach(() => {
  localStorage.clear()
  useUiStore.setState({ helpOpen: true, appView: 'dashboard' })
  useOnboardingStore.setState({
    done: { kunde: true, notiz: false, aufgabe: false, lead: false, corra: false },
    corraOpened: false, welcomeSeen: true, barDismissed: false, bootstrapped: true,
  })
})
afterEach(cleanup)

describe('HelpDrawer', () => {
  it('renders nothing when closed', () => {
    useUiStore.setState({ helpOpen: false })
    const { container } = render(<HelpDrawer />)
    expect(container.firstChild).toBeNull()
  })

  it('renders first-steps progress and feature categories', () => {
    render(<HelpDrawer />)
    expect(screen.getByText(/Erste Schritte ·/i)).toBeTruthy()
    expect(screen.getByText('Rechnungen & Angebote')).toBeTruthy()
    expect(screen.getByText('Zeiterfassung')).toBeTruthy()
  })

  it('closes via the close button', () => {
    render(<HelpDrawer />)
    fireEvent.click(screen.getByRole('button', { name: /schließen/i }))
    expect(useUiStore.getState().helpOpen).toBe(false)
  })

  it('navigates and closes when an entry link is clicked', () => {
    render(<HelpDrawer />)
    fireEvent.click(screen.getByText('Zeiterfassung'))           // Kategorie aufklappen
    fireEvent.click(screen.getByRole('button', { name: /Zeit erfassen/i }))
    expect(useUiStore.getState().appView).toBe('zeitmanagement')
    expect(useUiStore.getState().helpOpen).toBe(false)
  })
})
