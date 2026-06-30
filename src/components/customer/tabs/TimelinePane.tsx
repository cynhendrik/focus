import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Trash2, Plus, Check, UserPlus } from 'lucide-react'
import type { Note } from '@/types/note.types'
import type { Todo } from '@/types/todo.types'

import { useTodosStore } from '@/store/todos.store'
import { useNotesStore } from '@/store/notes.store'
import { useContactsStore } from '@/store/contacts.store'

import type { Contact } from '@/types/contact.types'
import { ContactCard } from '@/components/customer/ContactCard'
import { ContactModal } from '@/components/customer/ContactModal'
import { InfosFeed, readInfos, matchContact } from '@/components/customer/InfosFeed'
import { InsightsStrip } from '@/components/customer/InsightsStrip'
import { CustomerKpiStrip } from '@/components/customer/CustomerKpiStrip'
import { NewTaskModal } from '@/components/customer/NewTaskModal'
import { ActivityStream } from '@/components/activity/ActivityStream'

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface Props { customerId: string }

export function TimelinePane({ customerId }: Props) {
  const notes = useNotesStore(s => s.notes)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      padding: '14px 24px 64px',
      overflowY: 'auto', flex: 1,
    }}>
      {/* ── KPI-Zeile — Kontext, nicht Inhalt: eine Zeile, vier Zahlen ──── */}
      <CustomerKpiStrip customerId={customerId} />

      <div style={{
        display: 'grid',
        gridTemplateColumns: '380px 1fr',
        gap: 36,
        marginTop: 18,
        alignItems: 'start',
      }}>
        {/* ── LEFT RAIL — knowledge column, sticky during scroll ──────────── */}
        <aside style={{
          position: 'sticky',
          top: 0,
          maxHeight: 'calc(100vh - 240px)',
          overflowY: 'auto',
          paddingRight: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}>
          {/* Aufgaben zuerst — actionable. Infos & Kontakte sind Nachschlagewerk. */}
          <TasksList customerId={customerId} />
          <InfosFeed customerId={customerId} notes={notes} />
          <ContactsList customerId={customerId} notes={notes} />
        </aside>

        {/* ── RIGHT COLUMN — insights + unified activity stream ──────────── */}
        <div style={{ minWidth: 0 }}>
          <InsightsStrip customerId={customerId} />
          <ActivityStream
            accountId={customerId}
            sources={{ todos: true, notes: true, noteDocs: true, files: true, crmFollowUps: true, deadlines: true, mails: true }}
          />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Contacts list — sits in the left rail, sourced from useContactsStore.
// Each contact = inline ContactCard with editable notes. Edit button opens modal.
// ─────────────────────────────────────────────────────────────────────────────

interface ContactsListProps {
  customerId: string
  notes: Note[]
}

function ContactsList({ customerId, notes }: ContactsListProps) {
  const contacts = useContactsStore(s => s.contacts)
  const loadByAccount = useContactsStore(s => s.loadByAccount)

  useEffect(() => { loadByAccount(customerId) }, [customerId, loadByAccount])

  const scoped = useMemo(
    () => contacts
      .filter(c => c.accountId === customerId)
      .sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
        const an = (a.lastName ? `${a.firstName} ${a.lastName}` : a.firstName)
        const bn = (b.lastName ? `${b.firstName} ${b.lastName}` : b.firstName)
        return an.localeCompare(bn)
      }),
    [contacts, customerId],
  )

  // Backlinks: count @mentions per contact across all pinned notes.
  const mentionsByContact = useMemo(() => {
    const counts = new Map<string, number>()
    for (const n of notes) {
      if (!n.pinned || n.customerId !== customerId) continue
      const text = readInfos(n.content, n.title)
      for (const m of text.matchAll(/@([\wäöüÄÖÜß-]+)/g)) {
        const c = matchContact(m[1], scoped)
        if (c) counts.set(c.id, (counts.get(c.id) ?? 0) + 1)
      }
    }
    return counts
  }, [notes, customerId, scoped])

  const [modalContact, setModalContact] = useState<Contact | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const openCreate = () => { setModalContact(null);   setModalOpen(true) }
  const openEdit   = (c: Contact) => { setModalContact(c); setModalOpen(true) }

  return (
    <>
      <div>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 10, paddingLeft: 2,
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            color: 'var(--fg-dim)', fontWeight: 500,
          }}>
            Kontakte
          </span>
          {scoped.length > 0 && (
            <span style={{
              fontSize: 10, color: 'var(--fg-dim)',
              fontFamily: 'var(--font-mono)', opacity: 0.7,
            }}>
              · {scoped.length}
            </span>
          )}
          <div style={{
            flex: 1, height: 1,
            background: 'linear-gradient(90deg, var(--border) 0%, transparent 100%)',
          }} />
          <button
            onClick={openCreate}
            aria-label="Kontakt hinzufügen"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 8px 3px 6px', borderRadius: 999,
              background: 'oklch(100% 0 0 / 0.04)',
              border: '1px solid var(--border)',
              color: 'var(--fg-muted)',
              fontSize: 11, cursor: 'pointer',
              transition: 'background 180ms ease, color 180ms ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'oklch(100% 0 0 / 0.08)'
              e.currentTarget.style.color = 'var(--fg)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'oklch(100% 0 0 / 0.04)'
              e.currentTarget.style.color = 'var(--fg-muted)'
            }}
          >
            <UserPlus size={11} strokeWidth={2.4} />
            Kontakt
          </button>
        </div>

        {/* Cards */}
        {scoped.length === 0 ? (
          <button
            onClick={openCreate}
            style={{
              display: 'block', width: '100%',
              padding: '14px 12px',
              borderRadius: 12,
              background: 'transparent',
              border: '1px dashed var(--border)',
              color: 'var(--fg-dim)',
              fontSize: 12, fontStyle: 'italic',
              textAlign: 'left', lineHeight: 1.5,
              cursor: 'pointer',
              transition: 'border-color 180ms ease, color 180ms ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--accent)'
              e.currentTarget.style.color = 'var(--accent)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.color = 'var(--fg-dim)'
            }}
          >
            Noch keine Personen erfasst — wer ist dein Champion, wer entscheidet?
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <AnimatePresence initial={false}>
              {scoped.map(c => (
                <ContactCard
                  key={c.id}
                  contact={c}
                  onEdit={() => openEdit(c)}
                  mentionCount={mentionsByContact.get(c.id) ?? 0}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {modalOpen && (
        <ContactModal
          accountId={customerId}
          contact={modalContact}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TasksList — compact todo list for the Activities left rail.
//
// Same data source as Arbeiten > Tasks (useTodosStore). Click checkbox to
// toggle done. Inline composer for quick-add during a call. Done section
// collapses by default to keep the rail tight.
// ─────────────────────────────────────────────────────────────────────────────

interface TasksListProps { customerId: string }

function TasksList({ customerId }: TasksListProps) {
  const todos          = useTodosStore(s => s.todos)
  const upsertTodo     = useTodosStore(s => s.upsert)
  const removeTodo     = useTodosStore(s => s.remove)

  const scoped = useMemo(
    () => todos.filter(t => t.customerId === customerId),
    [todos, customerId],
  )

  const PRIO_ORDER: Record<string, number> = { high: 0, normal: 1, low: 2 }
  const openTodos = useMemo(
    () => scoped
      .filter(t => t.status !== 'done')
      .sort((a, b) => {
        // Priority first (high → normal → low)
        const pa = PRIO_ORDER[a.priority] ?? 1
        const pb = PRIO_ORDER[b.priority] ?? 1
        if (pa !== pb) return pa - pb
        // Then by due date ascending (undated last)
        const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
        const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
        return ad - bd
      }),
    [scoped],
  )
  const doneTodos = useMemo(() => scoped.filter(t => t.status === 'done'), [scoped])

  const [modalOpen, setModalOpen] = useState(false)
  const [showDone, setShowDone]   = useState(false)

  const toggleDone = async (t: Todo) => {
    await upsertTodo({
      id: t.id,
      customerId: t.customerId,
      title: t.title,
      status: t.status === 'done' ? 'open' : 'done',
      priority: t.priority,
      dueDate: t.dueDate,
      checklist: t.checklist,
      tags: t.tags,
      assignee: t.assignee,
    })
  }

  const cyclePriority = async (t: Todo) => {
    // p3 → p1 → p4 → p3
    const next: 'p1' | 'p3' | 'p4' =
      t.priority === 'p3' ? 'p1'
      : t.priority === 'p1' ? 'p4'
      : 'p3'
    await upsertTodo({
      id: t.id,
      customerId: t.customerId,
      title: t.title,
      status: t.status,
      priority: next,
      dueDate: t.dueDate,
      checklist: t.checklist,
      tags: t.tags,
      assignee: t.assignee,
    })
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 8, paddingLeft: 2,
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--fg-dim)', fontWeight: 500,
        }}>
          Aufgaben
        </span>
        {openTodos.length > 0 && (
          <span style={{
            fontSize: 10, color: 'var(--fg-dim)',
            fontFamily: 'var(--font-mono)', opacity: 0.7,
          }}>
            · {openTodos.length}
          </span>
        )}
        <div style={{
          flex: 1, height: 1,
          background: 'linear-gradient(90deg, var(--border) 0%, transparent 100%)',
        }} />
        <button
          onClick={() => setModalOpen(true)}
          aria-label="Aufgabe hinzufügen"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 8px 3px 6px', borderRadius: 999,
            background: 'oklch(100% 0 0 / 0.04)',
            border: '1px solid var(--border)',
            color: 'var(--fg-muted)',
            fontSize: 11, cursor: 'pointer',
            transition: 'background 180ms ease, color 180ms ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'oklch(100% 0 0 / 0.08)'
            e.currentTarget.style.color = 'var(--fg)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'oklch(100% 0 0 / 0.04)'
            e.currentTarget.style.color = 'var(--fg-muted)'
          }}
        >
          <Plus size={11} strokeWidth={2.4} />
          Aufgabe
        </button>
      </div>

      {/* Empty state */}
      {openTodos.length === 0 && (
        <button
          onClick={() => setModalOpen(true)}
          style={{
            display: 'block', width: '100%',
            padding: '12px 12px',
            borderRadius: 10,
            background: 'transparent',
            border: '1px dashed var(--border)',
            color: 'var(--fg-dim)',
            fontSize: 12, fontStyle: 'italic',
            textAlign: 'left',
            cursor: 'pointer',
            transition: 'border-color 180ms ease, color 180ms ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--accent)'
            e.currentTarget.style.color = 'var(--accent)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--fg-dim)'
          }}
        >
          + Was ist als Nächstes zu tun?
        </button>
      )}

      {/* Open tasks */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <AnimatePresence initial={false}>
          {openTodos.map(t => (
            <TaskRow
              key={t.id}
              todo={t}
              onToggle={() => toggleDone(t)}
              onDelete={() => removeTodo(t.id)}
              onCyclePriority={() => cyclePriority(t)}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Done — collapsed by default */}
      {doneTodos.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button
            onClick={() => setShowDone(v => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 6px',
              fontSize: 10.5,
              fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
              color: 'var(--fg-dim)', background: 'transparent',
              cursor: 'pointer',
            }}
          >
            <ChevronDown
              size={10}
              style={{
                transform: showDone ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 180ms ease',
              }}
            />
            Erledigt · {doneTodos.length}
          </button>

          <AnimatePresence initial={false}>
            {showDone && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit   ={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.16 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4, opacity: 0.6 }}>
                  {doneTodos.map(t => (
                    <TaskRow
                      key={t.id}
                      todo={t}
                      onToggle={() => toggleDone(t)}
                      onDelete={() => removeTodo(t.id)}
                      onCyclePriority={() => cyclePriority(t)}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <NewTaskModal
        open={modalOpen}
        customerId={customerId}
        context="Activities"
        onClose={() => setModalOpen(false)}
      />
    </div>
  )
}

// ─── TaskRow ────────────────────────────────────────────────────────────────

function formatTaskDue(iso: string): { label: string; tone: 'overdue' | 'today' | 'soon' | 'later' } {
  const d = new Date(iso)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86_400_000)
  if (diffDays < 0)   return { label: `vor ${-diffDays}T`, tone: 'overdue' }
  if (diffDays === 0) return { label: 'heute',  tone: 'today' }
  if (diffDays === 1) return { label: 'morgen', tone: 'today' }
  if (diffDays < 7)   return { label: `${diffDays}T`, tone: 'soon' }
  return { label: new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }), tone: 'later' }
}

const DUE_TONE: Record<'overdue' | 'today' | 'soon' | 'later', string> = {
  overdue: 'var(--danger)',
  today:   'var(--accent)',
  soon:    'var(--warn)',
  later:   'var(--fg-dim)',
}

const PRIORITY_META: Record<'high' | 'normal' | 'low', {
  label: string; color: string; fill: boolean; ring: boolean
}> = {
  high:   { label: 'Hoch',    color: 'var(--danger)',  fill: true,  ring: true  },
  normal: { label: 'Normal',  color: 'var(--fg-muted)', fill: true,  ring: false },
  low:    { label: 'Niedrig', color: 'var(--fg-dim)',   fill: false, ring: false },
}

/**
 * Mappt das Backend-Schema (p1/p2/p3/p4 oder direkt high/normal/low) auf das
 * 3-stufige UI-Modell. `??` haette hier nicht geholfen — 'p3' ist truthy,
 * der Fallback waere nie gegriffen, der Lookup waere undefined, Render-Crash.
 */
function mapTodoPriority(p: string | undefined | null): 'high' | 'normal' | 'low' {
  if (p === 'high' || p === 'p1' || p === 'p2') return 'high'
  if (p === 'low'  || p === 'p4')               return 'low'
  return 'normal'
}

function TaskRow({
  todo, onToggle, onDelete, onCyclePriority,
}: {
  todo: Todo
  onToggle: () => void
  onDelete: () => void
  onCyclePriority: () => void
}) {
  const [hover, setHover] = useState(false)
  const isDone = todo.status === 'done'
  const due = todo.dueDate ? formatTaskDue(todo.dueDate) : null
  const prio = PRIORITY_META[mapTodoPriority(todo.priority)]
  const isHigh = todo.priority === 'p1' || todo.priority === 'p2'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      exit   ={{ opacity: 0, x: 6 }}
      transition={{ duration: 0.16 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '10px 14px 1fr auto auto',
        alignItems: 'center',
        gap: 8,
        padding: '5px 8px 5px 4px',
        borderRadius: 7,
        background: hover
          ? 'oklch(100% 0 0 / 0.035)'
          : (isHigh && !isDone ? `${prio.color}0d` : 'transparent'),
        borderLeft: isHigh && !isDone ? `2px solid ${prio.color}` : '2px solid transparent',
        transition: 'background 150ms ease',
      }}
    >
      {/* Priority dot — click to cycle */}
      <button
        onClick={e => { e.stopPropagation(); onCyclePriority() }}
        title={`Priorität: ${prio.label} (Klick zum Wechseln)`}
        style={{
          width: 8, height: 8, borderRadius: '50%',
          background: prio.fill ? prio.color : 'transparent',
          border: prio.fill ? 'none' : `1.5px solid ${prio.color}`,
          boxShadow: prio.ring ? `0 0 0 3px ${prio.color}24` : 'none',
          cursor: 'pointer',
          padding: 0,
          flexShrink: 0,
          transition: 'transform 180ms ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.4)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
      />

      {/* Checkbox */}
      <button
        onClick={e => { e.stopPropagation(); onToggle() }}
        aria-label={isDone ? 'Als offen markieren' : 'Als erledigt markieren'}
        style={{
          width: 14, height: 14, borderRadius: 4,
          background: isDone ? 'var(--accent)' : 'transparent',
          border: isDone ? '1px solid var(--accent)' : '1.5px solid var(--border-strong)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          transition: 'background 180ms ease, border-color 180ms ease',
        }}
        onMouseEnter={e => {
          if (!isDone) e.currentTarget.style.borderColor = 'var(--accent)'
        }}
        onMouseLeave={e => {
          if (!isDone) e.currentTarget.style.borderColor = 'var(--border-strong)'
        }}
      >
        {isDone && <Check size={9} strokeWidth={3} style={{ color: 'var(--accent-ink)' }} />}
      </button>

      <span style={{
        fontSize: 12.5,
        color: isDone ? 'var(--fg-dim)' : 'var(--fg)',
        textDecoration: isDone ? 'line-through' : 'none',
        letterSpacing: '-0.005em',
        fontWeight: isHigh && !isDone ? 600 : 500,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {todo.title}
      </span>

      {due && !isDone ? (
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          letterSpacing: '0.04em',
          color: DUE_TONE[due.tone] ?? DUE_TONE.later,
          opacity: due.tone === 'later' ? 0.7 : 1,
          whiteSpace: 'nowrap',
        }}>
          {due.label}
        </span>
      ) : <span />}

      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        aria-label="Task entfernen"
        style={{
          width: 18, height: 18, borderRadius: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', color: 'var(--fg-dim)',
          opacity: hover ? 1 : 0,
          transition: 'opacity 180ms ease, color 180ms ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-dim)' }}
      >
        <Trash2 size={10} />
      </button>
    </motion.div>
  )
}
