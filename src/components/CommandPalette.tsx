import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import type { AppView } from '@/store/ui.store'

interface Props {
  open: boolean
  onClose: () => void
}

interface Item {
  id: string
  icon: string
  label: string
  sub: string
  action: () => void
}

export function CommandPalette({ open, onClose }: Props) {
  const customers = useCustomersStore(s => s.customers)
  const setSelectedCustomer = useUiStore(s => s.setSelectedCustomer)
  const setAppView = useUiStore(s => s.setAppView)
  const [query, setQuery] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) { setQuery(''); setIdx(0); setTimeout(() => inputRef.current?.focus(), 50) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const q = query.toLowerCase()

  const navigate = (view: AppView) => { setAppView(view); onClose() }

  const staticActions: Item[] = [
    { id: 'mail', icon: '✉', label: 'E-Mails', sub: 'Zum Mail-Client wechseln', action: () => navigate('mail') },
    { id: 'company', icon: '🏢', label: 'Mein Unternehmen', sub: 'Einstellungen', action: () => navigate('company') },
  ]

  const filteredActions = staticActions.filter(
    a => !q || a.label.toLowerCase().includes(q) || a.sub.toLowerCase().includes(q)
  )

  const filteredCustomers = customers.filter(c =>
    !q || c.name.toLowerCase().includes(q) || (c.company ?? '').toLowerCase().includes(q)
  ).slice(0, 7)

  const allItems: Item[] = [
    ...filteredActions,
    ...filteredCustomers.map(c => ({
      id: c.id,
      icon: c.priority === 'high' ? '🔴' : '👤',
      label: c.name,
      sub: c.company ?? c.status,
      action: () => { setSelectedCustomer(c.id); onClose() },
    })),
  ]

  const clampedIdx = Math.min(idx, allItems.length - 1)

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, allItems.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && allItems[clampedIdx]) { allItems[clampedIdx].action() }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 bg-black/60 flex items-start justify-center pt-[15vh] z-50"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.15 }}
            className="w-[560px] bg-[var(--bg)] rounded-2xl shadow-2xl overflow-hidden border border-[var(--border)]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
              <span className="text-[var(--text2)]">⌘</span>
              <input
                ref={inputRef}
                value={query}
                onChange={e => { setQuery(e.target.value); setIdx(0) }}
                onKeyDown={handleKey}
                placeholder="Kunden suchen oder Aktion…"
                className="flex-1 bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--text2)] focus:outline-none"
              />
              <kbd className="text-[10px] text-[var(--text2)] border border-[var(--border)] px-1.5 py-0.5 rounded">ESC</kbd>
            </div>

            <div className="max-h-80 overflow-y-auto py-1">
              {allItems.length === 0 && (
                <p className="text-sm text-[var(--text2)] text-center py-6">Keine Ergebnisse</p>
              )}
              {allItems.map((item, i) => (
                <button
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setIdx(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                    ${i === clampedIdx ? 'bg-primary/10' : 'hover:bg-[var(--bg1)]'}`}
                >
                  <span className="text-base w-6 text-center flex-shrink-0">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text)] truncate">{item.label}</p>
                    <p className="text-xs text-[var(--text2)] truncate">{item.sub}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="px-4 py-2 border-t border-[var(--border)] flex gap-4 text-[10px] text-[var(--text2)]">
              <span>↑↓ navigieren</span>
              <span>↵ öffnen</span>
              <span>ESC schließen</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
