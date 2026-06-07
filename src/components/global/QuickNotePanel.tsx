import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  PenLine, X, Copy, Check, BookmarkPlus, ChevronRight,
} from 'lucide-react'
import { useGlobalComposerStore } from '@/store/global-composer.store'
import { useNotesModuleStore }    from '@/store/notes-module.store'
import { useAccountsStore }       from '@/store/accounts.store'
import { useWorkspaceStore }      from '@/store/workspace.store'
import { useAuthStore }           from '@/store/auth.store'

// Scratchpad-Inhalt bleibt im Modul-Scope — überlebt Navigation
let persistedText = ''

export function QuickNotePanel() {
  const open   = useGlobalComposerStore(s => s.open)
  const toggle = useGlobalComposerStore(s => s.toggle)
  const close  = useGlobalComposerStore(s => s.close)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); toggle() }
      if (e.key === 'Escape' && open && !inField) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, close, open])

  return createPortal(
    <>
      {/* Toggle button */}
      <button
        onClick={toggle}
        title={open ? 'Schließen' : 'Quick Capture (⌘K)'}
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 800,
          width: 48, height: 48, borderRadius: '50%',
          background: open ? 'var(--surface)' : 'var(--accent)',
          color: open ? 'var(--fg-muted)' : 'var(--accent-ink)',
          border: `1px solid ${open ? 'var(--border)' : 'transparent'}`,
          boxShadow: open
            ? '0 4px 16px oklch(0% 0 0 / 0.2)'
            : '0 8px 24px -6px var(--accent-glow), 0 0 0 5px oklch(80% 0.2 125 / 0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          transition: 'background 200ms, transform 160ms, box-shadow 200ms',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = '' }}
      >
        {open ? <X size={17} /> : <PenLine size={17} />}
      </button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: 20, scale: 0.97 }}
            animate={{ opacity: 1, x: 0,  scale: 1     }}
            exit   ={{ opacity: 0, x: 20, scale: 0.97  }}
            transition={{ duration: 0.2, ease: [0.2, 0.7, 0.1, 1] }}
            style={{
              position: 'fixed',
              bottom: 84, right: 24,
              width: 340,
              zIndex: 790,
            }}
          >
            <NoteBlock onClose={close} />
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body,
  )
}

// ── NoteBlock ─────────────────────────────────────────────────────────────────

