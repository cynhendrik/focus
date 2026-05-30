import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, X } from 'lucide-react'
import { useNotesStore } from '@/store/notes.store'
import { useContactsStore } from '@/store/contacts.store'
import type { Note } from '@/types/note.types'
import type { Contact } from '@/types/contact.types'
import { contactColor, fullNameOf, initialsOf } from './ContactCard'

// ─────────────────────────────────────────────────────────────────────────────
// InfosFeed — Roam-light note feed.
//
// • Each note = pinned Note. Inline @mention + #tag rendered as colored pills.
// • Typing @ or # opens an autocomplete dropdown (contacts / known tags).
//   Arrow keys + Enter/Tab to insert; Escape closes.
// • Tag-aggregate at the bottom; click on a tag filters the feed.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  customerId: string
  notes: Note[]
}

// ── Legacy JSON migration (Hebel/Zug) → plain text ──────────────────────────
export function readInfos(content: string | undefined, fallbackTitle: string): string {
  if (!content) return fallbackTitle
  if (content.startsWith('{') && content.endsWith('}')) {
    try {
      const p = JSON.parse(content) as { hebel?: string; zug?: string }
      const parts: string[] = []
      if (p.hebel?.trim()) parts.push(`Hebel: ${p.hebel.trim()}`)
      if (p.zug?.trim())   parts.push(`Zug: ${p.zug.trim()}`)
      if (parts.length) return parts.join('\n\n')
    } catch { /* not JSON — fall through */ }
  }
  return content
}

// ── Markdown-Light parser ───────────────────────────────────────────────────
//
// Block-level: # heading, ## subheading, - bullet, paragraph (default), empty.
// Inline:      **bold**, *italic*, [label](url), @mention, #tag, plain text.
// Edit mode keeps raw markdown visible (Notion/Linear style). Display mode
// renders. The @/# autocomplete is unaffected — the detector walks back to
// the last @ or # and ignores other markdown characters.
// ─────────────────────────────────────────────────────────────────────────────

type InlineToken =
  | { kind: 'text';    value: string }
  | { kind: 'bold';    inner: InlineToken[] }
  | { kind: 'italic';  inner: InlineToken[] }
  | { kind: 'link';    label: string; href: string }
  | { kind: 'mention'; name:  string }
  | { kind: 'tag';     name:  string }

type Block =
  | { kind: 'heading';   level: 1 | 2; inline: InlineToken[] }
  | { kind: 'bullet';    inline: InlineToken[] }
  | { kind: 'paragraph'; inline: InlineToken[] }
  | { kind: 'blank' }

const INLINE_RE = new RegExp(
  [
    '\\*\\*[^*\\n][^*\\n]*\\*\\*',     // **bold**
    '\\*[^*\\n][^*\\n]*\\*',           // *italic*
    '\\[[^\\]\\n]+\\]\\([^)\\s]+\\)',  // [label](url)
    '@[\\wäöüÄÖÜß-]+',                 // @mention
    '#[\\wäöüÄÖÜß-]+',                 // #tag
  ].join('|'),
  'g',
)

function tokenizeInline(text: string): InlineToken[] {
  const out: InlineToken[] = []
  let lastIndex = 0
  let m: RegExpExecArray | null
  const re = new RegExp(INLINE_RE.source, 'g')
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      out.push({ kind: 'text', value: text.slice(lastIndex, m.index) })
    }
    const tok = m[0]
    if (tok.startsWith('**')) {
      out.push({ kind: 'bold', inner: tokenizeInline(tok.slice(2, -2)) })
    } else if (tok.startsWith('*')) {
      out.push({ kind: 'italic', inner: tokenizeInline(tok.slice(1, -1)) })
    } else if (tok.startsWith('[')) {
      const labelEnd = tok.indexOf(']')
      const label = tok.slice(1, labelEnd)
      const href  = tok.slice(labelEnd + 2, -1)
      out.push({ kind: 'link', label, href })
    } else if (tok.startsWith('@')) {
      out.push({ kind: 'mention', name: tok.slice(1) })
    } else {
      out.push({ kind: 'tag', name: tok.slice(1) })
    }
    lastIndex = m.index + tok.length
  }
  if (lastIndex < text.length) {
    out.push({ kind: 'text', value: text.slice(lastIndex) })
  }
  return out
}

