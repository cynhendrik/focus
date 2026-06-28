import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

vi.mock('@/store/ui.store', () => ({
  useUiStore: (sel: (s: { setAppView: (v: string) => void }) => unknown) =>
    sel({ setAppView: vi.fn() }),
}))

import { DashboardEmptyState } from './DashboardEmptyState'
import { useTourStore } from '@/store/tour.store'

beforeEach(() => { useTourStore.setState({ active: false, step: 0, seen: false }) })
afterEach(cleanup)

describe('DashboardEmptyState', () => {
  it('zeigt Leg-los-Überschrift und beide Buttons', () => {
    render(<DashboardEmptyState />)
    expect(screen.getByText(/Leg los/)).toBeTruthy()
    expect(screen.getByText('Ersten Kunden anlegen')).toBeTruthy()
    expect(screen.getByText('Tour wiederholen')).toBeTruthy()
  })

  it('Tour-wiederholen-Klick startet die Tour', () => {
    render(<DashboardEmptyState />)
    fireEvent.click(screen.getByText('Tour wiederholen'))
    expect(useTourStore.getState().active).toBe(true)
  })
})