function NoteBlock({ onClose }: { onClose: () => void }) {
  const [text,     setText]     = useState(persistedText)
  const [copied,   setCopied]   = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState<string | null>(null)
  const [showSave, setShowSave] = useState(false)
  const [query,    setQuery]    = useState('')
  const [selIdx,   setSelIdx]   = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const accounts       = useAccountsStore(s => s.accounts)
  const createEntry    = useNotesModuleStore(s => s.createEntry)
  const workspaceId    = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const userId         = useAuthStore(s => s.user?.id) ?? ''

  // Persist content across navigation
  const handleChange = (val: string) => {
    setText(val)
    persistedText = val
  }

  // Auto-focus textarea
  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 80)
  }, [])

  const suggestions = query.trim()
    ? accounts.filter(a => !a.isPrivate && a.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : accounts.filter(a => !a.isPrivate).slice(0, 6)

  const copyAll = async () => {
    if (!text.trim()) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const saveToCustomer = async (accountId: string, accountName: string) => {
    if (!text.trim()) return
    setSaving(true)
    try {
      await createEntry({
        workspaceId,
        accountId,
        title: text.trim().slice(0, 80),
        content: `<p>${text.trim().replace(/\n/g, '</p><p>')}</p>`,
        tags: JSON.stringify(['quick-capture']),
        createdBy: userId,
      })
      setSaved(`Gespeichert bei ${accountName}`)
      setShowSave(false)
      setQuery('')
      setTimeout(() => setSaved(null), 2200)
    } finally {
      setSaving(false)
    }
  }

  const charCount = text.length

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      boxShadow: '0 20px 60px -16px oklch(0% 0 0 / 0.45), 0 0 0 1px oklch(100% 0 0 / 0.04)',
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 14px 10px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <PenLine size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span style={{
          flex: 1, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--fg-dim)',
          fontFamily: 'var(--font-mono)',
        }}>
          Quick Capture
        </span>
        <span style={{ fontSize: 10.5, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
          ⌘K
        </span>
        <button
          onClick={onClose}
          style={{
            width: 24, height: 24, borderRadius: 7, border: 'none',
            background: 'transparent', color: 'var(--fg-dim)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <X size={13} />
        </button>
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => handleChange(e.target.value)}
        placeholder="Gedanken, Ideen, Mitschriften…"
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '14px 16px',
          background: 'transparent', border: 'none', outline: 'none', resize: 'none',
          fontSize: 13.5, lineHeight: 1.7, color: 'var(--fg)',
          fontFamily: 'inherit', minHeight: 200, maxHeight: 360,
        }}
      />

      {/* Save to customer — inline search */}
      <AnimatePresence>
        {showSave && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: 'hidden', borderTop: '1px solid var(--border)' }}
          >
            <div style={{ padding: '8px 10px 4px' }}>
              <input
                autoFocus
                value={query}
                onChange={e => { setQuery(e.target.value); setSelIdx(0) }}
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setSelIdx(i => Math.min(i + 1, suggestions.length - 1)) }
                  if (e.key === 'ArrowUp')   { e.preventDefault(); setSelIdx(i => Math.max(i - 1, 0)) }
                  if (e.key === 'Enter' && suggestions[selIdx]) saveToCustomer(suggestions[selIdx].id, suggestions[selIdx].name)
                  if (e.key === 'Escape') setShowSave(false)
                }}
                placeholder="Kunde tippen…"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '6px 10px', borderRadius: 8,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  color: 'var(--fg)', fontSize: 12.5, outline: 'none', fontFamily: 'inherit',
                }}
              />
            </div>
            <div style={{ maxHeight: 180, overflowY: 'auto', padding: '4px 6px 8px' }}>
              {suggestions.map((acc, i) => (
                <button
                  key={acc.id}
                  onClick={() => saveToCustomer(acc.id, acc.name)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', padding: '7px 10px', borderRadius: 8, border: 'none',
                    background: i === selIdx ? 'var(--accent-soft)' : 'transparent',
                    color: i === selIdx ? 'var(--accent-text)' : 'var(--fg-2)',
                    cursor: 'pointer', textAlign: 'left', fontSize: 13, fontFamily: 'inherit',
                    transition: 'background 80ms',
                  }}
                  onMouseEnter={() => setSelIdx(i)}
                >
                  <div style={{
                    width: 24, height: 24, borderRadius: 99, flexShrink: 0,
                    background: 'var(--accent-soft)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: 'var(--accent-text)',
                  }}>
                    {acc.name[0].toUpperCase()}
                  </div>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {acc.name}
                  </span>
                  <ChevronRight size={12} style={{ opacity: 0.4 }} />
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px 10px',
        borderTop: showSave ? 'none' : '1px solid var(--border)',
        flexShrink: 0,
        gap: 8,
      }}>
        <span style={{ fontSize: 10.5, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
          {saved
            ? <span style={{ color: 'var(--ok)', fontWeight: 600 }}>✓ {saved}</span>
            : `${charCount} Zeichen`}
        </span>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={copyAll}
            disabled={!text.trim()}
            title="Alles kopieren"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 11px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'transparent',
              color: copied ? 'var(--ok)' : text.trim() ? 'var(--fg-2)' : 'var(--fg-dim)',
              fontSize: 12, fontWeight: 500, cursor: text.trim() ? 'pointer' : 'not-allowed',
              transition: 'all 140ms',
            }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Kopiert' : 'Kopieren'}
          </button>

          <button
            onClick={() => { if (text.trim()) setShowSave(s => !s) }}
            disabled={!text.trim() || saving}
            title="Bei Kunde speichern"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 11px', borderRadius: 8, border: 'none',
              background: showSave ? 'var(--surface-2)' : 'var(--accent)',
              color: showSave ? 'var(--fg)' : 'var(--accent-ink)',
              fontSize: 12, fontWeight: 600,
              cursor: text.trim() && !saving ? 'pointer' : 'not-allowed',
              opacity: text.trim() ? 1 : 0.5,
              transition: 'all 140ms',
            }}
          >
            <BookmarkPlus size={12} />
            {saving ? 'Speichert…' : 'Bei Kunde'}
          </button>
        </div>
      </div>
    </div>
  )
}