function parseBlocks(text: string): Block[] {
  const lines = text.split('\n')
  return lines.map<Block>(line => {
    if (line.trim() === '')      return { kind: 'blank' }
    if (line.startsWith('## '))  return { kind: 'heading',   level: 2, inline: tokenizeInline(line.slice(3)) }
    if (line.startsWith('# '))   return { kind: 'heading',   level: 1, inline: tokenizeInline(line.slice(2)) }
    if (line.startsWith('- '))   return { kind: 'bullet',    inline: tokenizeInline(line.slice(2)) }
    return { kind: 'paragraph', inline: tokenizeInline(line) }
  })
}

export function matchContact(name: string, contacts: Contact[]): Contact | null {
  const lower = name.toLowerCase()
  return contacts.find(c => {
    const f = c.firstName.toLowerCase()
    const l = c.lastName?.toLowerCase() ?? ''
    return f === lower || l === lower || `${f}${l}` === lower || `${f}-${l}` === lower
  }) ?? null
}

export function extractTags(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/#([\wäöüÄÖÜß-]+)/g)) out.push(m[1].toLowerCase())
  return out
}

// ── Active token detection for autocomplete ─────────────────────────────────
type ActiveQuery = { kind: 'mention' | 'tag'; text: string; start: number }

function detectActiveToken(text: string, caret: number): ActiveQuery | null {
  let i = caret - 1
  while (i >= 0) {
    const c = text[i]
    if (c === '@') return { kind: 'mention', text: text.slice(i + 1, caret), start: i }
    if (c === '#') return { kind: 'tag',     text: text.slice(i + 1, caret), start: i }
    if (!/[\wäöüÄÖÜß-]/.test(c)) return null
    i--
  }
  return null
}

