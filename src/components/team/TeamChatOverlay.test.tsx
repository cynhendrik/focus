import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { createElement, Fragment } from 'react'
import { useChatOverlayStore } from '@/store/chat-overlay.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useMessagesStore } from '@/store/messages.store'

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: any) => createElement(Fragment, null, children),
  motion: {
    div: ({ children, initial: _i, animate: _a, exit: _e, transition: _t, ...rest }: any) =>
      createElement('div', rest, children),
  },
}))
vi.mock('./ChatSidebar',  () => ({ ChatSidebar:  () => createElement('div', { 'data-testid': 'chat-sidebar' }) }))
vi.mock('./MessageList',  () => ({ MessageList:  () => createElement('div', { 'data-testid': 'message-list' }) }))
vi.mock('./ChatComposer', () => ({ ChatComposer: () => null }))

import { TeamChatOverlay } from './TeamChatOverlay'

beforeEach(() => {
  useChatOverlayStore.setState({ open: false, selected: 'team' })
  useMessagesStore.setState({ loadRecent: vi.fn() } as any)
  useWorkspaceStore.setState({ isActiveWorkspaceShared: () => true, activeWorkspaceId: 'ws1' } as any)
})
afterEach(cleanup)

describe('TeamChatOverlay', () => {
  it('rendert nichts wenn geschlossen', () => {
    render(<TeamChatOverlay />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('zeigt MessageList + Sidebar wenn offen und Workspace geteilt', () => {
    useChatOverlayStore.setState({ open: true })
    render(<TeamChatOverlay />)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByTestId('message-list')).toBeTruthy()
    expect(screen.getByTestId('chat-sidebar')).toBeTruthy()
  })

  it('zeigt den Teilen-Hinweis wenn Workspace nicht geteilt', () => {
    useWorkspaceStore.setState({ isActiveWorkspaceShared: () => false, activeWorkspaceId: 'ws1' } as any)
    useChatOverlayStore.setState({ open: true })
    render(<TeamChatOverlay />)
    expect(screen.queryByTestId('message-list')).toBeNull()
    expect(screen.getByText(/geteilt ist/)).toBeTruthy()
  })

  it('Escape schließt', () => {
    useChatOverlayStore.setState({ open: true })
    render(<TeamChatOverlay />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useChatOverlayStore.getState().open).toBe(false)
  })

  it('Strg+Shift+K toggelt', () => {
    render(<TeamChatOverlay />)
    fireEvent.keyDown(window, { key: 'K', ctrlKey: true, shiftKey: true })
    expect(useChatOverlayStore.getState().open).toBe(true)
  })

  it('Escape in einem Eingabefeld schließt NICHT', () => {
    useChatOverlayStore.setState({ open: true })
    render(<TeamChatOverlay />)
    const input = document.createElement('input')
    document.body.appendChild(input)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(useChatOverlayStore.getState().open).toBe(true)
    document.body.removeChild(input)
  })
})
