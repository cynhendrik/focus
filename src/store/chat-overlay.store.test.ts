import { describe, it, expect, beforeEach } from 'vitest'
import { useChatOverlayStore } from './chat-overlay.store'

beforeEach(() => { useChatOverlayStore.setState({ open: false, selected: 'team' }) })

describe('useChatOverlayStore', () => {
  it('openPanel öffnet, close schließt', () => {
    useChatOverlayStore.getState().openPanel()
    expect(useChatOverlayStore.getState().open).toBe(true)
    useChatOverlayStore.getState().close()
    expect(useChatOverlayStore.getState().open).toBe(false)
  })

  it('toggle kippt open hin und her', () => {
    useChatOverlayStore.getState().toggle()
    expect(useChatOverlayStore.getState().open).toBe(true)
    useChatOverlayStore.getState().toggle()
    expect(useChatOverlayStore.getState().open).toBe(false)
  })

  it('select setzt die Auswahl', () => {
    useChatOverlayStore.getState().select('team')
    expect(useChatOverlayStore.getState().selected).toBe('team')
  })

  it('select kann eine DM-Auswahl setzen', () => {
    useChatOverlayStore.getState().select({ conversationId: 'c1', peerId: 'p1' })
    expect(useChatOverlayStore.getState().selected).toEqual({ conversationId: 'c1', peerId: 'p1' })
  })
})
