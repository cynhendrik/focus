import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AtSign, Sparkles, X } from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { usePrivateNotesStore } from '@/store/private-notes.store'
import { useNotebookStore }     from '@/store/notebook.store'
import { useAccountsStore }     from '@/store/accounts.store'
import { useUiStore }           from '@/store/ui.store'
import type { Account } from '@/types/account.types'

export function QuickCaptureModal() {
  const open    = useUiStore(s => s.quickCaptureOpen)
  const setOpen = useUiStore(s => s.setQuickCaptureOpen)

  const createPrivate = usePrivateNotesStore(s => s.create)
  const updatePrivate = usePrivateNotesStore(s => s.update)

  const books       = useNotebookStore(s => s.books)
  const addBook     = useNotebookStore(s => s.addBook)
  const addEntry    = useNotebookStore(s => s.addEntry)
  const updateEntry = useNotebookStore(s => s.updateEntry)

  const accounts = useAccountsStore(s => s.accounts)

  const [customer, setCustomer] = useState<Account | null>(null)
  const [atQuery, setAtQuery]   = useState<string | null>(null)

  // Customer search dropdown
  const suggestions = useMemo(() => {
    if (atQuery === null) return []
    const q = atQuery.toLowerCase()
    return accounts.filter(a => a.name.toLowerCase().includes(q)).slice(0, 6)
  }, [atQuery, accounts])

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Gedanke, Idee, Erinnerung… · @ für Kunde' }),
    ],
    editorProps: {
      attributes: {
        style: 'outline:none; min-height:80px; font-size:15px; line-height:1.65; color:var(--fg); font-family:inherit;',
      },
    },
    onUpdate: ({ editor: ed }) => {
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
    const len = (atQuery?.length ?? 0) + 1 // +1 for @
    editor.chain().focus().deleteRange({ from: from - len, to: from }).run()
    setCustomer(acc)
    setAtQuery(null)
  }

  const save = () => {
    if (!editor) return
    const html = editor.getHTML()
    const text = editor.getText().trim()
    if (!text) { setOpen(false); return }

    const title = text.split('\n')[0].slice(0, 60) ||
      new Date().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

    if (customer) {
      const existingBook = books.find(b => b.customerId === customer.id)
      const bookId = existingBook ? existingBook.id : addBook(customer.id, 'Allgemein')
      const entryId = addEntry(bookId, customer.id, title)
      updateEntry(entryId, { content: html })
    } else {
      const id = createPrivate()
      updatePrivate(id, { title, body: html })
    }

    setOpen(false)
  }

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
                <span style={{ flex: 1, fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', color: 'var(--accent)' }}>
                  QUICK CAPTURE
                </span>

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
                  {customer ? `→ ${customer.name} · Notizen` : '→ Privat'} · ⌘↵
                </span>
                <button
                  type="button"
                  onClick={save}
                  style={{ padding: '7px 16px', borderRadius: 99, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 0 12px var(--accent-glow)', transition: 'all 150ms' }}
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
