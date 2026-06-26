import { useEffect, useMemo } from 'react'
import { Users, CheckSquare } from 'lucide-react'
import type { ChatMentionCandidate } from '@/lib/chat/mentions'

interface Props {
  open: boolean
  query: string
  candidates: ChatMentionCandidate[]
  activeIdx: number
  setActiveIdx: (i: number) => void
  onSelect: (c: ChatMentionCandidate) => void
  onClose: () => void
}

/** Liefert die gefilterte, flache Liste (Reihenfolge = Tastatur-Navigation). Max 8. */
export function filterMentionCandidates(candidates: ChatMentionCandidate[], query: string): ChatMentionCandidate[] {
  const q = query.trim().toLowerCase()
  const list = q ? candidates.filter(c => c.name.toLowerCase().includes(q)) : candidates
  return list.slice(0, 8)
}

export function ChatMentionPopover({ open, query, candidates, activeIdx, setActiveIdx, onSelect, onClose }: Props) {
  const filtered = useMemo(() => filterMentionCandidates(candidates, query), [candidates, query])

  useEffect(() => { setActiveIdx(0) }, [filtered.length, setActiveIdx])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.('[data-chat-mention]')) onClose()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open, onClose])

  if (!open || filtered.length === 0) return null

  // Gruppen-Header nur am Wechsel kind member→task rendern.
  return (
    <div data-chat-mention style={{
      position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0,
      maxHeight: 260, overflowY: 'auto', zIndex: 50,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, boxShadow: 'var(--shadow-2)', padding: 4,
    }}>
      {filtered.map((c, i) => {
        const showHeader = i === 0 || filtered[i - 1].kind !== c.kind
        const active = i === activeIdx
        return (
          <div key={`${c.kind}-${c.id}`}>
            {showHeader && (
              <div style={{
                padding: '6px 10px 4px', fontSize: 9.5, fontWeight: 700,
                color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.08em',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {c.kind === 'member' ? <Users size={11} /> : <CheckSquare size={11} />}
                {c.kind === 'member' ? 'Mitglieder' : 'Aufgaben'}
              </div>
            )}
            <div
              data-chat-mention-row={i}
              onMouseDown={e => { e.preventDefault(); onSelect(c) }}
              onMouseEnter={() => setActiveIdx(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                borderRadius: 7, cursor: 'pointer',
                background: active ? 'var(--accent-soft)' : 'transparent',
                color: active ? 'var(--accent-ink)' : 'var(--fg)',
              }}
            >
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.name}
              </span>
              {c.sub && (
                <span style={{ fontSize: 10.5, color: 'var(--fg-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                  {c.sub}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
