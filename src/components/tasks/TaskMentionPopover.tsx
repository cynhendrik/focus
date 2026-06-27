import { useEffect, useMemo } from 'react'
import { Users, Building2 } from 'lucide-react'
import type { TaskMentionCandidate } from './task-mentions'

interface Props {
  open: boolean
  query: string
  candidates: TaskMentionCandidate[]
  anchor: { top: number; left: number } | null
  activeIdx: number
  setActiveIdx: (i: number) => void
  onSelect: (c: TaskMentionCandidate) => void
  onClose: () => void
}

/** Gefilterte flache Liste (Reihenfolge = Tastatur-Navigation). Max 8. */
export function filterTaskCandidates(candidates: TaskMentionCandidate[], query: string): TaskMentionCandidate[] {
  const q = query.trim().toLowerCase()
  const list = q ? candidates.filter(c => c.name.toLowerCase().includes(q)) : candidates
  return list.slice(0, 8)
}

export function TaskMentionPopover({ open, query, candidates, anchor, activeIdx, setActiveIdx, onSelect, onClose }: Props) {
  const filtered = useMemo(() => filterTaskCandidates(candidates, query), [candidates, query])
  useEffect(() => { setActiveIdx(0) }, [filtered.length, setActiveIdx])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.('[data-task-mention]')) onClose() }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open, onClose])

  if (!open || !anchor || filtered.length === 0) return null

  return (
    <div data-task-mention style={{
      position: 'fixed', top: anchor.top, left: anchor.left, zIndex: 1100,
      minWidth: 260, maxHeight: 280, overflowY: 'auto',
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
                borderTop: c.kind === 'customer' ? '1px solid var(--border)' : undefined,
                marginTop: c.kind === 'customer' ? 4 : 0, paddingTop: c.kind === 'customer' ? 8 : 6,
              }}>
                {c.kind === 'member' ? <Users size={11} /> : <Building2 size={11} />}
                {c.kind === 'member' ? 'Mitglieder' : 'Kunden'}
              </div>
            )}
            <div
              data-task-mention-row={i}
              onMouseDown={e => { e.preventDefault(); onSelect(c) }}
              onMouseEnter={() => setActiveIdx(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                borderRadius: 7, cursor: 'pointer',
                background: active ? 'var(--accent-soft)' : 'transparent',
                color: active ? 'var(--accent-ink)' : 'var(--fg)',
              }}
            >
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              {c.sub && <span style={{ fontSize: 10.5, color: 'var(--fg-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{c.sub}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
