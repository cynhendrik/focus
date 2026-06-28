import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useChatOverlayStore } from '@/store/chat-overlay.store'
import { useMessagesStore } from '@/store/messages.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { TEAM_KEY } from '@/lib/chat/threads'
import { ChatSidebar } from './ChatSidebar'
import { MessageList } from './MessageList'
import { ChatComposer } from './ChatComposer'

/**
 * Team-Chat als große, mittige Overlay-Kachel — global gemountet, öffnet sich
 * über der aktuellen Ansicht (wie Quick Capture). Links die ChatSidebar
 * (Team + Mitglieder), rechts der bestehende Verlauf.
 */
export function TeamChatOverlay() {
  const open   = useChatOverlayStore(s => s.open)
  const toggle = useChatOverlayStore(s => s.toggle)
  const close  = useChatOverlayStore(s => s.close)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); toggle(); return }
      if (e.key === 'Escape' && open && !inField) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, close, open])

  return <AnimatePresence>{open && <Panel onClose={close} />}</AnimatePresence>
}

function Panel({ onClose }: { onClose: () => void }) {
  const loadOverview = useMessagesStore(s => s.loadOverview)
  const loadThread   = useMessagesStore(s => s.loadThread)
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId)
  const isShared = useWorkspaceStore(s => s.isActiveWorkspaceShared())

  useEffect(() => {
    if (activeWorkspaceId && isShared) {
      void loadOverview(activeWorkspaceId)
      void loadThread(activeWorkspaceId, TEAM_KEY)
    }
  }, [activeWorkspaceId, isShared, loadOverview, loadThread])

  return createPortal(
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 850, background: 'oklch(0% 0 0 / 0.35)' }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit   ={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.2, ease: [0.2, 0.7, 0.1, 1] }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Team-Chat"
        aria-modal="true"
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 860,
          width: 'min(880px, calc(100vw - 64px))', height: 'min(640px, calc(100vh - 96px))',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
          boxShadow: '0 24px 60px -16px oklch(0% 0 0 / 0.4)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>Team-Chat</span>
          <button className="icon-btn" title="Schließen" onClick={onClose}><X size={16} /></button>
        </div>

        {!isShared ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--fg-dim)',
          }}>
            Team-Chat erscheint, sobald dieser Workspace geteilt ist (Einstellungen → Workspace teilen).
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <ChatSidebar />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <MessageList />
              <ChatComposer />
            </div>
          </div>
        )}
      </motion.div>
    </>,
    document.body,
  )
}
