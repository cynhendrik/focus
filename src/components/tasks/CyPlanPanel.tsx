// src/components/tasks/CyPlanPanel.tsx
import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X } from 'lucide-react'
import { useTodosStore } from '@/store/todos.store'
import type { TodoPriority } from '@/types/todo.types'

const PRIO_ORDER: Record<TodoPriority, number> = { p1: 0, p2: 1, p3: 2, p4: 3 }

const REASON_BY_PRIO: Record<TodoPriority, string> = {
  p1: 'Dringend — sollte als erstes erledigt werden, blockiert sonst andere Themen.',
  p2: 'Wichtig — heute angesetzt, einfacher Win.',
  p3: 'Routine — wenn Zeit übrig, gut für den Fluss.',
  p4: 'Wenn-Zeit-Slot — niedrige Priorität, kein Stress.',
}

interface Props { open: boolean; onClose: () => void }

export function CyPlanPanel({ open, onClose }: Props) {
  const todos = useTodosStore(s => s.allTodos)
  const todayPlan = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return todos
      .filter(t => t.status !== 'done' && (t.bucket === 'today' || t.scheduledAt?.slice(0, 10) === today))
      .sort((a, b) => {
        const p = PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority]
        if (p !== 0) return p
        return (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? '')
      })
  }, [todos])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60 }}
          />
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            style={{
              position: 'fixed', right: 0, top: 0, bottom: 0,
              width: 'min(440px, 92vw)',
              background: 'var(--bg)',
              borderLeft: '1px solid var(--border)',
              zIndex: 70,
              padding: '28px 26px',
              overflowY: 'auto',
              display: 'flex', flexDirection: 'column', gap: 18,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
                  <Sparkles size={12} /> CY · TAG GEPLANT
                </div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600, margin: '6px 0 0' }}>
                  Dein Fahrplan für heute
                </h2>
              </div>
              <button onClick={onClose} style={{
                width: 32, height: 32, borderRadius: 10,
                background: 'oklch(50% 0 0 / 0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <X size={14} />
              </button>
            </div>

            {todayPlan.length === 0 ? (
              <p style={{ color: 'var(--fg-muted)', fontSize: 13 }}>
                Keine Tasks für heute. Setze welche in Liste oder Board.
              </p>
            ) : todayPlan.map((t, i) => (
              <div key={t.id} style={{
                display: 'flex', flexDirection: 'column', gap: 6,
                padding: '14px 16px',
                background: 'var(--surface-2)',
                borderRadius: 12,
                border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: 99,
                    background: 'var(--accent)', color: 'var(--accent-ink)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700,
                  }}>{i + 1}</span>
                  <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--fg)' }}>{t.title}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5, margin: '4px 0 0', paddingLeft: 30 }}>
                  {REASON_BY_PRIO[t.priority]}
                </p>
              </div>
            ))}

            <button style={{
              marginTop: 'auto',
              padding: '12px 18px', borderRadius: 99,
              background: 'var(--accent)', color: 'var(--accent-ink)',
              fontSize: 13, fontWeight: 700,
              opacity: 0.5, cursor: 'not-allowed',
            }} title="Demnächst">
              Plan übernehmen
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
