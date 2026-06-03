import { useTodosStore } from '@/store/todos.store'
import type { Todo } from '@/types/todo.types'

interface Props {
  stack: Todo[]         // customer-scoped stack from useFocusStack(customerId)
  currentIndex: number
  completedToday: number
  totalToday: number
}

function getTypeMeta(t: Todo): { icon: string; label: string; color: string; bg: string } {
  if (t.actionType === 'send_reminder')
    return { icon: '€', label: 'Mahnung',   color: 'var(--danger)', bg: 'oklch(72% 0.18 25 / 0.1)' }
  if (t.actionType === 'create_invoice')
    return { icon: '€', label: 'Rechnung',  color: 'var(--danger)', bg: 'oklch(72% 0.18 25 / 0.1)' }
  if (t.actionType === 'reply_mail')
    return { icon: '✉', label: 'Antwort',   color: 'var(--info)',         bg: 'oklch(78% 0.13 235 / 0.1)' }
  if (t.actionType === 'followup')
    return { icon: '↻', label: 'Follow-Up', color: 'var(--warn)',         bg: 'oklch(82% 0.16 70 / 0.1)' }
  if (t.actionType === 'write_offer')
    return { icon: '↗', label: 'Angebot',   color: 'var(--accent)',       bg: 'var(--accent-soft)' }
  if (t.actionType === 'call')
    return { icon: '📞', label: 'Anruf',    color: 'var(--fg-muted)',     bg: 'oklch(50% 0 0 / 0.08)' }
  return    { icon: '✓', label: 'Task',      color: 'var(--fg-dim)',       bg: 'oklch(50% 0 0 / 0.07)' }
}

const isSimpleTask = (t: Todo) =>
  !t.actionType || t.actionType === 'call'

export function FocusBatchSidebar({ stack, currentIndex, completedToday, totalToday }: Props) {
  const complete = useTodosStore(s => s.complete)

  const openCount = stack.filter(t => t.status !== 'done').length

  return (
    <div style={{
      width: 260, flexShrink: 0,
      borderLeft: '1px solid var(--border)',
      background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 16px 10px',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)' }}>Alle Tasks</span>
        <span style={{
          fontSize: 9, fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: 99,
          background: 'oklch(82% 0.2 125 / 0.1)', color: 'var(--accent)',
        }}>
          {stack.length - openCount} / {stack.length}
        </span>
      </div>

      {/* Today stats strip */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {[
          { val: completedToday, lbl: 'Erledigt', color: 'var(--accent)' },
          { val: openCount,      lbl: 'Offen',    color: 'var(--fg)' },
          { val: totalToday,     lbl: 'Heute',    color: 'var(--info)' },
        ].map(({ val, lbl, color }, i) => (
          <div key={lbl} style={{
            flex: 1, padding: '10px 0', textAlign: 'center',
            borderRight: i < 2 ? '1px solid var(--border)' : undefined,
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color }}>{val}</div>
            <div style={{
              fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'var(--fg-dim)', marginTop: 1,
            }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* Task tiles */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {stack.map((t, idx) => {
          const meta      = getTypeMeta(t)
          const isCurrent = idx === currentIndex
          const isDone    = t.status === 'done'

          return (
            <div
              key={t.id}
              style={{
                background: isCurrent ? 'oklch(82% 0.2 125 / 0.03)' : 'var(--surface-2)',
                border: `1px solid ${isCurrent ? 'oklch(82% 0.2 125 / 0.35)' : 'var(--border)'}`,
                boxShadow: isCurrent ? '0 0 0 1px oklch(82% 0.2 125 / 0.12)' : undefined,
                borderRadius: 11, padding: '11px 13px',
                opacity: isDone ? 0.35 : 1,
                display: 'flex', flexDirection: 'column', gap: 7,
              }}
            >
              {/* Type row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 7,
                  background: meta.bg, color: meta.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, flexShrink: 0,
                }}>
                  {meta.icon}
                </div>
                <span style={{
                  fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
                  textTransform: 'uppercase', fontWeight: 700, color: meta.color,
                }}>
                  {meta.label}
                </span>
                {isCurrent && (
                  <div style={{
                    marginLeft: 'auto', width: 6, height: 6, borderRadius: 99,
                    background: 'var(--accent)', boxShadow: '0 0 4px var(--accent)',
                  }} />
                )}
                {isDone && (
                  <span style={{ marginLeft: 'auto', fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>✓</span>
                )}
              </div>

              {/* Title */}
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.3 }}>{t.title}</div>

              {/* Quick-complete for simple tasks that are not the current one and not done */}
              {isSimpleTask(t) && !isDone && !isCurrent && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => { complete(t.id).catch(() => {}) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '3px 9px', borderRadius: 99, border: 'none',
                      background: 'oklch(50% 0 0 / 0.08)',
                      color: 'var(--fg-dim)', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Sofort ✓
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