// ── Time helpers ────────────────────────────────────────────────────────────
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  const h = Math.floor(diff / 3_600_000)
  const d = Math.floor(diff / 86_400_000)
  if (m < 1)  return 'gerade eben'
  if (m < 60) return `vor ${m} Min.`
  if (h < 24) return `vor ${h} Std.`
  if (d === 1) return 'gestern'
  if (d < 7)   return `vor ${d} Tagen`
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function InfosFeed({ customerId, notes }: Props) {
  const upsert = useNotesStore(s => s.upsert)
  const remove = useNotesStore(s => s.remove)
  const contacts = useContactsStore(s => s.contacts.filter(c => c.accountId === customerId))

  const allInfos = useMemo(
    () => notes
      .filter(n => n.pinned && n.customerId === customerId)
      .map(n => ({ ...n, displayText: readInfos(n.content, n.title) }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [notes, customerId],
  )

  // ── Tag aggregate (over ALL notes, not filtered) ────────────────────────
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const n of allInfos) {
      for (const t of extractTags(n.displayText)) {
        counts.set(t, (counts.get(t) ?? 0) + 1)
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [allInfos])

  const knownTags = useMemo(() => tagCounts.map(([t]) => t), [tagCounts])

  // ── Filter state ─────────────────────────────────────────────────────────
  const [filterTag, setFilterTag] = useState<string | null>(null)
  const filteredInfos = useMemo(() => {
    if (!filterTag) return allInfos
    return allInfos.filter(n =>
      n.displayText.toLowerCase().includes(`#${filterTag.toLowerCase()}`))
  }, [allInfos, filterTag])

  // ── Composer / edit state ────────────────────────────────────────────────
  const [composerOpen, setComposerOpen] = useState(false)
  const [editingId, setEditingId]       = useState<string | null>(null)

  const addNote = useCallback(async (text: string) => {
    setComposerOpen(false)
    const trimmed = text.trim()
    if (!trimmed) return
    await upsert({
      customerId,
      title: trimmed.slice(0, 60),
      content: trimmed,
      pinned: true,
      noteType: 'zusammenfassung',
    })
  }, [customerId, upsert])

  const commitEdit = useCallback(async (note: Note, text: string) => {
    const next = text.trim()
    setEditingId(null)
    if (!next) { await remove(note.id); return }
    if (next === readInfos(note.content, note.title)) return
    await upsert({
      id:        note.id,
      customerId,
      title:     next.slice(0, 60),
      content:   next,
      pinned:    true,
      noteType:  note.noteType,
    })
  }, [customerId, upsert, remove])

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
          Infos
        </span>
        {allInfos.length > 0 && (
          <span style={{
            fontSize: 10, color: 'var(--fg-dim)',
            fontFamily: 'var(--font-mono)', opacity: 0.7,
          }}>
            · {filterTag ? `${filteredInfos.length}/${allInfos.length}` : allInfos.length}
          </span>
        )}
        <div style={{
          flex: 1, height: 1,
          background: 'linear-gradient(90deg, var(--border) 0%, transparent 100%)',
        }} />
        <button
          onClick={() => setComposerOpen(true)}
          aria-label="Notiz hinzufügen"
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
          Notiz
        </button>
      </div>

      {/* Active filter chip */}
      <AnimatePresence initial={false}>
        {filterTag && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 8 }}
            exit   ={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.14, ease: [0.2, 0.7, 0.1, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9.5,
                letterSpacing: '0.14em', textTransform: 'uppercase',
                color: 'var(--fg-dim)', fontWeight: 500,
              }}>
                Gefiltert
              </span>
              <button
                onClick={() => setFilterTag(null)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 5px 2px 8px', borderRadius: 999,
                  background: 'var(--accent-soft)',
                  border: '1px solid var(--accent)',
                  color: 'var(--accent)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  letterSpacing: '-0.005em',
                }}
              >
                #{filterTag}
                <X size={10} strokeWidth={2.4} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Composer */}
      <AnimatePresence initial={false}>
        {composerOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 10 }}
            exit   ={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.16, ease: [0.2, 0.7, 0.1, 1] }}
            style={{ overflow: 'visible' }}
          >
            <NoteEditor
              initialValue=""
              contacts={contacts}
              knownTags={knownTags}
              placeholder="Was willst du festhalten?  @Name verlinkt · #tag kategorisiert"
              autoFocus
              onCommit={addNote}
              onCancel={() => setComposerOpen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {allInfos.length === 0 && !composerOpen && (
        <button
          onClick={() => setComposerOpen(true)}
          style={{
            display: 'block', width: '100%',
            padding: '14px 13px',
            borderRadius: 11,
            background: 'transparent',
            border: '1px dashed var(--border)',
            color: 'var(--fg-dim)',
            fontSize: 12.5, fontStyle: 'italic',
            lineHeight: 1.55,
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
          + Erste Notiz pinnen — tippe @ für Kontakte, # für Tags.
        </button>
      )}

      {/* Filter-empty state */}
      {filterTag && filteredInfos.length === 0 && (
        <p style={{
          padding: '12px 0', textAlign: 'center',
          fontSize: 12, color: 'var(--fg-dim)',
        }}>
          Keine Notizen mit <code style={{ color: 'var(--accent)' }}>#{filterTag}</code>.
        </p>
      )}

      {/* Notes feed */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <AnimatePresence initial={false}>
          {filteredInfos.map(n => (
            <NoteItem
              key={n.id}
              note={n}
              displayText={n.displayText}
              contacts={contacts}
              knownTags={knownTags}
              isEditing={editingId === n.id}
              onStartEdit={() => setEditingId(n.id)}
              onCommit={text => commitEdit(n, text)}
              onCancel={() => setEditingId(null)}
              onDelete={() => remove(n.id)}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Tags aggregate — click to filter */}
      {tagCounts.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: 6, paddingLeft: 2,
          }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9.5,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              color: 'var(--fg-dim)', fontWeight: 500,
              opacity: 0.85,
            }}>
              Tags · {tagCounts.length}
            </span>
            <div style={{
              flex: 1, height: 1,
              background: 'linear-gradient(90deg, var(--border) 0%, transparent 100%)',
              opacity: 0.6,
            }} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {tagCounts.map(([tag, count]) => {
              const active = filterTag === tag
              return (
                <button
                  key={tag}
                  onClick={() => setFilterTag(active ? null : tag)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 999,
                    background: active ? 'var(--accent)' : 'var(--accent-soft)',
                    color: active ? 'var(--accent-ink)' : 'var(--accent)',
                    border: active ? '1px solid var(--accent)' : '1px solid transparent',
                    fontSize: 11, fontWeight: 500,
                    letterSpacing: '-0.005em',
                    cursor: 'pointer',
                    transition: 'background 180ms ease, color 180ms ease',
                  }}
                >
                  #{tag}
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9.5,
                    opacity: 0.75, letterSpacing: '0.04em',
                  }}>
                    · {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// NoteEditor — textarea + autocomplete dropdown.
// Used for the composer AND in-place edits. Identical behavior.
// ─────────────────────────────────────────────────────────────────────────────

interface NoteEditorProps {
  initialValue: string
  contacts: Contact[]
  knownTags: string[]
  placeholder?: string
  autoFocus?: boolean
  onCommit: (text: string) => void
  onCancel: () => void
}

function NoteEditor({
  initialValue, contacts, knownTags,
  placeholder, autoFocus,
  onCommit, onCancel,
}: NoteEditorProps) {
  const [draft, setDraft] = useState(initialValue)
  const [caret, setCaret] = useState(initialValue.length)
  const [activeIndex, setActiveIndex] = useState(0)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const committedRef = useRef(false)

  // Auto-focus + auto-grow
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    if (autoFocus) {
      el.focus()
      el.setSelectionRange(initialValue.length, initialValue.length)
    }
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 56)}px`
  }, [autoFocus, initialValue.length])

  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 56)}px`
  }, [draft])

  const activeQuery = useMemo(() => detectActiveToken(draft, caret), [draft, caret])

  const suggestions = useMemo(() => {
    if (!activeQuery) return [] as Suggestion[]
    const q = activeQuery.text.toLowerCase()

    if (activeQuery.kind === 'mention') {
      return contacts
        .filter(c => {
          if (!q) return true
          const f = c.firstName.toLowerCase()
          const l = c.lastName?.toLowerCase() ?? ''
          return f.startsWith(q) || l.startsWith(q) || f.includes(q) || l.includes(q)
        })
        .slice(0, 6)
        .map<Suggestion>(c => ({
          key:      c.id,
          label:    fullNameOf(c),
          sublabel: c.role ?? undefined,
          insert:   c.firstName,
          contact:  c,
        }))
    }

    return knownTags
      .filter(t => !q || t.includes(q))
      .slice(0, 6)
      .map<Suggestion>(t => ({
        key:    t,
        label:  `#${t}`,
        insert: t,
      }))
  }, [activeQuery, contacts, knownTags])

  useEffect(() => { setActiveIndex(0) }, [suggestions])

  const insertSuggestion = useCallback((idx: number) => {
    const sug = suggestions[idx]
    if (!sug || !activeQuery) return
    const replacement = (activeQuery.kind === 'mention' ? '@' : '#') + sug.insert + ' '
    const before = draft.slice(0, activeQuery.start)
    const after  = draft.slice(caret)
    const newText  = before + replacement + after
    const newCaret = before.length + replacement.length
    setDraft(newText)
    requestAnimationFrame(() => {
      const el = taRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(newCaret, newCaret)
      setCaret(newCaret)
    })
  }, [suggestions, activeQuery, draft, caret])

  const commit = () => {
    if (committedRef.current) return
    committedRef.current = true
    onCommit(draft)
  }

  const cancel = () => {
    committedRef.current = true
    onCancel()
  }

  const updateCaret = (el: HTMLTextAreaElement) => {
    setCaret(el.selectionStart ?? draft.length)
  }

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={taRef}
        value={draft}
        onChange={e => {
          setDraft(e.target.value)
          updateCaret(e.target)
        }}
        onSelect={e => updateCaret(e.target as HTMLTextAreaElement)}
        onKeyUp={e => updateCaret(e.target as HTMLTextAreaElement)}
        onClick={e => updateCaret(e.target as HTMLTextAreaElement)}
        onBlur={commit}
        onKeyDown={e => {
          // Autocomplete is open → arrow/Enter/Tab control it
          if (activeQuery && suggestions.length > 0) {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActiveIndex(i => (i + 1) % suggestions.length)
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActiveIndex(i => (i - 1 + suggestions.length) % suggestions.length)
              return
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault()
              insertSuggestion(activeIndex)
              return
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              // Just close autocomplete by clearing the active query — simplest: blur
              taRef.current?.blur()
              return
            }
          }
          // Default editor controls
          if (e.key === 'Escape') {
            e.preventDefault()
            cancel()
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            taRef.current?.blur()
          }
        }}
        placeholder={placeholder}
        style={{
          width: '100%',
          minHeight: 56,
          padding: '10px 12px',
          borderRadius: 11,
          background: 'var(--surface-2)',
          border: '1px solid var(--accent)',
          boxShadow: '0 0 0 3px var(--accent-soft)',
          color: 'var(--fg)',
          fontSize: 13, lineHeight: 1.55,
          letterSpacing: '-0.005em',
          resize: 'none',
          fontFamily: 'inherit',
          overflow: 'hidden',
        }}
      />

      <AutocompleteDropdown
        query={activeQuery}
        suggestions={suggestions}
        activeIndex={activeIndex}
        onHover={setActiveIndex}
        onPick={insertSuggestion}
      />
    </div>
  )
}

