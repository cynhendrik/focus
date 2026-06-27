import { useState } from 'react'

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
