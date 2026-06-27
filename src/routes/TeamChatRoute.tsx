import { useEffect } from 'react'
import { MessagesSquare } from 'lucide-react'
import { useMessagesStore } from '@/store/messages.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { MessageList } from '@/components/team/MessageList'
import { ChatComposer } from '@/components/team/ChatComposer'

export function TeamChatRoute() {
  const loadRecent = useMessagesStore(s => s.loadRecent)
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId)
  const isShared = useWorkspaceStore(s => s.isActiveWorkspaceShared())

  useEffect(() => {
    if (activeWorkspaceId && isShared) void loadRecent(activeWorkspaceId)
  }, [activeWorkspaceId, isShared, loadRecent])

  if (!isShared) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--fg-dim)' }}>
        <MessagesSquare size={28} />
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-muted)' }}>Team-Chat</div>
        <div style={{ fontSize: 12.5, maxWidth: 360, textAlign: 'center' }}>
          Team-Chat ist verfügbar, sobald dieser Workspace geteilt ist. Teile ihn in den
          Einstellungen, um mit deinem Team zu schreiben.
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <MessageList />
      <ChatComposer />
    </div>
  )
}
