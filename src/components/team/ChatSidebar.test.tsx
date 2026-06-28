import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ChatSidebar } from './ChatSidebar'
import { useChatOverlayStore } from '@/store/chat-overlay.store'
import { useMembersStore } from '@/store/members.store'
import { useAuthStore } from '@/store/auth.store'

beforeEach(() => {
  useChatOverlayStore.setState({ open: true, selected: 'team' })
  useMembersStore.setState({
    profiles: {
      me: { id: 'me', displayName: 'Ich Selbst', email: null },
      u2: { id: 'u2', displayName: 'Anna Vogel', email: null },
    },
    memberIds: ['me', 'u2'],
  })
  useAuthStore.setState({ user: { id: 'me' } as any })
})
afterEach(cleanup)

describe('ChatSidebar', () => {
  it('zeigt den Team-Eintrag', () => {
    render(<ChatSidebar />)
    expect(screen.getByText('Team')).toBeTruthy()
  })

  it('listet Mitglieder mit "(du)" beim eigenen Eintrag + "bald"-Badge, nicht klickbar', () => {
    const select = vi.fn()
    useChatOverlayStore.setState({ select })
    render(<ChatSidebar />)
    expect(screen.getByText('Ich Selbst (du)')).toBeTruthy()
    expect(screen.getByText('Anna Vogel')).toBeTruthy()
    expect(screen.getAllByText('bald').length).toBe(2)
    // Klick auf ein Mitglied löst keine Auswahl aus (disabled).
    fireEvent.click(screen.getByText('Anna Vogel'))
    expect(select).not.toHaveBeenCalled()
  })
})
