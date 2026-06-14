import { useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { RefreshCw, Sparkles } from 'lucide-react'
import { useHeuteQueue } from '@/hooks/useHeuteQueue'
import { HeuteTile } from '@/components/heute/HeuteTile'
import { useTodosStore } from '@/store/todos.store'
import { useCrmStore } from '@/store/crm.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useToastStore } from '@/store/toast.store'
import { CrmService } from '@/services/crm.service'
import type { UpsertTodoPayload } from '@/types/todo.types'

function HeuteEmpty({ onReshuffle }: { onReshuffle: () => void }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 24px var(--accent-glow)',
      }}>
        <Sparkles size={20} style={{ color: 'var(--accent-ink)' }} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)' }}>Alles erledigt.</div>
        <div style={{ fontSize: 13, color: 'var(--fg-dim)', marginTop: 6 }}>Kein weiterer Handlungsbedarf für heute.</div>
      </div>
      <button type="button" onClick={onReshuffle}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, marginTop: 8,
          padding: '9px 18px', borderRadius: 99,
          border: '1px solid var(--border)', background: 'var(--surface-2)',
          color: 'var(--fg-dim)', fontSize: 12, cursor: 'pointer',
        }}>
        <RefreshCw size={12} /> Neu prüfen
      </button>
    </div>
  )
}

function HeuteLoading() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <div style={{
        width: 10, height: 10, borderRadius: '50%',
        background: 'var(--accent)', animation: 'pulse 1.2s ease-in-out infinite',
        boxShadow: '0 0 12px var(--accent-glow)',
      }} />
      <span style={{ fontSize: 12, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
        KORA priorisiert…
      </span>
      <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }`}</style>
    </div>
  )
}

export function HeuteRoute() {
  const { items, loading, reshuffle } = useHeuteQueue()
  const [index, setIndex]     = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)

  const upsertTodo  = useTodosStore(s => s.upsert)
  const allTodos    = useTodosStore(s => s.allTodos)
  const allFollowUps = useCrmStore(s => s.allFollowUps)
  const reloadCrm   = useCrmStore(s => s.loadAll)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId)
  const showToast   = useToastStore(s => s.show)

  const advance = useCallback((dir: 1 | -1 = 1) => {
    setDirection(dir)
    setIndex(prev => prev + 1)
  }, [])

  const handleDone = useCallback(async () => {
    const item = items[index]
    if (!item) return

    try {
      if (item.type === 'todo' || item.type === 'mail_reply' || item.type === 'followup') {
        const todo = allTodos.find(t => t.id === item.id)
        if (todo) {
          const payload: UpsertTodoPayload = {
            id: todo.id,
            title: todo.title,
            status: 'done',
            bucket: 'done',
            priority: todo.priority,
            customerId: todo.customerId,
            actionType: todo.actionType,
            sourceRef: todo.sourceRef,
            notes: todo.notes,
            checklist: todo.checklist,
            tags: todo.tags,
          }
          await upsertTodo(payload)
        }
      } else if (item.type === 'lead_followup') {
        const fu = allFollowUps.find(f => f.id === item.id)
        if (fu) {
          await CrmService.upsert({
            id: fu.id, customerId: fu.customerId, title: fu.title,
            dueDate: fu.dueDate, status: 'erledigt', priority: fu.priority,
          })
          if (workspaceId) await reloadCrm(workspaceId)
        }
      }
      // invoice_reminder: sending the mail is the action — no status change needed here
    } catch {
      showToast({ message: 'Konnte Aufgabe nicht als erledigt markieren.', variant: 'error' })
    }

    advance(1)
  }, [items, index, allTodos, allFollowUps, workspaceId, upsertTodo, reloadCrm, advance, showToast])

  const handleSkip = useCallback(() => {
    advance(1)
  }, [advance])

  const currentItem = items[index]
  const isDone = !loading && index >= items.length

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--bg)',
    }}>
      {/* Topbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 32px', borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.02em' }}>Heute</div>
          <div style={{ fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            {loading ? 'KORA priorisiert…' : `${items.length} AUFGABEN · ${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' })}`}
          </div>
        </div>
        <button type="button" onClick={() => { setIndex(0); reshuffle() }}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
            borderRadius: 99, border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: loading ? 'var(--fg-dim)' : 'var(--fg)', fontSize: 11, cursor: loading ? 'not-allowed' : 'pointer',
          }}>
          <RefreshCw size={11} /> Neu sortieren
        </button>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loading && <HeuteLoading />}

        {!loading && isDone && <HeuteEmpty onReshuffle={() => { setIndex(0); reshuffle() }} />}

        {!loading && !isDone && currentItem && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '32px', display: 'flex', flexDirection: 'column' }}>
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={`${currentItem.id}-${index}`}
                custom={direction}
                initial={{ opacity: 0, x: direction * 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -40 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
              >
                <HeuteTile
                  item={currentItem}
                  index={index}
                  total={items.length}
                  onDone={handleDone}
                  onSkip={handleSkip}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
