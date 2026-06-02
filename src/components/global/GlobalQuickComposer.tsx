import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { invoke } from '@tauri-apps/api/core'
import {
  Sparkles, Send, Calendar, CheckSquare, X,
  Home, Users, Mail, TrendingUp, Target, Settings, Loader,
} from 'lucide-react'

import { useTodosStore } from '@/store/todos.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useFinanceStore } from '@/store/finance.store'
import { useCalendarStore } from '@/store/calendar.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { useUiStore } from '@/store/ui.store'
import { useGlobalComposerStore } from '@/store/global-composer.store'
import { getApiKey, MissingApiKeyError } from '@/lib/ai/briefing'
import { detectActionType, ACTION_TYPE_LABELS } from '@/lib/action-keywords'

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
  dashboard: { label: 'Heute',    icon: Home       },
  clients:   { label: 'Clients',  icon: Users      },
  calendar:  { label: 'Kalender', icon: Calendar   },
  mail:      { label: 'Mail',     icon: Mail       },
  pipeline:  { label: 'Pipeline', icon: TrendingUp },
  leads:     { label: 'Leads',    icon: Target     },
  settings:  { label: 'Settings', icon: Settings   },
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

interface AnthropicTextBlock { type: 'text'; text: string }
interface AnthropicResponse  { content: Array<AnthropicTextBlock | { type: string }> }

// ── Component ────────────────────────────────────────────────────────────────

export function GlobalQuickComposer() {
  const open   = useGlobalComposerStore(s => s.open)
  const close  = useGlobalComposerStore(s => s.close)
  const toggle = useGlobalComposerStore(s => s.toggle)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); toggle(); return }
      if (e.key === 'Escape' && open && !inField) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, close, open])

  return (
    <>
      <FloatingBubble open={open} onClick={toggle} />
      <AnimatePresence>{open && <Panel onClose={close} />}</AnimatePresence>
    </>
  )
}

// ── Floating Bubble ──────────────────────────────────────────────────────────

