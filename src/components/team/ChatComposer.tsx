import { useMemo, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { useMessagesStore } from '@/store/messages.store'
import { useMembersStore } from '@/store/members.store'
import { useTodosStore } from '@/store/todos.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { extractMentionQuery } from '@/components/tasks/MentionPopover'
import { ChatMentionPopover, filterMentionCandidates } from './ChatMentionPopover'
import {
  buildMentionCandidates, markerFor, resolveComposed,
  type ChatMentionCandidate, type ResolvedMarker,
} from '@/lib/chat/mentions'

interface Props {
  contextRef?: { refType: 'task' | 'account'; refId: string }
}

export function ChatComposer({ contextRef }: Props = {}) {
  const send       = useMessagesStore(s => s.send)
  const members    = useMembersStore(s => s.members())
  const allTodos   = useTodosStore(s => s.allTodos)
  const [text, setText]       = useState('')
  const [markers, setMarkers] = useState<ResolvedMarker[]>([])
  const [mq, setMq]           = useState<{ open: boolean; query: string; start: number }>({ open: false, query: '', start: -1 })
  const [activeIdx, setActiveIdx] = useState(0)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const candidates = useMemo(
    () => buildMentionCandidates(members, allTodos),
    [members, allTodos],
  )

  const recomputeMention = (value: string, caret: number) => {
    const before = value.slice(0, caret)
    const q = extractMentionQuery(before)
    if (q) setMq({ open: true, query: q.query, start: q.startOffset })
    else setMq({ open: false, query: '', start: -1 })
  }

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    recomputeMention(e.target.value, e.target.selectionStart ?? e.target.value.length)
  }

  const pick = (c: ChatMentionCandidate) => {
    const ta = taRef.current
    if (!ta || mq.start < 0) return
    const caret = ta.selectionStart ?? text.length
    const marker = markerFor(c)
    const next = `${text.slice(0, mq.start)}${marker} ${text.slice(caret)}`
    setText(next)
    setMarkers(prev => [...prev.filter(m => m.marker !== marker), { kind: c.kind, id: c.id, marker }])
    setMq({ open: false, query: '', start: -1 })
    queueMicrotask(() => { ta.focus(); const p = mq.start + marker.length + 1; ta.setSelectionRange(p, p) })
  }

  const submit = async () => {
    const body = text.trim()
    if (!body) return
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    const createdBy   = useAuthStore.getState().user?.id ?? ''
    if (!workspaceId || !createdBy) return
    // Nur tatsächlich noch im Text vorhandene Marker zählen.
    const live = markers.filter(m => body.includes(m.marker))
    const { mentions, ref } = resolveComposed(live)
    const effectiveRef = ref ?? (contextRef ? { refType: contextRef.refType, refId: contextRef.refId } : null)
    try {
      await send({
        workspaceId, createdBy, body,
        mentions,
        refType: effectiveRef?.refType ?? null,
        refId:   effectiveRef?.refId ?? null,
      })
      setText(''); setMarkers([]); setMq({ open: false, query: '', start: -1 })
    } catch {
      // send-Fehler werden im Store geloggt; Eingabe bleibt erhalten.
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mq.open) {
      const filtered = filterMentionCandidates(candidates, mq.query)
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(filtered.length - 1, i + 1)); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1)); return }
      if (e.key === 'Enter')     { e.preventDefault(); const c = filtered[activeIdx]; if (c) pick(c); return }
      if (e.key === 'Escape')    { e.preventDefault(); setMq({ open: false, query: '', start: -1 }); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit() }
  }

  return (
    <div style={{ position: 'relative', padding: 12, borderTop: '1px solid var(--border)' }}>
      <ChatMentionPopover
        open={mq.open} query={mq.query} candidates={candidates}
        activeIdx={activeIdx} setActiveIdx={setActiveIdx}
        onSelect={pick} onClose={() => setMq({ open: false, query: '', start: -1 })}
      />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <textarea
          ref={taRef}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Nachricht … @Person oder @Aufgabe erwähnen"
          style={{
            flex: 1, resize: 'none', minHeight: 38, maxHeight: 140,
            padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--surface-2)', color: 'var(--fg)', fontSize: 13.5,
            fontFamily: 'inherit', outline: 'none',
          }}
        />
        <button
          onClick={() => void submit()}
          disabled={!text.trim()}
          title="Senden (Enter)"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: text.trim() ? 'var(--accent)' : 'oklch(50% 0 0 / 0.08)',
            color: text.trim() ? 'var(--accent-ink)' : 'var(--fg-dim)',
            border: 'none', cursor: text.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  )
}