// ─── Autocomplete dropdown ─────────────────────────────────────────────────

interface Suggestion {
  key:       string
  label:     string
  sublabel?: string
  insert:    string
  contact?:  Contact
}

interface AutocompleteDropdownProps {
  query: ActiveQuery | null
  suggestions: Suggestion[]
  activeIndex: number
  onHover: (i: number) => void
  onPick: (i: number) => void
}

function AutocompleteDropdown({
  query, suggestions, activeIndex, onHover, onPick,
}: AutocompleteDropdownProps) {
  if (!query || suggestions.length === 0) return null

  const isMention = query.kind === 'mention'

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit   ={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.12, ease: [0.2, 0.7, 0.1, 1] }}
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        left: 0, right: 0,
        zIndex: 50,
        background: 'var(--surface-2)',
        border: '1px solid var(--border-strong)',
        borderRadius: 12,
        padding: 4,
        boxShadow: 'var(--shadow-2)',
        display: 'flex', flexDirection: 'column', gap: 1,
      }}
      // Don't let mousedown blur the textarea (which would close the dropdown)
      onMouseDown={e => e.preventDefault()}
    >
      <div style={{
        padding: '5px 9px 4px',
        fontFamily: 'var(--font-mono)', fontSize: 9.5,
        letterSpacing: '0.14em', textTransform: 'uppercase',
        color: 'var(--fg-dim)', fontWeight: 500,
      }}>
        {isMention ? 'Person verlinken' : 'Tag wählen'}
      </div>

      {suggestions.map((s, i) => {
        const active = i === activeIndex
        return (
          <button
            key={s.key}
            onMouseEnter={() => onHover(i)}
            onClick={() => onPick(i)}
            style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '6px 9px', borderRadius: 8,
              background: active ? 'oklch(100% 0 0 / 0.08)' : 'transparent',
              border: 'none', cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 120ms ease',
            }}
          >
            {isMention && s.contact ? (
              <SuggestionAvatar contact={s.contact} />
            ) : (
              <span style={{
                width: 22, height: 22, borderRadius: 6,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
                fontSize: 11, fontWeight: 700,
              }}>
                #
              </span>
            )}
            <span style={{
              display: 'flex', flexDirection: 'column',
              minWidth: 0, flex: 1,
            }}>
              <span style={{
                fontSize: 12.5, color: 'var(--fg)', fontWeight: 500,
                letterSpacing: '-0.005em',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {s.label}
              </span>
              {s.sublabel && (
                <span style={{
                  fontSize: 10.5, color: 'var(--fg-dim)',
                  fontFamily: 'var(--font-mono)', letterSpacing: '0.02em',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {s.sublabel}
                </span>
              )}
            </span>
            {active && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9.5,
                letterSpacing: '0.06em', color: 'var(--fg-dim)',
              }}>
                ⏎
              </span>
            )}
          </button>
        )
      })}
    </motion.div>
  )
}

