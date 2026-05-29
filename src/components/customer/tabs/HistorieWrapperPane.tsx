import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Clock, MessageSquare, Activity as ActivityIcon } from 'lucide-react'

import { HistoriePane } from './HistoriePane'
import { KommunikationPane } from './KommunikationPane'
import { AktivitaetenPane } from './AktivitaetenPane'

type Sub = 'timeline' | 'kommunikation' | 'aktivitaeten'

const TABS: { id: Sub; label: string; icon: typeof Clock }[] = [
  { id: 'timeline',      label: 'Timeline',       icon: Clock         },
  { id: 'kommunikation', label: 'Kommunikation', icon: MessageSquare },
  { id: 'aktivitaeten',  label: 'Aktivitäten',    icon: ActivityIcon  },
]

interface Props { customerId: string }

/**
 * "Historie" — alles was bisher mit dem Kunden gelaufen ist:
 * Mail-Timeline + Aktivitäten + chronologische Übersicht.
 */
export function HistorieWrapperPane({ customerId }: Props) {
  const STORAGE_KEY = `cynera:customer:${customerId}:historie-sub-v1`
  const [sub, setSub] = useState<Sub>(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY) as Sub | null
      if (v === 'timeline' || v === 'kommunikation' || v === 'aktivitaeten') return v
    } catch {}
    return 'timeline'
  })

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, sub) } catch {}
  }, [sub, STORAGE_KEY])

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
      case 'timeline':      return <HistoriePane customerId={customerId} />
      case 'kommunikation': return <KommunikationPane customerId={customerId} />
      case 'aktivitaeten':  return <AktivitaetenPane customerId={customerId} />
    }
  }

  return (
    <div className="flex flex-col h-full">
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
            return (
              <div
                key={t.id}
                className="tab"
                data-active={String(sub === t.id)}
                onClick={() => setSub(t.id)}
              >
                <Icon size={12} />
                {t.label}
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
