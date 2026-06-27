import { useEffect } from 'react'
import { X, Maximize2 } from 'lucide-react'
import { useUiStore } from '@/store/ui.store'
import { useMessagesStore } from '@/store/messages.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { MessageList } from './MessageList'
import { ChatComposer } from './ChatComposer'

/** Rechts ein-/ausklappbares Mini-Panel — sichtbar unabhängig vom appView. */
export function ChatDrawer() {
  const open       = useUiStore(s => s.chatDrawerOpen)
  const setOpen    = useUiStore(s => s.setChatDrawerOpen)
  const setAppView = useUiStore(s => s.setAppView)
  const loadRecent = useMessagesStore(s => s.loadRecent)
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId)
  const isShared = useWorkspaceStore(s => s.isActiveWorkspaceShared())

  useEffect(() => {
    if (open && activeWorkspaceId && isShared) void loadRecent(activeWorkspaceId)
  }, [open, activeWorkspaceId, isShared, loadRecent])

  if (!open) return null

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 340, zIndex: 180,
      display: 'flex', flexDirection: 'column',
      background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: 'var(--shadow-2)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>Team-Chat</span>
        <div style={{ display: 'flex', gap: 2 }}>
          <button className="icon-btn" title="Vollansicht" onClick={() => { setAppView('team'); setOpen(false) }}>
            <Maximize2 size={15} />
          </button>
          <button className="icon-btn" title="Schließen" onClick={() => setOpen(false)}>
            <X size={16} />
          </button>
        </div>
      </div>
      {!isShared ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center', fontSize: 12.5, color: 'var(--fg-dim)' }}>
          Team-Chat erscheint, sobald dieser Workspace geteilt ist (Einstellungen → Workspace teilen).
        </div>
      ) : (
        <>
          <MessageList compact />
          <ChatComposer />
        </>
      )}
    </div>
  )
}
