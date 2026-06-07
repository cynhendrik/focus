import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AtSign, CheckSquare, FileText, Sparkles, X } from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { usePrivateNotesStore }  from '@/store/private-notes.store'
import { useNotesModuleStore }   from '@/store/notes-module.store'
import { useAccountsStore }      from '@/store/accounts.store'
import { useTodosStore }         from '@/store/todos.store'
import { useUiStore }            from '@/store/ui.store'
import { useWorkspaceStore }     from '@/store/workspace.store'
import { useAuthStore }          from '@/store/auth.store'
import type { Account } from '@/types/account.types'

type CaptureMode = 'note' | 'task' | 'task-urgent'

function detectMode(text: string): CaptureMode {
  if (/^!!\s/.test(text) || text.trimEnd() === '!!') return 'task-urgent'
  if (/^!\s/.test(text)  || text.trimEnd() === '!')  return 'task'
  return 'note'
}

export function QuickCaptureModal() {
  const open    = useUiStore(s => s.quickCaptureOpen)
  const setOpen = useUiStore(s => s.setQuickCaptureOpen)

  const createPrivate   = usePrivateNotesStore(s => s.create)
  const updatePrivate   = usePrivateNotesStore(s => s.update)
  const createNoteEntry = useNotesModuleStore(s => s.createEntry)
  const upsertTodo      = useTodosStore(s => s.upsert)
  const workspaceId     = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const userId          = useAuthStore(s => s.user?.id) ?? ''
  const accounts        = useAccountsStore(s => s.accounts)

  const [customer,    setCustomer]    = useState<Account | null>(null)
  const [atQuery,     setAtQuery]     = useState<string | null>(null)
  const [captureMode, setCaptureMode] = useState<CaptureMode>('note')

  const suggestions = useMemo(() => {
    if (atQuery === null) return []
    const q = atQuery.toLowerCase()
    return accounts.filter(a => a.name.toLowerCase().includes(q)).slice(0, 6)
  }, [atQuery, accounts])

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: '@ Kunde · ! Aufgabe · !! Dringend' }),
    ],
    editorProps: {
      attributes: {
        style: 'outline:none; min-height:80px; font-size:15px; line-height:1.65; color:var(--fg); font-family:inherit;',
      },
    },
    onUpdate: ({ editor: ed }) => {
      const rawText = ed.getText()

      // Mode detection
      setCaptureMode(detectMode(rawText))

      // @ customer detection
      const { from } = ed.state.selection
      const before = ed.state.doc.textBetween(0, from, '\n', '\n')
      const match = /@([^\s@]*)$/.exec(before)
      setAtQuery(match ? match[1] : null)
    },
  })

  // Reset + focus on open
  useEffect(() => {
    if (open) {
      setCustomer(null)
      setAtQuery(null)
      setCaptureMode('note')
      setTimeout(() => { editor?.commands.clearContent(); editor?.commands.focus() }, 60)
    }
  }, [open, editor])

  // Esc: close dropdown first, then modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (atQuery !== null) { setAtQuery(null); return }
      setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setOpen, atQuery])

  const pickCustomer = (acc: Account) => {
    if (!editor) return
    const { from } = editor.state.selection
    const len = (atQuery?.length ?? 0) + 1
    editor.chain().focus().deleteRange({ from: from - len, to: from }).run()
    setCustomer(acc)
    setAtQuery(null)
  }

  const save = () => {
    if (!editor) return
    const rawText = editor.getText().trim()
    if (!rawText || rawText === '!' || rawText === '!!') { setOpen(false); return }

    if (captureMode !== 'note') {
      const stripped = rawText.replace(/^!!\s*/, '').replace(/^!\s*/, '').trim()
      if (!stripped) { setOpen(false); return }
      const title = stripped.split('\n')[0].slice(0, 120)
      upsertTodo({
        title,
        customerId: customer?.id,
        priority:   captureMode === 'task-urgent' ? 'p1' : 'p2',
        bucket:     'today',
        source:     'manual',
      }).catch(() => {})
    } else {
      const html  = editor.getHTML()
      const text  = rawText
      const title = text.split('\n')[0].slice(0, 60) ||
        new Date().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      if (customer) {
        createNoteEntry({ workspaceId, accountId: customer.id, title, content: html, createdBy: userId }).catch(() => {})
      } else {
        const id = createPrivate()
        updatePrivate(id, { title, body: html })
      }
    }
    setOpen(false)
  }

  // ── Mode visuals ──────────────────────────────────────────────────────────
  const modeLabel = captureMode === 'task-urgent' ? 'DRINGEND'
    : captureMode === 'task' ? 'AUFGABE'
    : null
  const modeColor = captureMode === 'task-urgent' ? 'var(--danger)'
    : captureMode === 'task' ? 'var(--warn)'
    : 'var(--accent)'
  const modeBg = captureMode === 'task-urgent' ? 'oklch(72% 0.18 25 / 0.12)'
    : captureMode === 'task' ? 'oklch(82% 0.16 70 / 0.12)'
    : 'transparent'
  const btnLabel = captureMode !== 'note' ? 'Als Aufgabe' : 'Speichern'
  const footerTarget = captureMode !== 'note'
    ? `→ Aufgaben${customer ? ` · ${customer.name}` : ''} · ⌘↵`
    : `${customer ? `→ ${customer.name} · Notizen` : '→ Privat'} · ⌘↵`

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="qc-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          />

          {/* Modal */}
          <motion.div
            key="qc-modal"
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -12 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ position: 'fixed', top: '28%', left: '50%', transform: 'translateX(-50%)', zIndex: 1001, width: '100%', maxWidth: 500, padding: '0 16px' }}
          >
            <div
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save() } }}
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)', overflow: 'hidden' }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px 0' }}>
                <Sparkles size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', color: 'var(--accent)' }}>
                  QUICK CAPTURE
                </span>

                {/* Mode chip */}
                <AnimatePresence mode="wait">
                  {modeLabel && (
                    <motion.div
                      key={captureMode}
                      initial={{ opacity: 0, scale: 0.85, x: -4 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.85, x: -4 }}
                      transition={{ duration: 0.12 }}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, background: modeBg, border: `1px solid ${modeColor}`, borderRadius: 99, padding: '2px 7px' }}
                    >
                      <CheckSquare size={9} style={{ color: modeColor }} />
                      <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', color: modeColor, letterSpacing: '0.08em' }}>
                        {modeLabel}
                      </span>
                    </motion.div>
                  )}
                  {!modeLabel && (
                    <motion.div
                      key="note"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.1 }}
                      style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <FileText size={9} style={{ color: 'var(--fg-dim)' }} />
                      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--fg-dim)', letterSpacing: '0.08em' }}>NOTIZ</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div style={{ flex: 1 }} />

                {/* Customer chip */}
                {customer && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--accent-soft)', border: '1px solid var(--accent)', borderRadius: 99, padding: '3px 8px 3px 6px' }}
                  >
                    <AtSign size={10} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>{customer.name}</span>
                    <button type="button" onClick={() => setCustomer(null)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', display: 'flex', padding: 0, marginLeft: 2 }}>
                      <X size={9} />
                    </button>
                  </motion.div>
                )}

                <button type="button" onClick={() => setOpen(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', display: 'flex', padding: 2 }}>
                  <X size={14} />
                </button>
              </div>

              {/* TipTap editor */}
              <div style={{ padding: '10px 16px 8px' }}>
                <EditorContent editor={editor} />
              </div>

              {/* @ Customer dropdown */}
              <AnimatePresence>
                {atQuery !== null && suggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.1 }}
                    style={{ margin: '0 12px 8px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}
                  >
                    {suggestions.map(acc => (
                      <button
                        key={acc.id}
                        type="button"
                        onMouseDown={e => { e.preventDefault(); pickCustomer(acc) }}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left', transition: 'background 100ms' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-3)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                      >
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)' }}>
                            {acc.name.slice(0, 1).toUpperCase()}
                          </span>
                        </div>
                        <span style={{ fontSize: 13, color: 'var(--fg)' }}>{acc.name}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Footer */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px 14px', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
                  {footerTarget}
                </span>
                <button
                  type="button"
                  onClick={save}
                  style={{
                    padding: '7px 16px', borderRadius: 99, border: 'none',
                    background: modeColor,
                    color: 'var(--accent-ink)',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    boxShadow: `0 0 12px ${modeColor.replace(')', ' / 0.4)').replace('var(', 'var(')}`,
                    transition: 'all 150ms',
                  }}
                >
                  {btnLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
