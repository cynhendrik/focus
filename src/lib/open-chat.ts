import { useUiStore } from '@/store/ui.store'
import { useChatOverlayStore } from '@/store/chat-overlay.store'

interface OpenChatOpts { messageId?: string | null; conversationId?: string | null; peerId?: string | null }

/** Öffnet die Chat-Kachel. Mit conversationId+peerId direkt im DM, sonst im Team.
 *  messageId → MessageList scrollt nach dem Öffnen dorthin. */
export function openChat(opts: OpenChatOpts = {}): void {
  const { messageId, conversationId, peerId } = opts
  if (messageId) useUiStore.getState().setPendingScrollMessageId(messageId)
  if (conversationId && peerId) useChatOverlayStore.getState().select({ conversationId, peerId })
  else useChatOverlayStore.getState().select('team')
  useChatOverlayStore.getState().openPanel()
}
