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
    { id: 'company', icon: '🏢', label: 'Mein Unternehmen', sub: 'Einstellungen', action: () => navigate('settings') },
  ]

  const filteredActions = staticActions.filter(
    a => !q || a.label.toLowerCase().includes(q) || a.sub.toLowerCase().includes(q)
  )

  const filteredCustomers = customers.filter(c =>
    !q || c.name.toLowerCase().includes(q) || (c.company ?? '').toLowerCase().includes(q)
  ).slice(0, 7)

  const customerItems: Item[] = filteredCustomers.map(c => ({
    id: c.id,
    icon: c.priority === 'high' ? '🔴' : '👤',
    label: c.name,
    sub: c.company ?? c.status,
    action: () => { setSelectedCustomer(c.id); onClose() },
  }))

  // Flat list used for keyboard navigation only — group headers are NOT included
  const allItems: Item[] = [
    ...filteredActions,
    ...customerItems,
  ]

  const clampedIdx = Math.min(idx, allItems.length - 1)

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, allItems.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && allItems[clampedIdx]) { allItems[clampedIdx].action() }
  }

  // Render a group of items with a header, offsetting flat indices so keyboard nav stays correct
  const renderGroup = (label: string, items: Item[], offset: number) => {
    if (items.length === 0) return null
    return (
      <>
        <div className="command-group">{label}</div>
        {items.map((item, i) => {
          const flatIdx = offset + i
          return (
            <button
              key={item.id}
              onClick={item.action}
              onMouseEnter={() => setIdx(flatIdx)}
              className="command-item"
              data-selected={String(flatIdx === clampedIdx)}
            >
              <span className="text-base w-6 text-center flex-shrink-0">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--text)] truncate">{item.label}</p>
                <p className="text-xs text-[var(--text2)] truncate">{item.sub}</p>
              </div>
              <kbd className="cmd-kbd">↵</kbd>
            </button>
          )
        })}
      </>
    )
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="command-backdrop"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.15 }}
            className="command glass"
            onClick={e => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              value={query}
              onChange={e => { setQuery(e.target.value); setIdx(0) }}
              onKeyDown={handleKey}
              placeholder="Kunden suchen oder Aktion…"
              className="command-input"
            />

            <div className="command-list">
              {allItems.length === 0 && (
                <p className="text-sm text-[var(--text2)] text-center py-6">Keine Ergebnisse</p>
              )}
              {renderGroup('Springen zu', customerItems, filteredActions.length)}
              {renderGroup('Aktionen', filteredActions, 0)}
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
