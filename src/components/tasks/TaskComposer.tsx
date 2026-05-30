import { useEffect, useMemo, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { useTodosStore } from '@/store/todos.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useCalendarStore } from '@/store/calendar.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { parseTaskText, type TaskDraft } from './prefix-parser'
import { CalendarEventConfirmCard, type PendingEventDraft } from './CalendarEventConfirmCard'
import { Plus, Send, Calendar } from 'lucide-react'

const PRIO_LABEL: Record<string, string> = {
  p1: 'Dringend', p2: 'Hoch', p3: 'Normal', p4: 'Niedrig',
}

// Calendar events store local-iso (no timezone offset), so we strip the Z and
// align the wall-clock time to what the user typed (e.g. "12:30").
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
  const [pendingEvent, setPendingEvent] = useState<PendingEventDraft | null>(null)
  const [pendingDraft, setPendingDraft] = useState<TaskDraft | null>(null)

  const placeholder = customerId
    ? 'Neue Task… "!! ~45m @10:00 #call Logo finalisieren"'
    : 'Was muss erledigt werden? "!! ~45m @10:00 #call +TechCorp …"'

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
    onUpdate: ({ editor }) => setText(editor.getText()),
    editorProps: {
      attributes: {
        class: 'tasks-composer-editor',
        style: 'outline:none; min-height:24px; padding:8px 4px; font-size:14px; color:var(--fg);',
      },
    },
  })

  const draft = useMemo(() => parseTaskText(text), [text])

  const resolvedCustomerId = useMemo(() => {
    if (customerId) return customerId
    if (!draft.customerHint) return undefined
    const lower = draft.customerHint.toLowerCase()
    const match = accounts.find(c => c.name.toLowerCase().includes(lower))
    return match?.id
  }, [customerId, draft.customerHint, accounts])

  const canSubmit = !!(draft.title.trim() || draft.tags.length || draft.customerHint)

  /** Persist a task (and optionally a linked calendar event), then reset composer. */
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
      title: eventOverride?.title ?? title,
      priority:       sourceDraft.priority ?? 'p3',
      scheduledAt:    sourceDraft.scheduledAt,
      plannedMinutes: eventOverride?.plannedMinutes ?? sourceDraft.plannedMinutes,
      tags:           sourceDraft.tags,
      customerId:     eventOverride?.customerId ?? resolvedCustomerId,
      calendarEventId,
      bucket:         sourceDraft.scheduledAt && sourceDraft.scheduledAt.slice(0, 10) === todayStr
                      ? 'today' : 'backlog',
    })

    editor.commands.clearContent()
    setText('')
    setPendingEvent(null)
    setPendingDraft(null)
  }

  const submit = async () => {
    if (!editor || !canSubmit) return
    const title = draft.title.trim() || '(ohne Titel)'
    const wantsCalendar = draft.hasExplicitTime && !!draft.scheduledAt

    // Termin erkannt → erst Bestätigung anzeigen, nicht direkt anlegen
    if (wantsCalendar) {
      setPendingDraft(draft)
      setPendingEvent({
        title,
        scheduledAt:    draft.scheduledAt!,
        plannedMinutes: draft.plannedMinutes ?? 30,
        customerId:     resolvedCustomerId,
      })
      return
    }

    // Reine Task ohne Uhrzeit → direkt anlegen
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

  useEffect(() => {
    if (!editor) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && editor.isFocused) {
        e.preventDefault()
        submit()
      }
    }
    const dom = editor.view.dom as HTMLElement
    dom.addEventListener('keydown', handler)
    return () => dom.removeEventListener('keydown', handler)
    // submit captures `draft` and `resolvedCustomerId` via closure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, draft, resolvedCustomerId])

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
        {draft.tags.map(t => <Chip key={t} color="muted">#{t}</Chip>)}
        {!customerId && draft.customerHint && (
          <Chip color={resolvedCustomerId ? 'accent' : 'danger'}>
            +{draft.customerHint}
            {!resolvedCustomerId && ' (nicht gefunden)'}
          </Chip>
        )}
        {!draft.scheduledAt && !draft.priority && !draft.plannedMinutes && !draft.tags.length && !draft.customerHint && (
          <span style={{ color: 'var(--fg-dim)', fontSize: 11 }}>
            {customerId
              ? '! Priorität · ~Zeit · @ wann · # Tag'
              : '! Priorität · ~Zeit · @ wann · # Tag · + Kunde'}
          </span>
        )}
      </div>
    </div>

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
