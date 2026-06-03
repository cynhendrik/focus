import { useMemo } from 'react'
import { useAccountsStore } from '@/store/accounts.store'
import { useUiStore } from '@/store/ui.store'
import { groupFocusByCustomer } from '@/hooks/useFocusStack'
import type { Todo } from '@/types/todo.types'
import type { FocusUrgency } from '@/hooks/useFocusStack'

interface Props {
  stack: Todo[]
  onSelectCustomer: (customerId: string) => void
}

const URGENCY_BADGE: Record<FocusUrgency, { label: string; color: string; bg: string }> = {
  critical: { label: 'DRINGEND',   color: 'oklch(72% 0.18 25)',  bg: 'oklch(72% 0.18 25 / 0.1)' },
  high:     { label: 'HOCH',       color: 'oklch(72% 0.18 25)',  bg: 'oklch(72% 0.18 25 / 0.08)' },
  normal:   { label: 'NORMAL',     color: 'var(--fg-dim)',        bg: 'oklch(50% 0 0 / 0.06)' },
  low:      { label: 'NIEDRIG',    color: 'var(--fg-dim)',        bg: 'oklch(50% 0 0 / 0.04)' },
}

const ACTION_ICON: Record<string, string> = {
  send_reminder: '€',
  create_invoice: '€',
  followup: '↻',
  reply_mail: '✉',
  write_offer: '↗',
  call: '📞',
}

function getTaskColor(t: Todo): string {
  if (t.actionType === 'send_reminder' || t.actionType === 'create_invoice') return 'oklch(72% 0.18 25)'
  if (t.actionType === 'followup' || t.actionType === 'reply_mail') return 'var(--info)'
  if (t.actionType === 'write_offer') return 'var(--accent)'
  if (t.priority === 'p1') return 'oklch(72% 0.18 25)'
  return 'var(--fg-dim)'
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase()
}

export function FocusCustomerSelect({ stack, onSelectCustomer }: Props) {
  const accounts   = useAccountsStore(s => s.accounts)
  const setAppView = useUiStore(s => s.setAppView)

  const groups = useMemo(() => groupFocusByCustomer(stack, accounts), [stack, accounts])

  const totalTasks     = stack.length
  const totalCustomers = groups.length

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{
        height: 48, flexShrink: 0,
        display: 'flex', alignItems: 'center',
        padding: '0 28px', gap: 20,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--accent)', boxShadow: '0 0 5px var(--accent)' }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--fg)', letterSpacing: '-0.01em' }}>Focus</span>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg-dim)', letterSpacing: '0.03em' }}>
            Wen arbeitest du heute ab?
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{
          fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--fg-dim)',
          background: 'var(--surface-2)', padding: '3px 10px', borderRadius: 99,
        }}>
          {totalCustomers} Kunden · {totalTasks} Tasks
        </span>
        <button
          type="button"
          onClick={() => setAppView('dashboard')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--fg)', fontSize: 11, cursor: 'pointer',
          }}
        >
          Schließen
          <span style={{
            fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--fg-dim)',
            background: 'var(--surface-2)', padding: '1px 4px', borderRadius: 3,
          }}>ESC</span>
        </button>
      </div>

      {/* Grid */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '28px 36px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
        gap: 14,
        alignContent: 'start',
      }}>
        {groups.map(group => {
          const badge  = URGENCY_BADGE[group.urgency]
          const custId = group.customerId ?? 'none'
          const inits  = initials(group.customerName)

          return (
            <div
              key={custId}
              onClick={() => onSelectCustomer(custId)}
              style={{
                background: 'var(--surface-2)',
                border: `1px solid ${group.urgency === 'critical' || group.urgency === 'high' ? 'oklch(72% 0.18 25 / 0.2)' : 'var(--border)'}`,
                borderRadius: 16, overflow: 'hidden',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column',
                transition: 'all 200ms',
              }}
            >
              {/* Header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '16px 18px 12px',
                borderBottom: '1px solid var(--border)',
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 99,
                  background: 'linear-gradient(135deg, var(--accent), oklch(60% 0.25 280))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 12, color: 'var(--accent-ink)', flexShrink: 0,
                }}>
                  {inits}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.01em' }}>
                    {group.customerName}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>
                    {group.tasks.length} {group.tasks.length === 1 ? 'Task' : 'Tasks'}
                  </div>
                </div>
                <div style={{
                  fontSize: 24, fontWeight: 700,
                  color: badge.color,
                  letterSpacing: '-0.02em', flexShrink: 0,
                }}>
                  {group.tasks.length}
                </div>
              </div>

              {/* Task list */}
              <div style={{ display: 'flex', flexDirection: 'column', padding: '8px 0', flex: 1 }}>
                {group.tasks.slice(0, 4).map((t, i) => {
                  const color = getTaskColor(t)
                  const icon  = t.actionType ? (ACTION_ICON[t.actionType] ?? '✓') : '✓'
                  return (
                    <div key={t.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '7px 18px',
                      borderBottom: i < Math.min(group.tasks.length, 4) - 1 ? '1px solid oklch(50% 0 0 / 0.06)' : undefined,
                    }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                        background: `${color}18`, color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 700,
                      }}>
                        {icon}
                      </div>
                      <div style={{
                        flex: 1, minWidth: 0,
                        fontSize: 11, color: 'var(--fg-muted)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {t.title}
                      </div>
                    </div>
                  )
                })}
                {group.tasks.length > 4 && (
                  <div style={{ fontSize: 10, color: 'var(--fg-dim)', padding: '6px 18px' }}>
                    +{group.tasks.length - 4} weitere…
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 18px',
                borderTop: '1px solid var(--border)',
                background: 'oklch(50% 0 0 / 0.03)',
              }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: badge.color, background: badge.bg,
                  padding: '2px 8px', borderRadius: 99,
                }}>
                  {badge.label}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  Session starten →
                </span>
              </div>
            </div>
          )
        })}

        {/* Empty state */}
        {groups.length === 0 && (
          <div style={{
            gridColumn: '1 / -1',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '80px 0', gap: 16,
          }}>
            <div style={{ fontSize: 48 }}>🙌</div>
            <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>Alles erledigt!</p>
            <p style={{ fontSize: 14, color: 'var(--fg-dim)', margin: 0 }}>Keine offenen Aufgaben für heute.</p>
          </div>
        )}
      </div>
    </div>
  )
}
