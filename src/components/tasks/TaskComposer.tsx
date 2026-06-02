import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { useTodosStore } from '@/store/todos.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useCalendarStore } from '@/store/calendar.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { parseTaskText, type TaskDraft } from './prefix-parser'
import { detectActionType, ACTION_TYPE_LABELS } from '@/lib/action-keywords'
import { CalendarEventConfirmCard, type PendingEventDraft } from './CalendarEventConfirmCard'
import {
  MentionPopover, extractMentionQuery, useMentionPopoverState,
  type MentionCandidate,
} from './MentionPopover'
import { Plus, Send, Calendar } from 'lucide-react'

const PRIO_LABEL: Record<string, string> = {
  p1: 'Dringend', p2: 'Hoch', p3: 'Normal', p4: 'Niedrig',
}

function isoLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` +
         `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function addMinutes(iso: string, minutes: number): string {
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() + minutes)
  return d.toISOString()
}

interface Props { customerId?: string }

export function TaskComposer({ customerId }: Props = {}) {
  const upsert       = useTodosStore(s => s.upsert)
  const accounts     = useAccountsStore(s => s.accounts)
  const upsertEvent  = useCalendarStore(s => s.upsert)
  const [text, setText] = useState('')
  /** Resolved mentions: marker (e.g. "@Klara") → customerId */
  const [mentions, setMentions] = useState<Array<{ marker: string; customerId: string }>>([])
  const [pendingEvent, setPendingEvent] = useState<PendingEventDraft | null>(null)
  const [pendingDraft, setPendingDraft] = useState<TaskDraft | null>(null)
  const submitRef = useRef<() => void>(() => {})
  const mention = useMentionPopoverState()
  const mentionStateRef = useRef(mention)
  mentionStateRef.current = mention

  const placeholder = customerId
    ? 'Was muss erledigt werden? "!! morgen 10:00 #call Logo finalisieren"'
    : 'Was muss erledigt werden? "!! morgen 10:00 #call Termin mit @Klara"'

  const candidates: MentionCandidate[] = useMemo(
    () => accounts.filter(a => !a.isPrivate).map(a => ({ id: a.id, name: a.name, company: a.industry })),
    [accounts],
  )

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, bulletList: false, orderedList: false,
        listItem: false, blockquote: false, codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: '',
    onUpdate: ({ editor }) => {
      const txt = editor.getText()
      setText(txt)
      // Detect mention context: text up to current cursor
      const pos = editor.state.selection.from
      const before = txt.slice(0, posToTextOffset(editor, pos))
      const q = extractMentionQuery(before)
      if (q) {
        const coords = editor.view.coordsAtPos(pos)
        mentionStateRef.current.setCtx({
          open: true,
          query: q.query,
          startOffset: q.startOffset,
          anchor: { top: coords.bottom + 6, left: coords.left },
        })
      } else if (mentionStateRef.current.ctx.open) {
        mentionStateRef.current.close()
      }
    },
    editorProps: {
      attributes: {
        class: 'tasks-composer-editor',
        style: 'outline:none; min-height:24px; padding:8px 4px; font-size:14px; color:var(--fg);',
      },
      // Capture Enter / ArrowUp / ArrowDown before ProseMirror processes them.
      handleKeyDown: (_view, event) => {
        const m = mentionStateRef.current
        if (m.ctx.open) {
          if (event.key === 'ArrowDown') { event.preventDefault(); m.setActiveIdx(m.activeIdx + 1); return true }
          if (event.key === 'ArrowUp')   { event.preventDefault(); m.setActiveIdx(Math.max(0, m.activeIdx - 1)); return true }
          if (event.key === 'Enter') {
            event.preventDefault()
            ;(window as unknown as { __cyneraPickMention?: () => void }).__cyneraPickMention?.()
            return true
          }
          if (event.key === 'Escape') { event.preventDefault(); m.close(); return true }
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          submitRef.current()
          return true
        }
        return false
      },
    },
  })

  // Parse the text with currently resolved mentions
  const draft = useMemo(() => {
    const parsed = parseTaskText(text, { mentions })
    parsed.actionType = detectActionType(parsed.title) ?? undefined
    return parsed
  }, [text, mentions])

  const effectiveCustomerId = useMemo(
    () => customerId ?? draft.customerId,
    [customerId, draft.customerId],
  )

  const canSubmit = !!(draft.title.trim() || draft.tags.length || effectiveCustomerId)

  /** Insert the mention marker (display = @Name) and record it in `mentions`. */
  const pickMention = (cand: MentionCandidate) => {
    if (!editor) return
    const m = mentionStateRef.current
    if (!m.ctx.open) return
    const marker = `@${cand.name.split(' ')[0]}`   // first word, keeps it short
    // Replace from startOffset to current cursor with `marker + space`
    // We use text-level replacement via editor commands.
    const fullText = editor.getText()
    const pos = editor.state.selection.from
    const textOffset = posToTextOffset(editor, pos)
    const before = fullText.slice(0, m.ctx.startOffset)
    const after  = fullText.slice(textOffset)
    const next = `${before}${marker} ${after}`
    editor.commands.setContent(next)
    // Place cursor at end of marker+space
    const newCursor = (before + marker + ' ').length
    editor.commands.setTextSelection(textOffsetToPos(editor, newCursor))
    // Record the mention
    setMentions(prev => {
      // dedupe by marker
      const without = prev.filter(p => p.marker.toLowerCase() !== marker.toLowerCase())
      return [...without, { marker, customerId: cand.id }]
    })
    m.close()
  }

  // Expose pickMention to the handleKeyDown closure via a stable window-bound function.
  useEffect(() => {
    const picker = () => {
      const m = mentionStateRef.current
      if (!m.ctx.open) return
      const q = m.ctx.query.toLowerCase().trim()
      const filtered = q
        ? candidates.filter(c =>
            c.name.toLowerCase().includes(q) || (c.company ?? '').toLowerCase().includes(q))
        : candidates
      const cand = filtered[m.activeIdx]
      if (cand) pickMention(cand)
    }
    ;(window as unknown as { __cyneraPickMention?: () => void }).__cyneraPickMention = picker
    return () => { delete (window as unknown as { __cyneraPickMention?: () => void }).__cyneraPickMention }
  })

  const persistTaskAndOptionalEvent = async (
    sourceDraft: TaskDraft,
    eventOverride: PendingEventDraft | null,
  ) => {
    if (!editor) return
    const todayStr = new Date().toISOString().slice(0, 10)
    const title = sourceDraft.title.trim() || '(ohne Titel)'

    let calendarEventId: string | undefined
    if (eventOverride) {
      const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
      const createdBy   = useAuthStore.getState().user?.id ?? ''
      if (workspaceId) {
        const startAt = isoLocal(eventOverride.scheduledAt)
        const endAt   = isoLocal(addMinutes(eventOverride.scheduledAt, eventOverride.plannedMinutes))
        try {
          const ev = await upsertEvent({
            workspaceId, createdBy,
            accountId:   eventOverride.customerId,
            title:       eventOverride.title,
            description: eventOverride.description,
            location:    eventOverride.location,
            startAt, endAt, allDay: false,
            color: 'accent',
          })
          calendarEventId = ev.id
        } catch (e) {
          console.error('Calendar event creation failed', e)
        }
      }
    }

    await upsert({
      title:          eventOverride?.title ?? title,
      priority:       sourceDraft.priority ?? 'p3',
      scheduledAt:    sourceDraft.scheduledAt,
      plannedMinutes: eventOverride?.plannedMinutes ?? sourceDraft.plannedMinutes,
      tags:           sourceDraft.tags,
      customerId:     eventOverride?.customerId ?? effectiveCustomerId,
      calendarEventId,
      actionType:     sourceDraft.actionType,
      bucket:         sourceDraft.scheduledAt && sourceDraft.scheduledAt.slice(0, 10) === todayStr
                      ? 'today' : 'backlog',
    })

    editor.commands.clearContent()
    setText('')
    setMentions([])
    setPendingEvent(null)
    setPendingDraft(null)
  }

  const submit = async () => {
    if (!editor || !canSubmit) return
    const title = draft.title.trim() || '(ohne Titel)'
    const wantsCalendar = draft.hasExplicitTime && !!draft.scheduledAt

    if (wantsCalendar) {
      setPendingDraft(draft)
      setPendingEvent({
        title,
        scheduledAt:    draft.scheduledAt!,
        plannedMinutes: draft.plannedMinutes ?? 30,
        customerId:     effectiveCustomerId,
      })
      return
    }

    await persistTaskAndOptionalEvent(draft, null)
  }

  const confirmPending = async (finalDraft: PendingEventDraft) => {
    if (!pendingDraft) return
    await persistTaskAndOptionalEvent(pendingDraft, finalDraft)
  }
  const skipEventForPending = async () => {
    if (!pendingDraft) return
    await persistTaskAndOptionalEvent(pendingDraft, null)
  }
  const cancelPending = () => {
    setPendingEvent(null)
    setPendingDraft(null)
  }

  useEffect(() => { submitRef.current = submit })

  return (
    <>
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      padding: '12px 14px',
      background: 'var(--surface-2)',
      borderRadius: 14,
      border: '1px solid var(--border)',
      transition: 'border-color 200ms, box-shadow 200ms',
    }}
    onFocusCapture={e => {
      e.currentTarget.style.borderColor = 'var(--accent)'
      e.currentTarget.style.boxShadow = '0 0 0 4px var(--accent-soft)'
    }}
    onBlurCapture={e => {
      e.currentTarget.style.borderColor = 'var(--border)'
      e.currentTarget.style.boxShadow = 'none'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Plus size={15} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <EditorContent editor={editor} />
        </div>
        <button
          onClick={submit}
          disabled={!canSubmit}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', borderRadius: 99,
            background: canSubmit ? 'var(--accent)' : 'oklch(50% 0 0 / 0.08)',
            color: canSubmit ? 'var(--accent-ink)' : 'var(--fg-dim)',
            fontSize: 11.5, fontWeight: 600,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            flexShrink: 0,
            transition: 'background 160ms, color 160ms',
          }}
        >
          Enter
          <Send size={11} />
        </button>
      </div>

      {/* Live-Chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11.5 }}>
        {draft.scheduledAt && (
          <Chip color="accent">
            📅 {new Date(draft.scheduledAt).toLocaleDateString('de', { day: '2-digit', month: 'short' })}
            {' · '}
            {new Date(draft.scheduledAt).toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' })}
          </Chip>
        )}
        {draft.priority && <Chip color="warn">● {PRIO_LABEL[draft.priority]}</Chip>}
        {draft.plannedMinutes && <Chip color="muted">⏱ {draft.plannedMinutes}m</Chip>}
        {draft.hasExplicitTime && draft.scheduledAt && (
          <Chip color="accent">
            <Calendar size={10} style={{ marginRight: 4, display: 'inline', verticalAlign: '-1px' }} />
            Kalender · {draft.plannedMinutes ?? 30}m
          </Chip>
        )}
        {draft.actionType && ACTION_TYPE_LABELS[draft.actionType] && (
          <Chip color="accent">{ACTION_TYPE_LABELS[draft.actionType]}</Chip>
        )}
        {draft.tags.map(t => <Chip key={t} color="muted">#{t}</Chip>)}
        {!customerId && effectiveCustomerId && (() => {
          const acc = accounts.find(a => a.id === effectiveCustomerId)
          return acc ? <Chip color="accent">@ {acc.name}</Chip> : null
        })()}
        {!draft.scheduledAt && !draft.priority && !draft.plannedMinutes && !draft.tags.length && !effectiveCustomerId && (
          <span style={{ color: 'var(--fg-dim)', fontSize: 11 }}>
            {customerId
              ? '! Priorität · Zeit · Datum · # Tag'
              : '! Priorität · Zeit · Datum · # Tag · @ Kunde'}
          </span>
        )}
      </div>
    </div>

    <MentionPopover
      open={mention.ctx.open}
      query={mention.ctx.query}
      candidates={candidates}
      anchor={mention.ctx.anchor}
      activeIdx={mention.activeIdx}
      setActiveIdx={mention.setActiveIdx}
      onSelect={pickMention}
      onClose={mention.close}
    />

    <CalendarEventConfirmCard
      open={!!pendingEvent}
      draft={pendingEvent}
      onConfirm={confirmPending}
      onTaskOnly={skipEventForPending}
      onCancel={cancelPending}
    />
    </>
  )
}

/** Map a ProseMirror position to the equivalent offset in `editor.getText()`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function posToTextOffset(editor: any, pos: number): number {
  // Simple: count text characters from start of doc to pos, treating each non-text node as a single \n.
  // For our single-line composer this is essentially: pos - 1 (PM uses 1-indexed pos with doc-start=0+1).
  // Heuristic that works for the StarterKit single-paragraph case:
  return Math.max(0, pos - 1)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function textOffsetToPos(_editor: any, offset: number): number {
  return offset + 1
}

function Chip({ children, color }: { children: React.ReactNode; color: 'accent' | 'warn' | 'muted' | 'danger' }) {
  const bg = color === 'accent' ? 'var(--accent-soft)'
            : color === 'warn'  ? 'oklch(85% 0.13 60 / 0.18)'
            : color === 'danger' ? 'oklch(70% 0.18 25 / 0.18)'
            : 'oklch(50% 0 0 / 0.08)'
  const fg = color === 'accent' ? 'var(--accent-ink)'
            : color === 'warn'  ? 'oklch(50% 0.15 60)'
            : color === 'danger' ? 'oklch(50% 0.2 25)'
            : 'var(--fg-muted)'
  return (
    <span style={{
      padding: '3px 9px', borderRadius: 99,
      background: bg, color: fg, fontWeight: 600,
      fontSize: 11, letterSpacing: '0.01em',
    }}>
      {children}
    </span>
  )
}
