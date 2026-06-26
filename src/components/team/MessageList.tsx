import { useEffect, useRef } from 'react'
import { useMessagesStore } from '@/store/messages.store'
import { useMembersStore } from '@/store/members.store'
import { useUiStore } from '@/store/ui.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { SystemMessageCard } from './SystemMessageCard'
import { TaskRefChip } from './TaskRefChip'
import type { Message } from '@/types/message.types'

function timeOf(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' })
}

export function MessageList({ compact = false }: { compact?: boolean }) {
  const messages  = useMessagesStore(s => s.messages)
  const hasMore   = useMessagesStore(s => s.hasMore)
  const loadMore  = useMessagesStore(s => s.loadMore)
  const nameOf    = useMembersStore(s => s.nameOf)
  const myId      = useAuthStore(s => s.user?.id)
  const pendingScroll = useUiStore(s => s.pendingScrollMessageId)
  const clearScroll   = useUiStore(s => s.setPendingScrollMessageId)

  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const rowRefs   = useRef<Map<string, HTMLDivElement>>(new Map())

  // Neueste Nachricht: ans Ende scrollen (außer der Nutzer liest Älteres).
  useEffect(() => {
    if (pendingScroll) return
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, pendingScroll])

  // Inbox → Nachricht: scrollen + kurz hervorheben.
  useEffect(() => {
    if (!pendingScroll) return
    const el = rowRefs.current.get(pendingScroll)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.style.transition = 'background 200ms'
    el.style.background = 'var(--accent-soft)'
    const t = setTimeout(() => { el.style.background = 'transparent'; clearScroll(null) }, 1400)
    return () => clearTimeout(t)
  }, [pendingScroll, messages.length, clearScroll])

  const onScroll = () => {
    const el = scrollRef.current
    if (el && el.scrollTop < 40 && hasMore) {
      const wsId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
      if (wsId) void loadMore(wsId)
    }
  }

  return (
    <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, overflowY: 'auto', padding: compact ? 10 : '16px 20px', minHeight: 0 }}>
      {hasMore && (
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--fg-dim)', padding: 6 }}>
          Ältere Nachrichten werden beim Hochscrollen geladen …
        </div>
      )}
      {messages.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--fg-dim)', fontSize: 13, padding: 40 }}>
          Noch keine Nachrichten. Schreib die erste. 💬
        </div>
      )}
      {messages.map((m: Message) => {
        if (m.kind === 'system') return <SystemMessageCard key={m.id} message={m} />
        const mine = m.createdBy === myId
        return (
          <div
            key={m.id}
            ref={el => { if (el) rowRefs.current.set(m.id, el); else rowRefs.current.delete(m.id) }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', margin: '6px 0', borderRadius: 8 }}
          >
            <div style={{ fontSize: 10.5, color: 'var(--fg-dim)', margin: '0 4px 2px' }}>
              {mine ? 'Du' : nameOf(m.createdBy)} · {timeOf(m.createdAt)}
            </div>
            <div style={{
              maxWidth: '78%', padding: '8px 12px', borderRadius: 12,
              background: mine ? 'var(--accent)' : 'var(--surface-2)',
              color: mine ? 'var(--accent-ink)' : 'var(--fg)',
              fontSize: 13.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {m.body}
            </div>
            {m.refType === 'task' && m.refId && <TaskRefChip taskId={m.refId} />}
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