function FloatingBubble({ open, onClick }: { open: boolean; onClick: () => void }) {
  return createPortal(
    <button
      onClick={onClick}
      aria-label={open ? 'CORRA schließen' : 'CORRA öffnen'}
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
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 750, background: 'oklch(0% 0 0 / 0.18)' }}
      />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0,  scale: 1    }}
        exit   ={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ duration: 0.22, ease: [0.2, 0.7, 0.1, 1] }}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', bottom: 92, right: 24, zIndex: 760,
          width: 'min(540px, calc(100vw - 48px))',
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
  const allTodos     = useTodosStore(s => s.allTodos)
  const accounts     = useAccountsStore(s => s.accounts)
  const invoices     = useFinanceStore(s => s.invoices)
  const upsertEvent  = useCalendarStore(s => s.upsert)

  const selectedCustomerId  = useUiStore(s => s.selectedCustomerId)
  const appView             = useUiStore(s => s.appView)
  const setAppView          = useUiStore(s => s.setAppView)
  const setSelectedCustomer = useUiStore(s => s.setSelectedCustomer)

  const pinnedCustomer = useMemo(() => {
    if (appView !== 'clients' || !selectedCustomerId) return undefined
    return accounts.find(a => a.id === selectedCustomerId)
  }, [appView, selectedCustomerId, accounts])

  const [text, setText]               = useState('')
  const [mentions, setMentions]       = useState<Array<{ marker: string; customerId: string }>>([])
  const [pendingEvent, setPendingEvent]   = useState<PendingEventDraft | null>(null)
  const [pendingDraft, setPendingDraft]   = useState<TaskDraft | null>(null)
  const [savedHint, setSavedHint]         = useState<string | null>(null)
  const [corraReply, setCorraReply]       = useState<string | null>(null)
  const [corraLoading, setCorraLoading]   = useState(false)

  const submitRef = useRef<() => void>(() => {})
  const mention   = useMentionPopoverState()
  const mentionStateRef = useRef(mention)
  mentionStateRef.current = mention

  // Is this a task (starts with !) or a CORRA question?
  const isTaskMode = text.trimStart().startsWith('!')

  const candidates: MentionCandidate[] = useMemo(
    () => accounts.filter(a => !a.isPrivate).map(a => ({ id: a.id, name: a.name, company: a.industry })),
    [accounts],
  )

  const placeholderText = pinnedCustomer
    ? `! Aufgabe für ${pinnedCustomer.name}… oder frag CORRA`
    : '! für Aufgabe · Sonst CORRA fragen…'

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, bulletList: false, orderedList: false,
        listItem: false, blockquote: false, codeBlock: false, horizontalRule: false,
      }),
      Placeholder.configure({ placeholder: placeholderText }),
    ],
    content: '',
    onUpdate: ({ editor }) => {
      const txt = editor.getText()
      setText(txt)
      if (corraReply) setCorraReply(null) // clear reply when typing again
      const pos = editor.state.selection.from
      const before = txt.slice(0, Math.max(0, pos - 1))
      const q = extractMentionQuery(before)
      if (q) {
        const coords = editor.view.coordsAtPos(pos)
        mentionStateRef.current.setCtx({ open: true, query: q.query, startOffset: q.startOffset, anchor: { top: coords.bottom + 6, left: coords.left } })
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
        if (event.key === 'Enter') { event.preventDefault(); submitRef.current(); return true }
        return false
      },
    },
  })

  const draft = useMemo(() => {
    const parsed = parseTaskText(text, { mentions })
    parsed.actionType = detectActionType(parsed.title) ?? undefined
    return parsed
  }, [text, mentions])

  const effectiveCustomerId = useMemo(
    () => pinnedCustomer?.id ?? draft.customerId,
    [pinnedCustomer, draft.customerId],
  )

  const canSubmit = isTaskMode
    ? !!(draft.title.trim() || draft.tags.length || effectiveCustomerId)
    : text.trim().length > 0

  // ── CORRA ask ────────────────────────────────────────────────────────────
  const askCorra = async (question: string) => {
    const apiKey = getApiKey()
    if (!apiKey) { setCorraReply('Kein API-Key hinterlegt — bitte in den Einstellungen eintragen.'); return }

    const today = new Date().toISOString().slice(0, 10)
    const todayCount  = allTodos.filter(t => t.status !== 'done' && (t.bucket === 'today' || t.scheduledAt?.slice(0, 10) === today)).length
    const overdueCount = invoices.filter(i => i.status === 'overdue').length
    const ctx = [
      `Aktuelle View: ${appView}`,
      pinnedCustomer ? `Aktiver Kunde: ${pinnedCustomer.name}` : '',
      `Offene Aufgaben heute: ${todayCount}`,
      overdueCount > 0 ? `Überfällige Rechnungen: ${overdueCount}` : '',
    ].filter(Boolean).join('\n')

    setCorraLoading(true)
    try {
      const response = await invoke<AnthropicResponse>('cmd_anthropic_messages', {
        apiKey,
        body: {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          system: [{ type: 'text', text: `Du bist CORRA, KI-Assistent in Cynera CRM. Antworte kurz, direkt, auf Deutsch. Kein Bullshit.\n\n${ctx}`, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: question }],
        },
      })
      const block = response.content.find((b): b is AnthropicTextBlock => b.type === 'text')
      setCorraReply(block?.text.trim() ?? '(keine Antwort)')
    } catch (e) {
      setCorraReply(e instanceof MissingApiKeyError ? e.message : 'Verbindungsfehler.')
    } finally {
      setCorraLoading(false)
    }
  }

  // ── Task persist ─────────────────────────────────────────────────────────
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
            accountId: eventOverride.customerId,
            title: eventOverride.title, description: eventOverride.description,
            location: eventOverride.location,
            startAt: isoLocal(eventOverride.scheduledAt),
            endAt:   isoLocal(addMinutes(eventOverride.scheduledAt, eventOverride.plannedMinutes)),
            allDay: false, color: 'accent',
          })
          calendarEventId = ev.id
          createdEventTitle = ev.title
        } catch (e) { console.error('Calendar event creation failed', e) }
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
      actionType:     sourceDraft.actionType,
      bucket: sourceDraft.scheduledAt
        ? (sourceDraft.scheduledAt.slice(0, 10) === todayStr ? 'today' : 'backlog')
        : 'today',
    })

    editor.commands.clearContent()
    setText(''); setMentions([]); setPendingEvent(null); setPendingDraft(null); setCorraReply(null)
    setSavedHint(createdEventTitle ? `Termin „${createdEventTitle}" angelegt` : `Aufgabe „${title}" angelegt`)
    setTimeout(() => setSavedHint(null), 2200)
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  const submit = async () => {
    if (!editor || !canSubmit) return

    if (!isTaskMode) {
      // CORRA mode
      await askCorra(text.trim())
      return
    }

    // Task mode
    const title = draft.title.trim() || '(ohne Titel)'
    const wantsCalendar = draft.hasExplicitTime && !!draft.scheduledAt
    if (wantsCalendar) {
      setPendingDraft(draft)
      setPendingEvent({ title, scheduledAt: draft.scheduledAt!, plannedMinutes: draft.plannedMinutes ?? 30, customerId: effectiveCustomerId })
      return
    }
    await persist(draft, null)
  }

  useEffect(() => { submitRef.current = submit })

  const goToCustomer = () => {
    if (!effectiveCustomerId) return
    setSelectedCustomer(effectiveCustomerId)
    setAppView('clients')
    onClose()
  }

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
    editor.commands.setContent(`${before}${marker} ${after}`)
    editor.commands.setTextSelection((before + marker + ' ').length + 1)
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
      const filtered = q ? candidates.filter(c => c.name.toLowerCase().includes(q) || (c.company ?? '').toLowerCase().includes(q)) : candidates
      const cand = filtered[m.activeIdx]
      if (cand) pickMention(cand)
    }
    ;(window as unknown as { __cyneraPickMentionGlobal?: () => void }).__cyneraPickMentionGlobal = picker
    return () => { delete (window as unknown as { __cyneraPickMentionGlobal?: () => void }).__cyneraPickMentionGlobal }
  })

  const wantsCalendar = isTaskMode && draft.hasExplicitTime && !!draft.scheduledAt

  const insertSnippet = (snippet: string) => {
    if (!editor) return
    editor.commands.setContent(snippet)
    editor.commands.focus('end')
    const txt = editor.getText()
    setText(txt)
  }

  return (
    <>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 18px 10px', borderBottom: '1px solid var(--border)',
      }}>
        {isTaskMode
          ? <CheckSquare size={14} style={{ color: 'var(--accent)' }} />
          : <Sparkles size={14} style={{ color: 'var(--accent)' }} />
        }
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--fg-dim)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {isTaskMode ? 'Aufgabe erstellen' : 'CORRA'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 1 }}>
            {isTaskMode
              ? pinnedCustomer ? `Bei ${pinnedCustomer.name}` : 'Workspace'
              : 'Frag mich alles · ich kenn deinen Stand'
            }
          </div>
        </div>
        <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, background: 'oklch(50% 0 0 / 0.06)', color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <X size={13} />
        </button>
      </div>

      {/* CORRA reply bubble */}
      <AnimatePresence>
        {(corraReply || corraLoading) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            style={{
              margin: '12px 18px 0',
              padding: '12px 16px',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              fontSize: 13, lineHeight: 1.6, color: 'var(--fg)',
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}
          >
            <div style={{
              width: 22, height: 22, borderRadius: 99, flexShrink: 0, marginTop: 1,
              background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 6px var(--accent)',
            }}>
              {corraLoading
                ? <Loader size={10} style={{ color: 'var(--accent-ink)', animation: 'spin 1s linear infinite' }} />
                : <Sparkles size={10} style={{ color: 'var(--accent-ink)' }} />
              }
            </div>
            <span>{corraLoading ? 'CORRA denkt…' : corraReply}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Composer body */}
      <div style={{ padding: '12px 18px' }}>
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 10,
          padding: '12px 14px',
          background: 'var(--surface-2)', borderRadius: 12,
          border: '1px solid var(--border)',
          transition: 'border-color 200ms, box-shadow 200ms',
        }}
        onFocusCapture={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 4px var(--accent-soft)' }}
        onBlurCapture={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isTaskMode
              ? (wantsCalendar
                  ? <Calendar size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  : <CheckSquare size={16} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />)
              : <Sparkles size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <EditorContent editor={editor} />
            </div>
            <button
              onClick={submit}
              disabled={!canSubmit || corraLoading}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '7px 13px', borderRadius: 99,
                background: canSubmit && !corraLoading ? 'var(--accent)' : 'oklch(50% 0 0 / 0.08)',
                color: canSubmit && !corraLoading ? 'var(--accent-ink)' : 'var(--fg-dim)',
                fontSize: 12, fontWeight: 700,
                cursor: canSubmit && !corraLoading ? 'pointer' : 'not-allowed',
                flexShrink: 0, transition: 'background 160ms, color 160ms',
              }}
            >
              Enter
              <Send size={11} />
            </button>
          </div>

          {/* Live chips — only in task mode */}
          {isTaskMode && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11.5 }}>
              {draft.scheduledAt && (
                <Chip color="accent">
                  📅 {new Date(draft.scheduledAt).toLocaleDateString('de', { day: '2-digit', month: 'short' })}
                  {draft.hasExplicitTime && <> · {new Date(draft.scheduledAt).toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' })}</>}
                </Chip>
              )}
              {draft.priority && <Chip color="warn">● {PRIO_LABEL[draft.priority]}</Chip>}
              {draft.plannedMinutes && <Chip color="muted">⏱ {draft.plannedMinutes}m</Chip>}
              {wantsCalendar && <Chip color="accent"><Calendar size={10} style={{ marginRight: 4, display: 'inline', verticalAlign: '-1px' }} />Kalender</Chip>}
              {draft.actionType && ACTION_TYPE_LABELS[draft.actionType] && (
                <Chip color="accent">{ACTION_TYPE_LABELS[draft.actionType]}</Chip>
              )}
              {draft.tags.map(t => <Chip key={t} color="muted">#{t}</Chip>)}
              {effectiveCustomerId && !pinnedCustomer && (() => {
                const acc = accounts.find(a => a.id === effectiveCustomerId)
                return acc ? <Chip color="accent" onClick={goToCustomer} clickable>@ {acc.name}</Chip> : null
              })()}
            </div>
          )}
        </div>

        {/* Status / hint row */}
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--fg-dim)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span>
            {savedHint
              ? <span style={{ color: 'var(--accent)', fontWeight: 600 }}>✓ {savedHint}</span>
              : isTaskMode
              ? <>→ Erstellt: <strong style={{ color: 'var(--fg-muted)' }}>{wantsCalendar ? 'Termin' : 'Aufgabe'}</strong></>
              : <>→ CORRA antwortet</>
            }
          </span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            <Kbd>Esc</Kbd> schließen · <Kbd>⌘K</Kbd> toggle
          </span>
        </div>
      </div>

      {/* Syntax guide */}
      <div style={{
        padding: '10px 18px 14px',
        borderTop: '1px solid var(--border)',
        display: 'flex', flexWrap: 'wrap', gap: 6,
      }}>
        <span style={{ fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', alignSelf: 'center', marginRight: 4 }}>
          Syntax
        </span>
        {[
          ['! Aufgabe', '! Normale Aufgabe'],
          ['!! Dringend', '!! Dringende Aufgabe'],
          ['! morgen 10:00', '! Aufgabe mit Termin'],
          ['! @Kunde', '! Aufgabe bei Kunden'],
        ].map(([label, snippet]) => (
          <button
            key={label}
            onClick={() => insertSnippet(snippet)}
            style={{
              fontSize: 10.5, padding: '3px 9px', borderRadius: 99,
              background: 'oklch(50% 0 0 / 0.07)', border: '1px solid var(--border)',
              color: 'var(--fg-muted)', cursor: 'pointer', fontFamily: 'var(--font-mono)',
              transition: 'background 120ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'oklch(50% 0 0 / 0.13)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'oklch(50% 0 0 / 0.07)' }}
          >
            {label}
          </button>
        ))}
      </div>

      <MentionPopover
        open={mention.ctx.open} query={mention.ctx.query} candidates={candidates}
        anchor={mention.ctx.anchor} activeIdx={mention.activeIdx}
        setActiveIdx={mention.setActiveIdx} onSelect={pickMention} onClose={mention.close}
      />

      <CalendarEventConfirmCard
        open={!!pendingEvent} draft={pendingEvent}
        onConfirm={(f) => pendingDraft && persist(pendingDraft, f)}
        onTaskOnly={() => pendingDraft && persist(pendingDraft, null)}
        onCancel={() => { setPendingEvent(null); setPendingDraft(null) }}
      />

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </>
  )
}

// ── Chip + Kbd ───────────────────────────────────────────────────────────────

interface ChipProps { children: React.ReactNode; color: 'accent' | 'warn' | 'muted'; clickable?: boolean; onClick?: () => void }
function Chip({ children, color, clickable, onClick }: ChipProps) {
  const bg = color === 'accent' ? 'var(--accent-soft)' : color === 'warn' ? 'oklch(85% 0.13 60 / 0.18)' : 'oklch(50% 0 0 / 0.08)'
  const fg = color === 'accent' ? 'var(--accent-ink)' : color === 'warn' ? 'oklch(50% 0.15 60)' : 'var(--fg-muted)'
  return (
    <span onClick={onClick} style={{ padding: '3px 9px', borderRadius: 99, background: bg, color: fg, fontWeight: 600, fontSize: 11, letterSpacing: '0.01em', cursor: clickable ? 'pointer' : 'default', userSelect: 'none' }} title={clickable ? 'Zum Kunden springen' : undefined}>
      {children}
    </span>
  )
}
function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, padding: '1px 5px', borderRadius: 4, background: 'oklch(50% 0 0 / 0.1)', color: 'var(--fg-muted)', fontWeight: 700 }}>{children}</kbd>
}
