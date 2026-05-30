import { useEffect, useMemo, useState, type ReactNode } from 'react'

export interface MentionCandidate {
  id: string
  name: string
  company?: string
}

interface Props {
  open: boolean
  query: string
  candidates: MentionCandidate[]
  /** Screen-coordinates anchor — popover renders below this point. */
  anchor: { top: number; left: number } | null
  onSelect: (candidate: MentionCandidate) => void
  onClose: () => void
  /** Active index — controlled by parent so parent can intercept ↑↓ Enter from the editor. */
  activeIdx: number
  setActiveIdx: (i: number) => void
}

export function MentionPopover({
  open, query, candidates, anchor,
  onSelect, onClose, activeIdx, setActiveIdx,
}: Props) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return candidates.slice(0, 8)
    return candidates.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.company ?? '').toLowerCase().includes(q)
    ).slice(0, 8)
  }, [query, candidates])

  // Reset active index when filtered list changes
  useEffect(() => { setActiveIdx(0) }, [filtered.length, setActiveIdx])

  // Outside click closes
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (!el.closest?.('[data-mention-popover]')) onClose()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open, onClose])

  if (!open || !anchor) return null

  if (filtered.length === 0) {
    return (
      <div data-mention-popover style={{
        position: 'fixed', top: anchor.top, left: anchor.left, zIndex: 1100,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, boxShadow: 'var(--shadow-2)',
        padding: '10px 14px', fontSize: 12, color: 'var(--fg-dim)',
        minWidth: 240,
      }}>
        Kein Kunde für „{query}" gefunden.
      </div>
    )
  }

  return (
    <div data-mention-popover style={{
      position: 'fixed', top: anchor.top, left: anchor.left, zIndex: 1100,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, boxShadow: 'var(--shadow-2)',
      minWidth: 260, maxHeight: 280, overflowY: 'auto',
      padding: 4,
    }}>
      <div style={{
        padding: '6px 10px 4px', fontSize: 9.5, fontWeight: 700,
        color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        Kunde
      </div>
      {filtered.map((c, i) => {
        const active = i === activeIdx
        return (
          <div
            key={c.id}
            data-mention-row={i}
            onMouseDown={e => { e.preventDefault(); onSelect(c) }}
            onMouseEnter={() => setActiveIdx(i)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 10px', borderRadius: 7, cursor: 'pointer',
              background: active ? 'var(--accent-soft)' : 'transparent',
              color: active ? 'var(--accent-ink)' : 'var(--fg)',
              transition: 'background 80ms',
            }}
          >
            <AvatarBubble name={c.name} active={active} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.name}
              </div>
              {c.company && (
                <div style={{ fontSize: 10.5, color: 'var(--fg-dim)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.company}
                </div>
              )}
            </div>
            {active && <KbdHint>↵</KbdHint>}
          </div>
        )
      })}
    </div>
  )
}

function AvatarBubble({ name, active }: { name: string; active: boolean }) {
  const initials = name.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase()
  return (
    <div style={{
      width: 24, height: 24, borderRadius: 7,
      background: active ? 'var(--accent)' : 'oklch(50% 0 0 / 0.08)',
      color: active ? 'var(--accent-ink)' : 'var(--fg-muted)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 10, fontWeight: 700, flexShrink: 0,
      transition: 'background 80ms, color 80ms',
    }}>
      {initials}
    </div>
  )
}

function KbdHint({ children }: { children: ReactNode }) {
  return (
    <kbd style={{
      fontFamily: 'var(--font-mono)', fontSize: 9,
      padding: '1px 5px', borderRadius: 4,
      background: 'oklch(50% 0 0 / 0.12)',
      color: 'var(--fg-muted)', fontWeight: 700,
    }}>{children}</kbd>
  )
}

/** Inspect text up to cursor — returns the active @-query if cursor is inside a mention. */
export function extractMentionQuery(textBeforeCursor: string): { query: string; startOffset: number } | null {
  // Walk back from cursor: find last @ that has whitespace (or start) before it,
  // and no whitespace between it and the cursor.
  const at = textBeforeCursor.lastIndexOf('@')
  if (at === -1) return null
  // @ must be at start or preceded by whitespace
  if (at > 0 && !/\s/.test(textBeforeCursor[at - 1])) return null
  const tail = textBeforeCursor.slice(at + 1)
  // If user typed whitespace, mention is closed
  if (/\s/.test(tail)) return null
  return { query: tail, startOffset: at }
}

/** Track-style hook state — kept simple so composers can wire it however they want. */
export interface MentionContext {
  open: boolean
  query: string
  startOffset: number
  anchor: { top: number; left: number } | null
}

export const EMPTY_MENTION_CONTEXT: MentionContext = {
  open: false, query: '', startOffset: -1, anchor: null,
}

export function useMentionPopoverState() {
  const [ctx, setCtx] = useState<MentionContext>(EMPTY_MENTION_CONTEXT)
  const [activeIdx, setActiveIdx] = useState(0)
  const close = () => setCtx(EMPTY_MENTION_CONTEXT)
  return { ctx, setCtx, activeIdx, setActiveIdx, close }
}
