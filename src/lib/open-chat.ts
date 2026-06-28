import { useUiStore } from '@/store/ui.store'
import { useChatOverlayStore } from '@/store/chat-overlay.store'

/**
 * Öffnet die Team-Chat-Kachel (Team-Kanal). Mit `messageId` springt die
 * MessageList nach dem Öffnen zu dieser Nachricht (Inbox-/Glocken-Sprung).
 * Gemeinsamer Eingang für Glocke, Inbox-Route und künftige Sprünge.
 */
export function openChat(messageId?: string | null): void {
  if (messageId) useUiStore.getState().setPendingScrollMessageId(messageId)
  useChatOverlayStore.getState().select('team')
  useChatOverlayStore.getState().openPanel()
}
