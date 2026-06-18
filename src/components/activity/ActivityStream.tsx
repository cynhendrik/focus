import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Phone, Users, Mail, FileText, Bell, AlarmClock,
  Paperclip, CheckCircle2, Trash2, ChevronDown, Calendar as CalIcon,
  Search, X, Inbox, CheckSquare,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useActivitiesStore } from '@/store/activities.store'
import { useTodosStore } from '@/store/todos.store'
import { useNotesStore } from '@/store/notes.store'
import { useFilesStore } from '@/store/files.store'
import { useCrmStore } from '@/store/crm.store'
import { useDeadlinesStore } from '@/store/deadlines.store'
import { useMailStore } from '@/store/mail.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'

import { MailService } from '@/services/mail.service'
import type { EmailBody } from '@/types/mail.types'
import { FollowUpQueueService } from '@/services/follow-up-queue.service'
import type { FollowUpQueueItem } from '@/types/follow-up-queue.types'

// ─────────────────────────────────────────────────────────────────────────────
// Event model — every source collapses into one shape.
// ─────────────────────────────────────────────────────────────────────────────

export type EventKind =
  | 'call' | 'meeting' | 'email' | 'note' | 'note_text'
  | 'followup' | 'todo' | 'file' | 'deadline' | 'mail_in'

export interface TimelineEvent {
  id: string
  kind: EventKind
  timestamp: string
  title: string
  body?: string
  isFuture: boolean
  isDone?: boolean
  onRemove?: () => void
  emailId?: string
}

interface KindMeta { Icon: LucideIcon; label: string; color: string; tint: string }

const KIND_META: Record<EventKind, KindMeta> = {
  call:      { Icon: Phone,        label: 'Anruf',      color: 'oklch(78% 0.16 65)',  tint: 'oklch(78% 0.16 65 / 0.14)' },
  meeting:   { Icon: Users,        label: 'Meeting',    color: 'oklch(78% 0.15 290)', tint: 'oklch(78% 0.15 290 / 0.14)' },
  email:     { Icon: Mail,         label: 'E-Mail',     color: 'oklch(78% 0.13 210)', tint: 'oklch(78% 0.13 210 / 0.14)' },
  mail_in:   { Icon: Mail,         label: 'Mail',       color: 'oklch(78% 0.13 210)', tint: 'oklch(78% 0.13 210 / 0.14)' },
  note:      { Icon: FileText,     label: 'Notiz',      color: 'oklch(76% 0.04 270)', tint: 'oklch(76% 0.04 270 / 0.14)' },
  note_text: { Icon: FileText,     label: 'Notiz',      color: 'oklch(76% 0.04 270)', tint: 'oklch(76% 0.04 270 / 0.14)' },
  followup:  { Icon: Bell,         label: 'Follow-up',  color: 'oklch(86% 0.18 95)',  tint: 'oklch(86% 0.18 95 / 0.16)'  },
  todo:      { Icon: CheckCircle2, label: 'Aufgabe',    color: 'oklch(80% 0.18 150)', tint: 'oklch(80% 0.18 150 / 0.16)' },
  file:      { Icon: Paperclip,    label: 'Datei',      color: 'oklch(72% 0.04 240)', tint: 'oklch(72% 0.04 240 / 0.14)' },
  deadline:  { Icon: AlarmClock,   label: 'Deadline',   color: 'oklch(72% 0.18 25)',  tint: 'oklch(72% 0.18 25 / 0.16)'  },
}

// Fallback fuer Eintraege, deren `kind` nicht (mehr) im Mapping ist.
const FALLBACK_KIND_META: KindMeta = {
  Icon:  FileText,
  label: 'Eintrag',
  color: 'oklch(70% 0.02 270)',
  tint:  'oklch(70% 0.02 270 / 0.14)',
}

function metaFor(kind: EventKind): KindMeta {
  const m = KIND_META[kind]
  if (!m) console.warn('[ActivityStream] unknown event kind:', kind)
  return m ?? FALLBACK_KIND_META
}

// ─────────────────────────────────────────────────────────────────────────────
// Date / grouping helpers
// ─────────────────────────────────────────────────────────────────────────────

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

