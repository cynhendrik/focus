import { describe, it, expect, beforeEach } from 'vitest'
import { openChat } from './open-chat'
import { useUiStore } from '@/store/ui.store'
import { useChatOverlayStore } from '@/store/chat-overlay.store'

beforeEach(() => {
  useChatOverlayStore.setState({ open: false, selected: 'team' })
  useUiStore.setState({ pendingScrollMessageId: null })
})

describe('openChat', () => {
  it('ohne Argumente: Team öffnen', () => {
    openChat()
    expect(useChatOverlayStore.getState().open).toBe(true)
    expect(useChatOverlayStore.getState().selected).toBe('team')
  })
  it('mit messageId: Scroll-Merker setzen', () => {
    openChat({ messageId: 'm-42' })
    expect(useUiStore.getState().pendingScrollMessageId).toBe('m-42')
  })
  it('mit conversationId+peerId: DM auswählen + öffnen', () => {
    openChat({ messageId: 'm1', conversationId: 'c1', peerId: 'p1' })
    expect(useChatOverlayStore.getState().selected).toEqual({ conversationId: 'c1', peerId: 'p1' })
    expect(useUiStore.getState().pendingScrollMessageId).toBe('m1')
    expect(useChatOverlayStore.getState().open).toBe(true)
  })
})
