import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Sparkles, Send, Calendar, CheckSquare, X, Home, Users, Mail, TrendingUp, Target, Settings } from 'lucide-react'

import { useTodosStore } from '@/store/todos.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useCalendarStore } from '@/store/calendar.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { useUiStore } from '@/store/ui.store'
import { useGlobalComposerStore } from '@/store/global-composer.store'

import { parseTaskText, type TaskDraft } from '@/components/tasks/prefix-parser'
import { CalendarEventConfirmCard, type PendingEventDraft } from '@/components/tasks/CalendarEventConfirmCard'
import {
  MentionPopover, extractMentionQuery, useMentionPopoverState,
  type MentionCandidate,
} from '@/components/tasks/MentionPopover'

const PRIO_LABEL: Record<string, string> = {
  p1: 'Dringend', p2: 'Hoch', p3: 'Normal', p4: 'Niedrig',
}

const APP_VIEW_LABEL: Partial<Record<string, { label: string; icon: typeof Home }>> = {
  dashboard: { label: 'Heute',     icon: Home       },
  clients:   { label: 'Clients',   icon: Users      },
  calendar:  { label: 'Kalender',  icon: Calendar   },
  mail:      { label: 'Mail',      icon: Mail       },
  pipeline:  { label: 'Pipeline',  icon: TrendingUp },
  leads:     { label: 'Leads',     icon: Target     },
  settings:  { label: 'Settings',  icon: Settings   },
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

export function GlobalQuickComposer() {
  const open  = useGlobalComposerStore(s => s.open)
  const close = useGlobalComposerStore(s => s.close)
  const toggle = useGlobalComposerStore(s => s.toggle)

  // Hotkey Cmd/Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        toggle()
        return
      }
      if (e.key === 'Escape' && open && !inField) {
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, close, open])

  return (
    <>
      {/* Floating Bubble — always visible */}
      <FloatingBubble open={open} onClick={toggle} />
      {/* Slide-up Panel */}
      <AnimatePresence>
        {open && <Panel onClose={close} />}
      </AnimatePresence>
    </>
  )
}

// ── Floating Bubble ──────────────────────────────────────────────────────────

function FloatingBubble({ open, onClick }: { open: boolean; onClick: () => void }) {
  return createPortal(
    <button
      onClick={onClick}
      aria-label={open ? 'Quick-Panel schließen' : 'Quick-Panel öffnen'}
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 800,
        width: 52, height: 52, borderRadius: '50%',
        background: open ? 'var(--surface)' : 'var(--accent)',
        color: open ? 'var(--fg-muted)' : 'var(--accent-ink)',
        border: `1px solid ${open ? 'var(--border)' : 'transparent'}`,
        boxShadow: open
          ? '0 6px 24px -8px oklch(0% 0 0 / 0.25)'
          : '0 10px 30px -8px var(--accent-glow), 0 0 0 6px oklch(80% 0.2 125 / 0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        transition: 'background 200ms, transform 180ms, box-shadow 220ms',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = '' }}
    >
      {open ? <X size={18} /> : <Sparkles size={18} />}
    </button>,
    document.body,
  )
}

// ── Panel ────────────────────────────────────────────────────────────────────

function Panel({ onClose }: { onClose: () => void }) {
  return createPortal(
    <>
      {/* Light backdrop, click closes */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 750,
          background: 'oklch(0% 0 0 / 0.18)',
        }}
      />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0,  scale: 1    }}
        exit   ={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ duration: 0.22, ease: [0.2, 0.7, 0.1, 1] }}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', bottom: 92, right: 24, zIndex: 760,
          width: 'min(520px, calc(100vw - 48px))',
          maxHeight: 'calc(100vh - 120px)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 18,
          boxShadow: '0 24px 60px -16px oklch(0% 0 0 / 0.4)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <ComposerInner onClose={onClose} />
      </motion.div>
    </>,
    document.body,
  )
}

// ── Composer Inner ───────────────────────────────────────────────────────────

