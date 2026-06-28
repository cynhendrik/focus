import { useEffect, useRef } from 'react'
import { useMessagesStore } from '@/store/messages.store'
import { useMembersStore } from '@/store/members.store'
import { useUiStore } from '@/store/ui.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { useGlobalComposerStore } from '@/store/global-composer.store'
import { TEAM_KEY } from '@/lib/chat/threads'
import { SystemMessageCard } from './SystemMessageCard'
import { TaskRefChip } from './TaskRefChip'
import type { Message } from '@/types/message.types'

function timeOf(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' })
}

export function MessageList({ compact = false, threadKey = TEAM_KEY }: { compact?: boolean; threadKey?: string }) {
  const t         = useMessagesStore(s => s.threads[threadKey])
  const messages  = t?.messages ?? []
  const hasMore   = t?.hasMore ?? false
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

  // Inbox → Nachricht (1/2): stabiler 1400ms Flash-Timer — NICHT abhängig von messages.length,
  // damit eingehende Nachrichten den Timer nicht zurücksetzen.
  useEffect(() => {
    if (!pendingScroll) return
    const id = pendingScroll
    const t = setTimeout(() => {
      const el = rowRefs.current.get(id)
      if (el) el.style.background = 'transparent'
      clearScroll(null)
    }, 1400)
    return () => { clearTimeout(t); clearScroll(null) }
  }, [pendingScroll, clearScroll])

  // Inbox → Nachricht (2/2): Scroll + Highlight — wiederholt wenn Zeile noch nicht gemountet.
  useEffect(() => {
    if (!pendingScroll) return
    const el = rowRefs.current.get(pendingScroll)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.style.transition = 'background 200ms'
    el.style.background = 'var(--accent-soft)'
  }, [pendingScroll, messages.length])

  const onScroll = () => {
    const el = scrollRef.current
    if (el && el.scrollTop < 40 && hasMore) {
      const wsId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
      if (wsId) void useMessagesStore.getState().loadMore(wsId, threadKey)
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
            <button
              onClick={() => useGlobalComposerStore.getState().openWith('! ' + m.body)}
              style={{
                alignSelf: mine ? 'flex-end' : 'flex-start', marginTop: 2,
                fontSize: 10.5, color: 'var(--fg-dim)', background: 'transparent',
                border: 'none', cursor: 'pointer',
              }}
            >
              In Aufgabe umwandeln
            </button>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
