import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { WorkspaceSettings } from './WorkspaceSettings'
import { useCompanyStore } from '@/store/company.store'
import { useUiStore } from '@/store/ui.store'

// Child components that carry workspace-store / Tauri dependencies are
// replaced with no-ops so this unit test stays focused on WorkspaceSettings.
vi.mock('@/components/settings/InvoiceNumberSettings', () => ({
  InvoiceNumberSettings: () => null,
}))
vi.mock('@/core/workspace/JoinCodeRow', () => ({
  JoinCodeRow: () => null,
}))
vi.mock('@/components/workspace/MembersSettings', () => ({
  MembersSettings: () => null,
}))
vi.mock('@/components/workspace/ShareWorkspaceButton', () => ({
  ShareWorkspaceButton: () => null,
}))

// clipboard API is not available in jsdom
Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
})

beforeEach(() => {
  useCompanyStore.setState({
    profile: {
      name: 'Test GmbH',
      bankName: 'Commerzbank AG',
      bic: 'COBADEFFXXX',
      registergericht: 'Amtsgericht Berlin-Charlottenburg',
      handelsregister: 'HRB 99999',
      geschaeftsfuehrer: 'Max Mustermann',
    },
    load: vi.fn().mockResolvedValue(undefined) as never,
    saveProfile: vi.fn().mockResolvedValue(undefined) as never,
  })
  useUiStore.setState({ theme: 'dark', toggleTheme: vi.fn() })
})
afterEach(cleanup)

describe('WorkspaceSettings – Unternehmensprofil vollständig', () => {
  it('renders all new bank fields', () => {
    render(<WorkspaceSettings workspaceId="ws-test" />)
    expect(screen.getByPlaceholderText('COBADEFFXXX')).toBeTruthy()
    expect(screen.getByPlaceholderText('Commerzbank AG')).toBeTruthy()
  })

  it('renders all new legal fields', () => {
    render(<WorkspaceSettings workspaceId="ws-test" />)
    expect(screen.getByPlaceholderText('Max Mustermann')).toBeTruthy()
    expect(screen.getByPlaceholderText('HRB 12345')).toBeTruthy()
    expect(screen.getByPlaceholderText('Amtsgericht Berlin-Charlottenburg')).toBeTruthy()
  })

  it('pre-fills fields from the store profile', () => {
    render(<WorkspaceSettings workspaceId="ws-test" />)
    const banknameInput = screen.getByPlaceholderText('Commerzbank AG') as HTMLInputElement
    expect(banknameInput.value).toBe('Commerzbank AG')
    const rgInput = screen.getByPlaceholderText('Amtsgericht Berlin-Charlottenburg') as HTMLInputElement
    expect(rgInput.value).toBe('Amtsgericht Berlin-Charlottenburg')
  })

  it('clearing bankName and saving sends empty string to saveProfile', async () => {
    const saveProfile = vi.fn().mockResolvedValue(undefined)
    useCompanyStore.setState({ saveProfile: saveProfile as never })

    render(<WorkspaceSettings workspaceId="ws-test" />)

    const banknameInput = screen.getByPlaceholderText('Commerzbank AG')
    fireEvent.change(banknameInput, { target: { value: '' } })

    fireEvent.click(screen.getByRole('button', { name: /Speichern/i }))

    await waitFor(() => expect(saveProfile).toHaveBeenCalled())
    const payload = saveProfile.mock.calls[0][0]
    expect(payload).toMatchObject({ bankName: '' })
  })

  it('clearing registergericht and saving sends empty string to saveProfile', async () => {
    const saveProfile = vi.fn().mockResolvedValue(undefined)
    useCompanyStore.setState({ saveProfile: saveProfile as never })

    render(<WorkspaceSettings workspaceId="ws-test" />)

    const rgInput = screen.getByPlaceholderText('Amtsgericht Berlin-Charlottenburg')
    fireEvent.change(rgInput, { target: { value: '' } })

    fireEvent.click(screen.getByRole('button', { name: /Speichern/i }))

    await waitFor(() => expect(saveProfile).toHaveBeenCalled())
    const payload = saveProfile.mock.calls[0][0]
    expect(payload).toMatchObject({ registergericht: '' })
  })
})