function weekdayLabel(ts: number): string {
  const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
  const d = new Date(ts)
  return `${days[d.getDay()]} · ${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`
}

function longDate(ts: number): string {
  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
}

interface Group { key: string; label: string; isFuture: boolean; events: TimelineEvent[] }

function buildGroups(events: TimelineEvent[]): Group[] {
  const now = Date.now()
  const today = startOfDay(new Date())
  const DAY = 86_400_000
  const map = new Map<string, Group>()

  for (const ev of events) {
    const t = new Date(ev.timestamp).getTime()
    if (Number.isNaN(t)) continue
    const dayStart = startOfDay(new Date(t))
    const diffDays = Math.round((dayStart - today) / DAY)

    let key: string, label: string
    if (diffDays > 7)        { key = `f-${dayStart}`; label = longDate(t) }
    else if (diffDays > 1)   { key = `f-${dayStart}`; label = weekdayLabel(t) }
    else if (diffDays === 1) { key = 'tomorrow';      label = 'Morgen' }
    else if (diffDays === 0) { key = 'today';         label = 'Heute' }
    else if (diffDays === -1){ key = 'yesterday';     label = 'Gestern' }
    else if (diffDays > -7)  { key = `p-${dayStart}`; label = weekdayLabel(t) }
    else                     { key = `p-${dayStart}`; label = longDate(t) }

    const isFuture = t > now
    const existing = map.get(key)
    if (existing) existing.events.push(ev)
    else map.set(key, { key, label, isFuture, events: [ev] })
  }

  for (const g of map.values()) {
    g.events.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }

  return [...map.values()].sort((a, b) => {
    const aMax = Math.max(...a.events.map(e => new Date(e.timestamp).getTime()))
    const bMax = Math.max(...b.events.map(e => new Date(e.timestamp).getTime()))
    return bMax - aMax
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout constants — single source of truth for spine alignment
// ─────────────────────────────────────────────────────────────────────────────

const COL_TIME    = 62
const COL_GUTTER  = 32
const SPINE_LEFT  = COL_TIME + COL_GUTTER / 2

// ─────────────────────────────────────────────────────────────────────────────
// Data sources config
// ─────────────────────────────────────────────────────────────────────────────

export interface ActivityStreamSources {
  todos?: boolean
  notes?: boolean
  files?: boolean
  crmFollowUps?: boolean
  deadlines?: boolean
  mails?: boolean
  followUpQueue?: boolean
}

interface ActivityStreamProps {
  accountId: string
  /** Which extra sources to merge beyond plain activities. Defaults to none. */
  sources?: ActivityStreamSources
  /** Modal/single-column styling (tighter top spacing). */
  compact?: boolean
  /** Load activities for this account on mount (lead modal). The customer page
   *  already loads them via its route, so it leaves this false. */
  loadActivitiesOnMount?: boolean
}

export function ActivityStream({
  accountId,
  sources = {},
  compact = false,
  loadActivitiesOnMount = false,
}: ActivityStreamProps) {
  const activities = useActivitiesStore(s => s.activities)
  const todos      = useTodosStore(s => s.todos)
  const notes      = useNotesStore(s => s.notes)
  const files      = useFilesStore(s => s.files)
  const followUps  = useCrmStore(s => s.followUps)
  const deadlines  = useDeadlinesStore(s => s.deadlines)
  const allEmails  = useMailStore(s => s.emails)
  const loadEmails = useMailStore(s => s.loadEmails)

  const workspaceId     = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const user            = useAuthStore(s => s.user)
  const createActivity  = useActivitiesStore(s => s.create)
  const removeActivity  = useActivitiesStore(s => s.remove)
  const loadForCustomer = useActivitiesStore(s => s.loadForCustomer)

  useEffect(() => {
    if (loadActivitiesOnMount) loadForCustomer(accountId)
  }, [accountId, loadActivitiesOnMount, loadForCustomer])

  useEffect(() => {
    if (sources.mails) loadEmails()
  }, [accountId, sources.mails, loadEmails])

  // Auto follow-up sequence (lead) — fetched locally so we don't disturb the
  // global follow-up-queue store that the Follow-Ups dashboard relies on.
  const [queueItems, setQueueItems] = useState<FollowUpQueueItem[]>([])
  useEffect(() => {
    if (!sources.followUpQueue) { setQueueItems([]); return }
    let alive = true
    FollowUpQueueService.getForLead(accountId)
      .then(items => { if (alive) setQueueItems(items) })
      .catch(() => { /* swallow — stream still shows activities */ })
    return () => { alive = false }
  }, [accountId, sources.followUpQueue])

  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  // ── Merge enabled sources into a single timeline ─────────────────────────
  const events = useMemo<TimelineEvent[]>(() => {
    const out: TimelineEvent[] = []

    for (const a of activities) {
      const isFollowup = a.type === 'followup'
      const ts = isFollowup ? (a.dueAt ?? a.createdAt) : a.createdAt
      if (!ts) continue
      const kindMap: Record<string, EventKind> = {
        call: 'call', meeting: 'meeting', email: 'email', note: 'note', followup: 'followup',
      }
      const kind = kindMap[a.type] ?? 'note'
      const isFuture = isFollowup && a.status !== 'done' && new Date(ts).getTime() > nowMs
      out.push({
        id: `act-${a.id}`,
        kind,
        timestamp: ts,
        title: a.title ?? '(ohne Titel)',
        body: a.body,
        isFuture,
        isDone: a.status === 'done',
        onRemove: () => { void removeActivity(a.id) },
      })
    }

    if (sources.todos) for (const t of todos) {
      if (!t.dueDate && t.status !== 'done') continue
      const ts = t.dueDate ?? t.createdAt
      out.push({
        id: `todo-${t.id}`,
        kind: 'todo',
        timestamp: ts,
        title: t.title,
        isFuture: t.status !== 'done' && new Date(ts).getTime() > nowMs,
        isDone: t.status === 'done',
      })
    }

    if (sources.notes) for (const n of notes) {
      if (n.pinned) continue
      out.push({
        id: `note-${n.id}`,
        kind: 'note_text',
        timestamp: n.createdAt,
        title: n.title,
        body: n.content,
        isFuture: false,
      })
    }

    if (sources.files) for (const f of files) {
      out.push({
        id: `file-${f.id}`,
        kind: 'file',
        timestamp: f.createdAt,
        title: f.name,
        isFuture: false,
      })
    }

    if (sources.crmFollowUps) for (const fu of followUps) {
      out.push({
        id: `crm-${fu.id}`,
        kind: 'followup',
        timestamp: fu.dueDate,
        title: fu.title,
        isFuture: fu.status !== 'erledigt' && new Date(fu.dueDate).getTime() > nowMs,
        isDone: fu.status === 'erledigt',
      })
    }

    if (sources.deadlines) for (const d of deadlines) {
      out.push({
        id: `dl-${d.id}`,
        kind: 'deadline',
        timestamp: d.dueDate,
        title: d.title,
        isFuture: !d.done && new Date(d.dueDate).getTime() > nowMs,
        isDone: d.done,
      })
    }

    if (sources.mails) for (const e of allEmails) {
      if (e.customerId !== accountId) continue
      out.push({
        id: `mail-${e.id}`,
        kind: 'mail_in',
        timestamp: e.sentAt,
        title: e.subject || '(Kein Betreff)',
        body: e.fromName || e.fromAddr,
        isFuture: false,
        emailId: e.id,
      })
    }

    if (sources.followUpQueue) for (const q of queueItems) {
      if (q.status !== 'pending') continue
      out.push({
        id: `fq-${q.id}`,
        kind: 'followup',
        timestamp: q.sendAt,
        title: q.draftSubject || `Automatisches Follow-up ${q.sequenceIndex}/4`,
        body: q.draftBody ?? undefined,
        isFuture: new Date(q.sendAt).getTime() > nowMs,
      })
    }

    return out
  }, [
    activities, todos, notes, files, followUps, deadlines, allEmails, queueItems,
    accountId, nowMs, removeActivity,
    sources.todos, sources.notes, sources.files, sources.crmFollowUps,
    sources.deadlines, sources.mails, sources.followUpQueue,
  ])

  // ── Stream filters — tab + search ───────────────────────────────────────
  type StreamFilter = 'all' | 'calls' | 'notes' | 'mails' | 'tasks'
  const [streamFilter, setStreamFilter] = useState<StreamFilter>('all')
  const [streamQuery,  setStreamQuery]  = useState('')

  const STREAM_FILTER_KINDS: Record<StreamFilter, ReadonlySet<EventKind> | null> = {
    all:    null,
    calls:  new Set<EventKind>(['call', 'meeting']),
    notes:  new Set<EventKind>(['note', 'note_text']),
    mails:  new Set<EventKind>(['email', 'mail_in']),
    tasks:  new Set<EventKind>(['todo', 'followup', 'deadline', 'file']),
  }

  const filteredEvents = useMemo(() => {
    const allowed = STREAM_FILTER_KINDS[streamFilter]
    const q = streamQuery.trim().toLowerCase()
    return events.filter(ev => {
      if (allowed && !allowed.has(ev.kind)) return false
      if (q) {
        const hay = `${ev.title} ${ev.body ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, streamFilter, streamQuery])

  const groups       = useMemo(() => buildGroups(filteredEvents), [filteredEvents])
  const futureGroups = groups.filter(g => g.isFuture)
  const pastGroups   = groups.filter(g => !g.isFuture)
  const isFiltered   = streamFilter !== 'all' || streamQuery.trim() !== ''

  // ── Composer ─────────────────────────────────────────────────────────────
  const [composerKind, setComposerKind]   = useState<ComposerKind>('note')
  const [composerText, setComposerText]   = useState('')
  const [composerDate, setComposerDate]   = useState('')
  const [kindMenuOpen, setKindMenuOpen]   = useState(false)
  const [saving, setSaving]               = useState(false)

  const handleSubmit = useCallback(async () => {
    if (!composerText.trim() || !workspaceId) return
    setSaving(true)
    try {
      const isFollowup = composerKind === 'followup'
      await createActivity({
        workspaceId,
        createdBy: user?.email ?? 'user',
        accountId,
        customerId: accountId,
        type: composerKind,
        title: composerText.trim(),
        status: isFollowup ? 'open' : 'done',
        dueAt: isFollowup && composerDate ? composerDate : undefined,
      })
      setComposerText('')
      setComposerDate('')
    } finally {
      setSaving(false)
    }
  }, [composerKind, composerText, composerDate, workspaceId, user, accountId, createActivity])

  // ── Email expansion ──────────────────────────────────────────────────────
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null)
  const [bodyCache, setBodyCache] = useState<Record<string, EmailBody>>({})
  const toggleEmail = useCallback(async (emailId: string) => {
    if (expandedEmail === emailId) { setExpandedEmail(null); return }
    setExpandedEmail(emailId)
    if (!bodyCache[emailId]) {
      try {
        const body = await MailService.getBody(emailId)
        setBodyCache(c => ({ ...c, [emailId]: body }))
      } catch { /* swallow — show "Laden…" */ }
    }
  }, [expandedEmail, bodyCache])

  return (
    <div style={{ minWidth: 0 }}>
      <Composer
        kind={composerKind}
        onKindChange={setComposerKind}
        text={composerText}
        onTextChange={setComposerText}
        date={composerDate}
        onDateChange={setComposerDate}
        menuOpen={kindMenuOpen}
        onMenuToggle={setKindMenuOpen}
        saving={saving}
        onSubmit={handleSubmit}
      />

      <StreamFilterBar
        filter={streamFilter}
        onFilterChange={setStreamFilter}
        query={streamQuery}
        onQueryChange={setStreamQuery}
        totalCount={events.length}
        visibleCount={filteredEvents.length}
      />

      <div style={{ position: 'relative', marginTop: compact ? 12 : 16 }}>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: SPINE_LEFT,
            top: 0,
            bottom: 0,
            width: 1,
            background:
              'linear-gradient(180deg, transparent 0%, var(--border) 5%, var(--border) 95%, transparent 100%)',
            pointerEvents: 'none',
          }}
        />

        {futureGroups.map((g, gi) => (
          <GroupBlock
            key={g.key}
            group={g}
            baseDelay={gi * 30}
            expandedEmail={expandedEmail}
            bodyCache={bodyCache}
            onEmailToggle={toggleEmail}
          />
        ))}

        <NowLine
          nowMs={nowMs}
          hasFuture={futureGroups.length > 0}
          hasPast={pastGroups.length > 0}
        />

        {pastGroups.map((g, gi) => (
          <GroupBlock
            key={g.key}
            group={g}
            baseDelay={futureGroups.length * 30 + 80 + gi * 30}
            expandedEmail={expandedEmail}
            bodyCache={bodyCache}
            onEmailToggle={toggleEmail}
          />
        ))}

        {filteredEvents.length === 0 && (
          <div style={{ padding: '64px 0 24px', textAlign: 'center' }}>
            {isFiltered ? (
              <>
                <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: 0, letterSpacing: '-0.01em' }}>
                  Keine Treffer für diesen Filter.
                </p>
                <button
                  onClick={() => { setStreamFilter('all'); setStreamQuery('') }}
                  style={{
                    marginTop: 8,
                    fontSize: 12, color: 'var(--accent)',
                    background: 'transparent', cursor: 'pointer',
                  }}
                >
                  Filter zurücksetzen
                </button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: 0, letterSpacing: '-0.01em' }}>
                  Hier ist noch nichts passiert.
                </p>
                <p style={{ fontSize: 12, color: 'var(--fg-dim)', margin: '6px 0 0' }}>
                  Erfasse oben den ersten Eintrag — oder plane ein Follow-up.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Composer
// ─────────────────────────────────────────────────────────────────────────────

type ComposerKind = 'call' | 'meeting' | 'email' | 'note' | 'followup'

const COMPOSER_KINDS: ComposerKind[] = ['note', 'call', 'meeting', 'email', 'followup']

interface ComposerProps {
  kind: ComposerKind
  onKindChange: (k: ComposerKind) => void
  text: string
  onTextChange: (s: string) => void
  date: string
  onDateChange: (s: string) => void
  menuOpen: boolean
  onMenuToggle: (b: boolean) => void
  saving: boolean
  onSubmit: () => void
}

function Composer({
  kind, onKindChange, text, onTextChange, date, onDateChange,
  menuOpen, onMenuToggle, saving, onSubmit,
}: ComposerProps) {
  const meta = metaFor(kind)
  const Icon = meta.Icon
  const isFollowup = kind === 'followup'
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onMenuToggle(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menuOpen, onMenuToggle])

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-strong)',
        borderRadius: 18,
        padding: '16px 18px',
        boxShadow: 'var(--shadow-2)',
        transition: 'border-color 200ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => onMenuToggle(!menuOpen)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 10px 5px 9px', borderRadius: 999,
              background: meta.tint, color: meta.color,
              fontSize: 12, fontWeight: 600, letterSpacing: '-0.005em',
              border: `1px solid ${meta.color}33`,
              cursor: 'pointer',
              transition: 'transform 220ms var(--ease-spring)',
            }}
            onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.96)' }}
            onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
          >
            <Icon size={12} strokeWidth={2.4} />
            {meta.label}
            <ChevronDown
              size={11}
              style={{
                opacity: 0.7,
                transform: menuOpen ? 'rotate(180deg)' : 'rotate(0)',
                transition: 'transform 200ms ease',
              }}
            />
          </button>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0,  scale: 1     }}
                exit   ={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.14, ease: [0.2, 0.7, 0.1, 1] }}
                style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: 4, minWidth: 170, zIndex: 30,
                  boxShadow: 'var(--shadow-2)',
                  display: 'flex', flexDirection: 'column', gap: 1,
                }}
              >
                {COMPOSER_KINDS.map(k => {
                  const m = metaFor(k)
                  const I = m.Icon
                  const active = kind === k
                  return (
                    <button
                      key={k}
                      onClick={() => { onKindChange(k); onMenuToggle(false) }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 9,
                        padding: '7px 10px', borderRadius: 8,
                        fontSize: 12.5, color: 'var(--fg-2)', textAlign: 'left',
                        background: active ? 'oklch(100% 0 0 / 0.05)' : 'transparent',
                        transition: 'background 140ms ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'oklch(100% 0 0 / 0.06)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = active ? 'oklch(100% 0 0 / 0.05)' : 'transparent' }}
                    >
                      <span style={{
                        width: 18, height: 18, borderRadius: 5,
                        background: m.tint, color: m.color,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <I size={10} strokeWidth={2.4} />
                      </span>
                      {m.label}
                    </button>
                  )
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <input
          value={text}
          onChange={e => onTextChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit() }
          }}
          placeholder={isFollowup ? 'Was muss erledigt werden?' : 'Was ist passiert?'}
          style={{
            flex: 1, minWidth: 0,
            background: 'transparent', border: 'none',
            fontSize: 15, color: 'var(--fg)',
            letterSpacing: '-0.01em',
            padding: '4px 0',
          }}
        />

        <button
          onClick={onSubmit}
          disabled={saving || !text.trim()}
          className="btn-primary"
          style={{
            padding: '6px 12px',
            fontSize: 12,
            opacity: text.trim() ? 1 : 0.35,
            pointerEvents: text.trim() && !saving ? 'auto' : 'none',
          }}
        >
          {saving ? '…' : (isFollowup ? 'Planen' : 'Erfassen')}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {isFollowup && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 10 }}
            exit   ={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.16, ease: [0.2, 0.7, 0.1, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CalIcon size={12} style={{ color: 'var(--fg-dim)' }} />
              <input
                type="date"
                value={date}
                onChange={e => onDateChange(e.target.value)}
                style={{
                  fontSize: 11.5, padding: '4px 8px', borderRadius: 7,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  color: 'var(--fg-2)', fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.02em',
                }}
              />
              <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>(optional)</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Group block
// ─────────────────────────────────────────────────────────────────────────────

interface GroupBlockProps {
  group: Group
  baseDelay: number
  expandedEmail: string | null
  bodyCache: Record<string, EmailBody>
  onEmailToggle: (id: string) => void
}

function GroupBlock({ group, baseDelay, expandedEmail, bodyCache, onEmailToggle }: GroupBlockProps) {
  return (
    <div>
      <motion.div
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: baseDelay / 1000, duration: 0.32, ease: [0.2, 0.7, 0.1, 1] }}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          paddingLeft: SPINE_LEFT + 14,
          marginTop: 22, marginBottom: 4,
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--fg-dim)',
          fontWeight: 500,
        }}
      >
        <span>{group.label}</span>
        <div style={{
          flex: 1, height: 1,
          background: 'linear-gradient(90deg, var(--border) 0%, transparent 100%)',
        }} />
      </motion.div>

      {group.events.map((ev, i) => (
        <EventRow
          key={ev.id}
          event={ev}
          delay={(baseDelay + 30 + i * 22) / 1000}
          isExpanded={ev.emailId === expandedEmail}
          onClick={ev.emailId ? () => onEmailToggle(ev.emailId!) : undefined}
          body={ev.emailId ? bodyCache[ev.emailId] : undefined}
        />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Event row
// ─────────────────────────────────────────────────────────────────────────────

interface EventRowProps {
  event: TimelineEvent
  delay: number
  isExpanded?: boolean
  onClick?: () => void
  body?: EmailBody
}

// Nur echte Aufgaben werden bei Erledigung durchgestrichen/ausgegraut.
// Protokoll-Einträge (Notiz/Anruf/Mail/Meeting/Datei) sind Fakten, kein "erledigt".
const STRIKE_KINDS = new Set<EventKind>(['followup', 'todo', 'deadline'])

function EventRow({ event, delay, isExpanded, onClick, body }: EventRowProps) {
  const meta = metaFor(event.kind)
  const Icon = meta.Icon
  const [hover, setHover] = useState(false)
  const isFuture = event.isFuture
  const dimmed = event.isDone && STRIKE_KINDS.has(event.kind)

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: dimmed ? 0.38 : 1, y: 0 }}
      transition={{ delay, duration: 0.34, ease: [0.2, 0.7, 0.1, 1] }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: `${COL_TIME}px ${COL_GUTTER}px 1fr`,
        alignItems: 'flex-start',
        padding: '7px 0',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        color: 'var(--fg-dim)',
        textAlign: 'right',
        paddingTop: 5, paddingRight: 10,
        whiteSpace: 'nowrap',
        letterSpacing: '0.02em',
      }}>
        {formatTime(event.timestamp)}
      </span>

      <div style={{
        position: 'relative',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: 4,
      }}>
        <div style={{
          width: 14, height: 14, borderRadius: '50%',
          background: isFuture ? 'var(--bg)' : meta.color,
          border: `1.5px solid ${meta.color}`,
          boxShadow: hover ? `0 0 0 5px ${meta.color}1f` : 'none',
          transition: 'box-shadow 200ms ease, transform 200ms var(--ease-spring)',
          transform: hover ? 'scale(1.08)' : 'scale(1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 5,
        }}>
          {!isFuture && (
            <Icon size={7} strokeWidth={3} style={{ color: 'var(--bg)' }} />
          )}
        </div>
      </div>

      <div style={{
        minWidth: 0,
        paddingLeft: 6,
        paddingRight: 4,
        borderRadius: 8,
        background: hover ? 'oklch(100% 0 0 / 0.025)' : 'transparent',
        transition: 'background 200ms ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            color: meta.color,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontWeight: 600,
            flexShrink: 0,
            opacity: 0.85,
          }}>
            {meta.label}
          </span>
          <span style={{
            fontSize: 13.5,
            color: dimmed ? 'var(--fg-dim)' : 'var(--fg)',
            fontWeight: 500,
            letterSpacing: '-0.01em',
            textDecoration: dimmed ? 'line-through' : 'none',
            flex: 1, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {event.title}
          </span>
          {onClick && (
            <ChevronDown
              size={12}
              style={{
                color: 'var(--fg-dim)',
                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
                transition: 'transform 220ms ease',
                flexShrink: 0,
              }}
            />
          )}
          {event.onRemove && (
            <button
              onClick={e => { e.stopPropagation(); event.onRemove?.() }}
              style={{
                width: 22, height: 22, borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--fg-dim)',
                background: 'transparent',
                flexShrink: 0,
                opacity: hover ? 1 : 0,
                transition: 'opacity 180ms ease, color 180ms ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-dim)' }}
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>

        {event.body && !isExpanded && (
          <p style={{
            fontSize: 12,
            color: 'var(--fg-muted)',
            margin: '3px 0 0',
            lineHeight: 1.55,
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
            overflow: 'hidden',
            letterSpacing: '-0.005em',
          }}>
            {event.body}
          </p>
        )}

        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit   ={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.2, 0.7, 0.1, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{
                marginTop: 8,
                padding: '12px 14px',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                fontSize: 12.5,
                color: 'var(--fg-2)',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
              }}>
                {body
                  ? (body.bodyText || body.bodyHtml.replace(/<[^>]*>/g, ' ').trim() || '(leer)')
                  : <span style={{ color: 'var(--fg-dim)' }}>Laden…</span>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Now line
// ─────────────────────────────────────────────────────────────────────────────

interface NowLineProps { nowMs: number; hasFuture: boolean; hasPast: boolean }

function NowLine({ nowMs, hasFuture, hasPast }: NowLineProps) {
  const time = new Date(nowMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.12, duration: 0.5 }}
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: `${COL_TIME}px ${COL_GUTTER}px 1fr`,
        alignItems: 'center',
        margin: hasFuture && hasPast
          ? '22px 0'
          : hasFuture ? '22px 0 8px' : '8px 0 22px',
      }}
    >
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        color: 'var(--accent)',
        textAlign: 'right',
        paddingRight: 10,
        whiteSpace: 'nowrap',
        letterSpacing: '0.04em',
        fontWeight: 600,
      }}>
        {time}
      </span>

      <div style={{
        position: 'relative',
        height: 20,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <motion.span
          animate={{ scale: [1, 1.9, 1.9], opacity: [0.55, 0, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            width: 14, height: 14, borderRadius: '50%',
            background: 'var(--accent)',
            zIndex: 4,
          }}
        />
        <span style={{
          width: 14, height: 14, borderRadius: '50%',
          background: 'var(--accent)',
          boxShadow: '0 0 16px 2px var(--accent-glow)',
          zIndex: 6,
        }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 6 }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--accent)',
          fontWeight: 700,
        }}>
          Jetzt
        </span>
        <div style={{
          flex: 1, height: 1,
          background: 'linear-gradient(90deg, var(--accent) 0%, var(--accent) 10%, transparent 100%)',
        }} />
      </div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// StreamFilterBar — tab strip + search above the spine.
// ─────────────────────────────────────────────────────────────────────────────

type StreamFilterId = 'all' | 'calls' | 'notes' | 'mails' | 'tasks'

interface StreamFilterBarProps {
  filter:        StreamFilterId
  onFilterChange:(f: StreamFilterId) => void
  query:         string
  onQueryChange: (q: string) => void
  totalCount:    number
  visibleCount:  number
}

const STREAM_TABS: { id: StreamFilterId; label: string; icon: typeof Phone }[] = [
  { id: 'all',   label: 'Alle',             icon: Inbox       },
  { id: 'calls', label: 'Anrufe & Meetings',icon: Phone       },
  { id: 'notes', label: 'Notizen',          icon: FileText    },
  { id: 'mails', label: 'Mails',            icon: Mail        },
  { id: 'tasks', label: 'Aufgaben',          icon: CheckSquare },
]

function StreamFilterBar({
  filter, onFilterChange, query, onQueryChange, totalCount, visibleCount,
}: StreamFilterBarProps) {
  const [searchOpen, setSearchOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
  }, [searchOpen])

  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      gap: 8, marginTop: 18,
      paddingBottom: 4,
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, minWidth: 0, overflow: 'auto' }}>
        {STREAM_TABS.map(t => {
          const Icon = t.icon
          const active = filter === t.id
          return (
            <button
              key={t.id}
              onClick={() => onFilterChange(t.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', borderRadius: 999,
                background: active ? 'var(--accent-soft)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--fg-muted)',
                fontSize: 11.5, fontWeight: active ? 600 : 500,
                letterSpacing: '-0.005em',
                cursor: 'pointer',
                transition: 'background 180ms ease, color 180ms ease',
                whiteSpace: 'nowrap',
              }}
            >
              <Icon size={11} strokeWidth={2.4} />
              {t.label}
            </button>
          )
        })}
      </div>

      {filter !== 'all' || query.trim() !== '' ? (
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: 'var(--fg-dim)', letterSpacing: '0.02em',
          opacity: 0.8, flexShrink: 0,
        }}>
          {visibleCount}/{totalCount}
        </span>
      ) : null}

      {searchOpen || query ? (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 8px',
          borderRadius: 8,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <Search size={11} strokeWidth={2.4} style={{ color: 'var(--fg-dim)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            onBlur={() => { if (!query) setSearchOpen(false) }}
            placeholder="Stream durchsuchen…"
            style={{
              width: 140,
              background: 'transparent', border: 'none',
              color: 'var(--fg)', fontSize: 11.5,
              letterSpacing: '-0.005em',
            }}
          />
          {query && (
            <button
              onClick={() => { onQueryChange(''); inputRef.current?.focus() }}
              style={{
                width: 16, height: 16,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--fg-dim)', background: 'transparent',
              }}
            >
              <X size={9} strokeWidth={2.4} />
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={() => setSearchOpen(true)}
          aria-label="Stream durchsuchen"
          style={{
            width: 26, height: 26, borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--fg-muted)', background: 'transparent',
            flexShrink: 0,
            transition: 'color 180ms ease, background 180ms ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = 'var(--fg)'
            e.currentTarget.style.background = 'oklch(100% 0 0 / 0.04)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'var(--fg-muted)'
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <Search size={12} />
        </button>
      )}
    </div>
  )
}
