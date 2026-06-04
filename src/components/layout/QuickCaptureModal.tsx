import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X } from 'lucide-react'
import { usePrivateNotesStore } from '@/store/private-notes.store'
import { useUiStore } from '@/store/ui.store'

export function QuickCaptureModal() {
  const open    = useUiStore(s => s.quickCaptureOpen)
  const setOpen = useUiStore(s => s.setQuickCaptureOpen)

  const createNote = usePrivateNotesStore(s => s.create)
  const updateNote = usePrivateNotesStore(s => s.update)

  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-focus when opened
  useEffect(() => {
    if (open) {
      setText('')
      setTimeout(() => textareaRef.current?.focus(), 60)
    }
  }, [open])

  // Esc to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setOpen])

  const handleSave = () => {
    const content = text.trim()
    if (!content) { setOpen(false); return }

    const firstLine = content.split('\n')[0].slice(0, 60)
    const id = createNote()
    updateNote(id, {
      title: firstLine || new Date().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
      body: content,
    })
    setText('')
    setOpen(false)
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="qc-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(4px)',
            }}
          />

          {/* Modal */}
          <motion.div
            key="qc-modal"
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -12 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{
              position: 'fixed',
              top: '28%',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1001,
              width: '100%',
              maxWidth: 480,
              padding: '0 16px',
            }}
          >
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 18,
              boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
              overflow: 'hidden',
            }}>
              {/* Header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '14px 16px 0',
              }}>
                <Sparkles size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <span style={{
                  flex: 1, fontSize: 11, fontWeight: 700,
                  fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
                  color: 'var(--accent)',
                }}>
                  QUICK CAPTURE
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--fg-dim)', display: 'flex', padding: 2,
                  }}
                >
                  <X size={14} />
                </button>
              </div>

              {/* Textarea */}
              <div style={{ padding: '10px 16px 14px' }}>
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Gedanke, Idee, Erinnerung…"
                  rows={4}
                  style={{
                    width: '100%', background: 'transparent', border: 'none',
                    fontSize: 15, color: 'var(--fg)', outline: 'none',
                    resize: 'none', lineHeight: 1.6, fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Footer */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px 14px',
                borderTop: '1px solid var(--border)',
              }}>
                <span style={{
                  fontSize: 10, color: 'var(--fg-dim)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  ⌘↵ speichern · Esc schließen
                </span>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!text.trim()}
                  style={{
                    padding: '7px 16px', borderRadius: 99, border: 'none',
                    background: text.trim() ? 'var(--accent)' : 'var(--surface-2)',
                    color: text.trim() ? 'var(--accent-ink)' : 'var(--fg-dim)',
                    fontSize: 12, fontWeight: 700, cursor: text.trim() ? 'pointer' : 'not-allowed',
                    transition: 'all 150ms',
                    boxShadow: text.trim() ? '0 0 12px var(--accent-glow)' : 'none',
                  }}
                >
                  Speichern
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
