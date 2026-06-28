import { describe, it, expect, beforeEach } from 'vitest'
import { openChat } from './open-chat'
import { useUiStore } from '@/store/ui.store'
import { useChatOverlayStore } from '@/store/chat-overlay.store'

beforeEach(() => {
  useChatOverlayStore.setState({ open: false, selected: 'team' })
  useUiStore.setState({ pendingScrollMessageId: null })
})

describe('openChat', () => {
  it('öffnet das Overlay und wählt Team', () => {
    openChat()
    expect(useChatOverlayStore.getState().open).toBe(true)
    expect(useChatOverlayStore.getState().selected).toBe('team')
  })

  it('merkt sich die Nachricht für den Scroll-Sprung', () => {
    openChat('m-42')
    expect(useUiStore.getState().pendingScrollMessageId).toBe('m-42')
    expect(useChatOverlayStore.getState().open).toBe(true)
  })

  it('ohne messageId bleibt der Scroll-Merker unverändert (null)', () => {
    openChat()
    expect(useUiStore.getState().pendingScrollMessageId).toBeNull()
  })
})
