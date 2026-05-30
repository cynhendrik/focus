import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { useAccountsStore } from '@/store/accounts.store'
import { useCalendarStore } from '@/store/calendar.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { parseTaskText } from '@/components/tasks/prefix-parser'
import {
  MentionPopover, extractMentionQuery, useMentionPopoverState,
  type MentionCandidate,
} from '@/components/tasks/MentionPopover'
import { Calendar, Send } from 'lucide-react'

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

interface Props {
  onCreated?: () => void
}

/**
 * Quick Termin Composer — natural language event entry for the Calendar route.
 * Always creates a calendar event when a clock time is present. Use `@` for
 * customer mentions (same popover as the Task composer).
 */
export function QuickEventComposer({ onCreated }: Props = {}) {
  const accounts     = useAccountsStore(s => s.accounts)
  const upsertEvent  = useCalendarStore(s => s.upsert)
  const [text, setText] = useState('')
  const [mentions, setMentions] = useState<Array<{ marker: string; customerId: string }>>([])
  const submitRef = useRef<() => void>(() => {})
  const mention = useMentionPopoverState()
  const mentionStateRef = useRef(mention)
  mentionStateRef.current = mention

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
      Placeholder.configure({
        placeholder: 'Quick Termin · "Morgen 14:00 Call mit @Klara · 30m"',
      }),
    ],
    content: '',
    onUpdate: ({ editor }) => {
      const txt = editor.getText()
      setText(txt)
      const pos = editor.state.selection.from
      const before = txt.slice(0, Math.max(0, pos - 1))
      const q = extractMentionQuery(before)
      if (q) {
        const coords = editor.view.coordsAtPos(pos)
        mentionStateRef.current.setCtx({
          open: true,
          query: q.query,
          startOffset: q.startOffset,
          anchor: { top: coords.top - 240, left: coords.left },   // popover above (composer is at bottom)
        })
      } else if (mentionStateRef.current.ctx.open) {
        mentionStateRef.current.close()
      }
    },
    editorProps: {
      attributes: {
        class: 'quick-event-composer',
        style: 'outline:none; min-height:24px; padding:6px 4px; font-size:14px; color:var(--fg);',
      },
      handleKeyDown: (_view, event) => {
        const m = mentionStateRef.current
        if (m.ctx.open) {
          if (event.key === 'ArrowDown') { event.preventDefault(); m.setActiveIdx(m.activeIdx + 1); return true }
          if (event.key === 'ArrowUp')   { event.preventDefault(); m.setActiveIdx(Math.max(0, m.activeIdx - 1)); return true }
          if (event.key === 'Enter') {
            event.preventDefault()
            ;(window as unknown as { __cyneraPickMentionEvent?: () => void }).__cyneraPickMentionEvent?.()
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

  const draft = useMemo(() => parseTaskText(text, { mentions }), [text, mentions])

  const canSubmit = !!(draft.title.trim() && draft.scheduledAt && draft.hasExplicitTime)
  const missingTime = !!draft.title.trim() && (!draft.scheduledAt || !draft.hasExplicitTime)

  const pickMention = (cand: MentionCandidate) => {
    if (!editor) return
    const m = mentionStateRef.current
    if (!m.ctx.open) return
    const marker = `@${cand.name.split(' ')[0]}`
    const fullText = editor.getText()
    const pos = editor.state.selection.from
    const textOffset = Math.max(0, pos - 1)
    const before = fullText.slice(0, m.ctx.startOffset)
    const after  = fullText.slice(textOffset)
    const next = `${before}${marker} ${after}`
    editor.commands.setContent(next)
    const newCursor = (before + marker + ' ').length
    editor.commands.setTextSelection(newCursor + 1)
    setMentions(prev => {
      const without = prev.filter(p => p.marker.toLowerCase() !== marker.toLowerCase())
      return [...without, { marker, customerId: cand.id }]
    })
    m.close()
  }

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
    ;(window as unknown as { __cyneraPickMentionEvent?: () => void }).__cyneraPickMentionEvent = picker
    return () => { delete (window as unknown as { __cyneraPickMentionEvent?: () => void }).__cyneraPickMentionEvent }
  })

  const submit = async () => {
    if (!editor || !canSubmit) return
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    const createdBy   = useAuthStore.getState().user?.id ?? ''
    if (!workspaceId) return
    const minutes = draft.plannedMinutes ?? 30
    try {
      await upsertEvent({
        workspaceId, createdBy,
        accountId: draft.customerId,
        title: draft.title.trim(),
        startAt: isoLocal(draft.scheduledAt!),
        endAt:   isoLocal(addMinutes(draft.scheduledAt!, minutes)),
        allDay: false,
        color: 'accent',
      })
      editor.commands.clearContent()
      setText('')
      setMentions([])
      onCreated?.()
    } catch (e) {
      console.error('Quick event creation failed', e)
    }
  }

  useEffect(() => { submitRef.current = submit })

  return (
    <>
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      padding: '12px 16px',
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
        <Calendar size={15} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />
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
          Termin · Enter
          <Send size={11} />
        </button>
      </div>

      {/* Chips / Hints */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11.5, alignItems: 'center' }}>
        {draft.scheduledAt && (
          <Chip color="accent">
            📅 {new Date(draft.scheduledAt).toLocaleDateString('de', { weekday: 'short', day: '2-digit', month: 'short' })}
            {draft.hasExplicitTime && (
              <> · {new Date(draft.scheduledAt).toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' })}</>
            )}
          </Chip>
        )}
        {draft.plannedMinutes && <Chip color="muted">⏱ {draft.plannedMinutes}m</Chip>}
        {draft.customerId && (() => {
          const acc = accounts.find(a => a.id === draft.customerId)
          return acc ? <Chip color="accent">@ {acc.name}</Chip> : null
        })()}
        {missingTime && (
          <span style={{ color: 'var(--warn, oklch(70% 0.18 60))', fontSize: 11, fontWeight: 500 }}>
            ⓘ Uhrzeit fehlt — z.B. „14:00"
          </span>
        )}
        {!draft.scheduledAt && !draft.plannedMinutes && !draft.customerId && (
          <span style={{ color: 'var(--fg-dim)', fontSize: 11 }}>
            Datum · Uhrzeit · ~Dauer · @ Kunde
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
    </>
  )
}

function Chip({ children, color }: { children: React.ReactNode; color: 'accent' | 'muted' }) {
  const bg = color === 'accent' ? 'var(--accent-soft)' : 'oklch(50% 0 0 / 0.08)'
  const fg = color === 'accent' ? 'var(--accent-ink)'  : 'var(--fg-muted)'
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
