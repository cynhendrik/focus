import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { CompanyStep } from './CompanyStep'
import { useOnboardingStore } from '@/store/onboarding.store'
import { useCompanyStore } from '@/store/company.store'

beforeEach(() => {
  localStorage.clear()
  useOnboardingStore.setState({ welcomeSeen: true, companyDone: false })
  useCompanyStore.setState({ profile: {}, saveProfile: vi.fn().mockResolvedValue(undefined) as never })
})
afterEach(cleanup)

describe('CompanyStep', () => {
  it('renders the company + invoice fields', () => {
    render(<CompanyStep />)
    expect(screen.getByText('Unternehmensdaten')).toBeTruthy()
    expect(screen.getByPlaceholderText(/Mustermann GmbH/i)).toBeTruthy()
    // invoice-relevant fields
    expect(screen.getByText('USt-IdNr.')).toBeTruthy()
    expect(screen.getByText('IBAN')).toBeTruthy()
    expect(screen.getByText(/Kleinunternehmer/i)).toBeTruthy()
    expect(screen.getByText('Zahlungsziel (Tage)')).toBeTruthy()
  })

  it('renders nothing when the company step is already done', () => {
    useOnboardingStore.setState({ companyDone: true })
    const { container } = render(<CompanyStep />)
    expect(container.firstChild).toBeNull()
  })

  it('skipping marks the step done', () => {
    render(<CompanyStep />)
    fireEvent.click(screen.getByRole('button', { name: /Überspringen/i }))
    expect(useOnboardingStore.getState().companyDone).toBe(true)
  })

  it('Weiter saves the profile and marks the step done', async () => {
    const saveProfile = vi.fn().mockResolvedValue(undefined)
    useCompanyStore.setState({ saveProfile: saveProfile as never })
    render(<CompanyStep />)
    fireEvent.change(screen.getByPlaceholderText(/Mustermann GmbH/i), { target: { value: 'ACME GmbH' } })
    fireEvent.click(screen.getByRole('button', { name: /Weiter/i }))
    await waitFor(() => expect(useOnboardingStore.getState().companyDone).toBe(true))
    expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({ name: 'ACME GmbH' }))
  })
})
