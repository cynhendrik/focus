import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { JoinWorkspaceForm } from './JoinWorkspaceForm'
import { useWorkspaceStore } from '@/store/workspace.store'

afterEach(cleanup)

describe('JoinWorkspaceForm', () => {
  it('ruft joinWorkspaceByCode mit dem eingegebenen Code', async () => {
    const join = vi.fn().mockResolvedValue(undefined)
    useWorkspaceStore.setState({ joinWorkspaceByCode: join })
    render(<JoinWorkspaceForm />)
    fireEvent.change(screen.getByPlaceholderText(/code/i), { target: { value: 'abc234' } })
    fireEvent.click(screen.getByRole('button', { name: /beitreten/i }))
    await waitFor(() => expect(join).toHaveBeenCalledWith('abc234'))
  })

  it('zeigt eine Fehlermeldung bei ungültigem Code', async () => {
    const join = vi.fn().mockRejectedValue(new Error('Ungültiger Code'))
    useWorkspaceStore.setState({ joinWorkspaceByCode: join })
    render(<JoinWorkspaceForm />)
    fireEvent.change(screen.getByPlaceholderText(/code/i), { target: { value: 'zzz999' } })
    fireEvent.click(screen.getByRole('button', { name: /beitreten/i }))
    expect(await screen.findByText(/ungültiger code/i)).toBeTruthy()
  })
})