function ComposerInner({ onClose }: { onClose: () => void }) {
  const upsert       = useTodosStore(s => s.upsert)
  const accounts     = useAccountsStore(s => s.accounts)
  const upsertEvent  = useCalendarStore(s => s.upsert)

  const selectedCustomerId = useUiStore(s => s.selectedCustomerId)
  const appView            = useUiStore(s => s.appView)
  const setAppView         = useUiStore(s => s.setAppView)
  const setSelectedCustomer = useUiStore(s => s.setSelectedCustomer)

  // Context-pinned customer: only when actively inside a customer detail page
  const pinnedCustomer = useMemo(() => {
    if (appView !== 'clients' || !selectedCustomerId) return undefined
    return accounts.find(a => a.id === selectedCustomerId)
  }, [appView, selectedCustomerId, accounts])

  const [text, setText] = useState('')
  const [mentions, setMentions] = useState<Array<{ marker: string; customerId: string }>>([])
  const [pendingEvent, setPendingEvent] = useState<PendingEventDraft | null>(null)
  const [pendingDraft, setPendingDraft] = useState<TaskDraft | null>(null)
  const [savedHint, setSavedHint] = useState<string | null>(null)

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
        placeholder: pinnedCustomer
          ? 'Was muss erledigt werden? "!! Brand morgen 14:00"'
          : 'Quick · "Morgen 14:00 Call mit @Klara" oder "!! Brand finalisieren"',
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
          anchor: { top: coords.bottom + 6, left: coords.left },
        })
      } else if (mentionStateRef.current.ctx.open) {
        mentionStateRef.current.close()
      }
    },
    autofocus: 'end',
    editorProps: {
      attributes: {
        class: 'global-quick-editor',
        style: 'outline:none; min-height:28px; padding:8px 4px; font-size:15px; color:var(--fg);',
      },
      handleKeyDown: (_view, event) => {
        const m = mentionStateRef.current
        if (m.ctx.open) {
          if (event.key === 'ArrowDown') { event.preventDefault(); m.setActiveIdx(m.activeIdx + 1); return true }
          if (event.key === 'ArrowUp')   { event.preventDefault(); m.setActiveIdx(Math.max(0, m.activeIdx - 1)); return true }
          if (event.key === 'Enter') {
            event.preventDefault()
            ;(window as unknown as { __cyneraPickMentionGlobal?: () => void }).__cyneraPickMentionGlobal?.()
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

  // Effective customer = pinned customer (if in customer page) OR draft.customerId from mention
  const effectiveCustomerId = useMemo(
    () => pinnedCustomer?.id ?? draft.customerId,
    [pinnedCustomer, draft.customerId],
  )

  const canSubmit = !!(draft.title.trim() || draft.tags.length || effectiveCustomerId)

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
    ;(window as unknown as { __cyneraPickMentionGlobal?: () => void }).__cyneraPickMentionGlobal = picker
    return () => { delete (window as unknown as { __cyneraPickMentionGlobal?: () => void }).__cyneraPickMentionGlobal }
  })

  const persist = async (sourceDraft: TaskDraft, eventOverride: PendingEventDraft | null) => {
    if (!editor) return
    const todayStr = new Date().toISOString().slice(0, 10)
    const title = sourceDraft.title.trim() || '(ohne Titel)'

    let calendarEventId: string | undefined
    let createdEventTitle: string | undefined
    if (eventOverride) {
      const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
      const createdBy   = useAuthStore.getState().user?.id ?? ''
      if (workspaceId) {
        try {
          const ev = await upsertEvent({
            workspaceId, createdBy,
            accountId:   eventOverride.customerId,
            title:       eventOverride.title,
            description: eventOverride.description,
            location:    eventOverride.location,
            startAt: isoLocal(eventOverride.scheduledAt),
            endAt:   isoLocal(addMinutes(eventOverride.scheduledAt, eventOverride.plannedMinutes)),
            allDay: false,
            color: 'accent',
          })
          calendarEventId = ev.id
          createdEventTitle = ev.title
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
      customerId:     eventOverride?.customerId ?? effectiveCustomerId,
      calendarEventId,
      bucket:         sourceDraft.scheduledAt && sourceDraft.scheduledAt.slice(0, 10) === todayStr
                      ? 'today' : 'backlog',
    })

    editor.commands.clearContent()
    setText('')
    setMentions([])
    setPendingEvent(null)
    setPendingDraft(null)
    setSavedHint(createdEventTitle ? `Termin „${createdEventTitle}" angelegt` : `Task „${title}" angelegt`)
    setTimeout(() => setSavedHint(null), 2200)
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
    await persist(draft, null)
  }

  useEffect(() => { submitRef.current = submit })

  /** Jump to the resolved customer's detail page */
  const goToCustomer = () => {
    if (!effectiveCustomerId) return
    setSelectedCustomer(effectiveCustomerId)
    setAppView('clients')
    onClose()
  }

  const wantsCalendar = draft.hasExplicitTime && !!draft.scheduledAt
  const routingHint = wantsCalendar ? 'Termin (Calendar)' : 'Task'

  return (
    <>
      {/* Header with context indicator */}
      <ContextHeader pinnedCustomer={pinnedCustomer} appView={appView} onClose={onClose} />

      {/* Composer body */}
      <div style={{ padding: '16px 18px 12px' }}>
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 10,
          padding: '12px 14px',
          background: 'var(--surface-2)', borderRadius: 12,
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
            {wantsCalendar
              ? <Calendar size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              : <CheckSquare size={16} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <EditorContent editor={editor} />
            </div>
            <button
              onClick={submit}
              disabled={!canSubmit}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '7px 13px', borderRadius: 99,
                background: canSubmit ? 'var(--accent)' : 'oklch(50% 0 0 / 0.08)',
                color: canSubmit ? 'var(--accent-ink)' : 'var(--fg-dim)',
                fontSize: 12, fontWeight: 700,
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
                {draft.hasExplicitTime && (
                  <> · {new Date(draft.scheduledAt).toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' })}</>
                )}
              </Chip>
            )}
            {draft.priority && <Chip color="warn">● {PRIO_LABEL[draft.priority]}</Chip>}
            {draft.plannedMinutes && <Chip color="muted">⏱ {draft.plannedMinutes}m</Chip>}
            {wantsCalendar && (
              <Chip color="accent">
                <Calendar size={10} style={{ marginRight: 4, display: 'inline', verticalAlign: '-1px' }} />
                Kalender
              </Chip>
            )}
            {draft.tags.map(t => <Chip key={t} color="muted">#{t}</Chip>)}
            {effectiveCustomerId && !pinnedCustomer && (() => {
              const acc = accounts.find(a => a.id === effectiveCustomerId)
              return acc ? (
                <Chip color="accent" onClick={goToCustomer} clickable>
                  @ {acc.name}
                </Chip>
              ) : null
            })()}
            {!draft.scheduledAt && !draft.priority && !draft.plannedMinutes && !draft.tags.length && !draft.customerId && (
              <span style={{ color: 'var(--fg-dim)', fontSize: 11 }}>
                {pinnedCustomer
                  ? '! Priorität · Datum · Uhrzeit · # Tag'
                  : '! Priorität · Datum · Uhrzeit · # Tag · @ Kunde'}
              </span>
            )}
          </div>
        </div>

        {/* Routing hint */}
        <div style={{
          marginTop: 8, fontSize: 11, color: 'var(--fg-dim)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>
            {savedHint ? <span style={{ color: 'var(--accent)', fontWeight: 600 }}>✓ {savedHint}</span> : <>→ Enter erstellt: <strong style={{ color: 'var(--fg-muted)' }}>{routingHint}</strong></>}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            <Kbd>Esc</Kbd> schließen · <Kbd>⌘K</Kbd> toggle
          </span>
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
        onConfirm={(f) => pendingDraft && persist(pendingDraft, f)}
        onTaskOnly={() => pendingDraft && persist(pendingDraft, null)}
        onCancel={() => { setPendingEvent(null); setPendingDraft(null) }}
      />
    </>
  )
}

// ── Header / Context ─────────────────────────────────────────────────────────

function ContextHeader({
  pinnedCustomer, appView, onClose,
}: {
  pinnedCustomer: { name: string; industry?: string } | undefined
  appView: string
  onClose: () => void
}) {
  const viewMeta = APP_VIEW_LABEL[appView]
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '14px 18px 10px',
      borderBottom: '1px solid var(--border)',
    }}>
      <Sparkles size={14} style={{ color: 'var(--accent)' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--fg-dim)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Quick · Kontext
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
          {pinnedCustomer ? (
            <>📍 {pinnedCustomer.name}{pinnedCustomer.industry && <span style={{ color: 'var(--fg-dim)', fontWeight: 400 }}> · {pinnedCustomer.industry}</span>}</>
          ) : viewMeta ? (
            <>
              <viewMeta.icon size={13} style={{ color: 'var(--fg-muted)' }} />
              {viewMeta.label}
            </>
          ) : (
            <>📍 Workspace</>
          )}
        </div>
      </div>
      <button onClick={onClose} style={{
        width: 28, height: 28, borderRadius: 8,
        background: 'oklch(50% 0 0 / 0.06)',
        color: 'var(--fg-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
      }}>
        <X size={13} />
      </button>
    </div>
  )
}

// ── Chip + Kbd ───────────────────────────────────────────────────────────────

interface ChipProps {
  children: React.ReactNode
  color: 'accent' | 'warn' | 'muted'
  clickable?: boolean
  onClick?: () => void
}
function Chip({ children, color, clickable, onClick }: ChipProps) {
  const bg = color === 'accent' ? 'var(--accent-soft)'
            : color === 'warn'  ? 'oklch(85% 0.13 60 / 0.18)'
            : 'oklch(50% 0 0 / 0.08)'
  const fg = color === 'accent' ? 'var(--accent-ink)'
            : color === 'warn'  ? 'oklch(50% 0.15 60)'
            : 'var(--fg-muted)'
  return (
    <span
      onClick={onClick}
      style={{
        padding: '3px 9px', borderRadius: 99,
        background: bg, color: fg, fontWeight: 600,
        fontSize: 11, letterSpacing: '0.01em',
        cursor: clickable ? 'pointer' : 'default',
        userSelect: 'none',
      }}
      title={clickable ? 'Zum Kunden springen' : undefined}
    >
      {children}
    </span>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{
      fontFamily: 'var(--font-mono)', fontSize: 9.5,
      padding: '1px 5px', borderRadius: 4,
      background: 'oklch(50% 0 0 / 0.1)',
      color: 'var(--fg-muted)', fontWeight: 700,
    }}>
      {children}
    </kbd>
  )
}