function SuggestionAvatar({ contact }: { contact: Contact }) {
  const color = contactColor(fullNameOf(contact))
  return (
    <span style={{
      width: 22, height: 22, borderRadius: '50%',
      background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`,
      color: 'oklch(15% 0 0)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 10, fontWeight: 700, letterSpacing: '-0.02em',
      flexShrink: 0,
    }}>
      {initialsOf(contact)}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// NoteItem
// ─────────────────────────────────────────────────────────────────────────────

interface NoteItemProps {
  note: Note
  displayText: string
  contacts: Contact[]
  knownTags: string[]
  isEditing: boolean
  onStartEdit: () => void
  onCommit: (text: string) => void
  onCancel: () => void
  onDelete: () => void
}

function NoteItem({
  note, displayText, contacts, knownTags, isEditing,
  onStartEdit, onCommit, onCancel, onDelete,
}: NoteItemProps) {
  const [hover, setHover] = useState(false)

  if (isEditing) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0.6 }}
        animate={{ opacity: 1 }}
        exit   ={{ opacity: 0 }}
        transition={{ duration: 0.14 }}
      >
        <NoteEditor
          initialValue={displayText}
          contacts={contacts}
          knownTags={knownTags}
          autoFocus
          onCommit={onCommit}
          onCancel={onCancel}
        />
      </motion.div>
    )
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit   ={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.18, ease: [0.2, 0.7, 0.1, 1] }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onStartEdit}
      style={{
        position: 'relative',
        padding: '10px 12px',
        borderRadius: 11,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        cursor: 'text',
        transition: 'border-color 180ms ease',
        ...(hover ? { borderColor: 'var(--border-strong)' } : null),
      }}
    >
      <div style={{
        fontSize: 13, lineHeight: 1.55,
        color: 'var(--fg-2)',
        letterSpacing: '-0.005em',
        wordWrap: 'break-word',
      }}>
        <ParsedText text={displayText} contacts={contacts} />
      </div>

      <div style={{
        display: 'flex', alignItems: 'center',
        marginTop: 6,
        minHeight: 18,
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          letterSpacing: '0.04em',
          color: 'var(--fg-dim)', opacity: 0.7,
        }}>
          {relTime(note.createdAt)}
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          aria-label="Notiz entfernen"
          style={{
            width: 20, height: 20, borderRadius: 5,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent',
            color: 'var(--fg-dim)',
            opacity: hover ? 1 : 0,
            transition: 'opacity 180ms ease, color 180ms ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-dim)' }}
        >
          <Trash2 size={10} />
        </button>
      </div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ParsedText — block + inline markdown renderer.
// Headings, bullets, paragraphs at the block level. Bold, italic, link,
// @mention, #tag at the inline level.
// ─────────────────────────────────────────────────────────────────────────────

function ParsedText({ text, contacts }: { text: string; contacts: Contact[] }) {
  const blocks = useMemo(() => parseBlocks(text), [text])

  // Group consecutive bullets so they render as a tight cluster, not as
  // separate rows with extra spacing.
  const elements: React.ReactNode[] = []
  let bulletBuf: Block[] = []
  const flushBullets = () => {
    if (bulletBuf.length === 0) return
    elements.push(
      <ul key={`ul-${elements.length}`} style={{
        margin: '4px 0 4px 14px',
        paddingLeft: 0,
        listStyleType: 'disc',
        listStylePosition: 'outside',
      }}>
        {bulletBuf.map((b, i) => (
          <li key={i} style={{
            paddingLeft: 4,
            color: 'var(--fg-2)',
            letterSpacing: '-0.005em',
          }}>
            <RenderInline tokens={(b as Extract<Block, { kind: 'bullet' }>).inline} contacts={contacts} />
          </li>
        ))}
      </ul>,
    )
    bulletBuf = []
  }

  blocks.forEach((b, i) => {
    if (b.kind === 'bullet') {
      bulletBuf.push(b)
      return
    }
    flushBullets()
    if (b.kind === 'blank') {
      elements.push(<div key={i} style={{ height: 6 }} />)
      return
    }
    if (b.kind === 'heading') {
      const Tag = (b.level === 1 ? 'h3' : 'h4') as 'h3' | 'h4'
      const styles: React.CSSProperties = b.level === 1
        ? { fontSize: 14.5, fontWeight: 700, margin: '6px 0 2px', letterSpacing: '-0.015em', color: 'var(--fg)' }
        : { fontSize: 13,   fontWeight: 600, margin: '4px 0 1px', letterSpacing: '-0.01em', color: 'var(--fg)' }
      elements.push(
        <Tag key={i} style={styles}>
          <RenderInline tokens={b.inline} contacts={contacts} />
        </Tag>,
      )
      return
    }
    // paragraph — render inline; preserve linebreaks via separate paragraphs
    elements.push(
      <span key={i} style={{ display: 'block', letterSpacing: '-0.005em' }}>
        <RenderInline tokens={b.inline} contacts={contacts} />
      </span>,
    )
  })
  flushBullets()

  return <>{elements}</>
}

function RenderInline({ tokens, contacts }: { tokens: InlineToken[]; contacts: Contact[] }) {
  return (
    <>
      {tokens.map((t, i) => {
        if (t.kind === 'text')    return <span key={i}>{t.value}</span>
        if (t.kind === 'bold')    return <strong key={i} style={{ fontWeight: 700, color: 'var(--fg)' }}><RenderInline tokens={t.inner} contacts={contacts} /></strong>
        if (t.kind === 'italic')  return <em key={i} style={{ fontStyle: 'italic' }}><RenderInline tokens={t.inner} contacts={contacts} /></em>
        if (t.kind === 'link')    return <LinkInline key={i} label={t.label} href={t.href} />
        if (t.kind === 'tag')     return <TagInline key={i} name={t.name} />
        const c = matchContact(t.name, contacts)
        return <MentionInline key={i} name={t.name} contact={c} />
      })}
    </>
  )
}

function LinkInline({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      style={{
        color: 'var(--accent)',
        textDecoration: 'underline',
        textDecorationColor: 'var(--accent-soft)',
        textUnderlineOffset: 2,
      }}
    >
      {label}
    </a>
  )
}

function TagInline({ name }: { name: string }) {
  return (
    <span style={{
      display: 'inline',
      padding: '0 6px',
      borderRadius: 4,
      background: 'var(--accent-soft)',
      color: 'var(--accent)',
      fontSize: 'inherit',
      fontWeight: 600,
      letterSpacing: '-0.005em',
      whiteSpace: 'nowrap',
    }}>
      #{name}
    </span>
  )
}

function MentionInline({ name, contact }: { name: string; contact: Contact | null }) {
  const color = contact ? contactColor(fullNameOf(contact)) : 'var(--fg-muted)'
  const tint = contact ? `${color}28` : 'oklch(100% 0 0 / 0.06)'
  return (
    <span
      title={contact ? fullNameOf(contact) : `Unbekannt: ${name}`}
      style={{
        display: 'inline',
        padding: '0 6px',
        borderRadius: 4,
        background: tint,
        color: color,
        fontSize: 'inherit',
        fontWeight: 600,
        letterSpacing: '-0.005em',
        whiteSpace: 'nowrap',
      }}
    >
      @{name}
    </span>
  )
}
