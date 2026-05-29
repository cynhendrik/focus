import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckSquare, FileText, FolderOpen } from 'lucide-react'

import { WorkflowPane } from './WorkflowPane'
import { DateienPane } from './DateienPane'
import { NotizPane } from './NotizPane'
import { useTodosStore } from '@/store/todos.store'
import { useFilesStore } from '@/store/files.store'
import { useNotebookStore } from '@/store/notebook.store'

type Sub = 'tasks' | 'notizen' | 'dateien'

const TABS: { id: Sub; label: string; icon: typeof CheckSquare }[] = [
  { id: 'tasks',   label: 'Tasks',    icon: CheckSquare },
  { id: 'notizen', label: 'Notizen',  icon: FileText    },
  { id: 'dateien', label: 'Dateien',  icon: FolderOpen  },
]

interface Props { customerId: string }

/**
 * "Arbeiten" — der Schreibtisch zum Kunden. Tasks + Notizen + Dateien
 * unter einem Hut. Sub-Tab-Auswahl wird in localStorage gemerkt.
 */
export function ArbeitenPane({ customerId }: Props) {
  const STORAGE_KEY = `cynera:customer:${customerId}:arbeiten-sub-v1`
  const [sub, setSub] = useState<Sub>(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY) as Sub | null
      if (v === 'tasks' || v === 'notizen' || v === 'dateien') return v
    } catch {}
    return 'tasks'
  })

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, sub) } catch {}
  }, [sub, STORAGE_KEY])

  // Badge counts
  const taskCount = useTodosStore(s => s.todos.filter(t => t.status !== 'done').length)
  const noteCount = useNotebookStore(s => s.entries.filter(n => n.customerId === customerId).length)
  const fileCount = useFilesStore(s => s.files.length)
  const badgeFor: Record<Sub, number> = {
    tasks:   taskCount,
    notizen: noteCount,
    dateien: fileCount,
  }

  // Sliding pill
  const tabsRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState({ left: 0, width: 0, opacity: 0 })
  useLayoutEffect(() => {
    const el = tabsRef.current
    if (!el) return
    const active = el.querySelector(`[data-active="true"]`) as HTMLElement | null
    if (!active) return
    const r  = active.getBoundingClientRect()
    const pr = el.getBoundingClientRect()
    setIndicator({ left: r.left - pr.left, width: r.width, opacity: 1 })
  }, [sub])

  const renderPane = () => {
    switch (sub) {
      case 'tasks':   return <WorkflowPane customerId={customerId} />
      case 'notizen': return <NotizPane customerId={customerId} />
      case 'dateien': return <DateienPane customerId={customerId} />
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tab bar */}
      <div style={{ padding: '0 4px 12px', display: 'flex' }}>
        <div className="tabs glass" ref={tabsRef}>
          <motion.div
            className="tab-indicator"
            initial={false}
            animate={{ left: indicator.left, width: indicator.width, opacity: indicator.opacity }}
            transition={{ type: 'spring', stiffness: 480, damping: 38, mass: 0.7 }}
          />
          {TABS.map(t => {
            const Icon = t.icon
            const count = badgeFor[t.id]
            return (
              <div
                key={t.id}
                className="tab"
                data-active={String(sub === t.id)}
                onClick={() => setSub(t.id)}
              >
                <Icon size={12} />
                {t.label}
                {count > 0 && (
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9.5,
                    padding: '1px 5px', borderRadius: 99,
                    background: sub === t.id ? 'oklch(0% 0 0 / 0.18)' : 'oklch(100% 0 0 / 0.08)',
                    color: sub === t.id ? 'inherit' : 'var(--fg-muted)',
                    fontWeight: 600,
                  }}>
                    {count}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={sub}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.2, 0.7, 0.1, 1] }}
          >
            {renderPane()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

