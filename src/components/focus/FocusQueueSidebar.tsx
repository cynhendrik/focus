import { useAccountsStore } from '@/store/accounts.store'
import type { Todo } from '@/types/todo.types'
import { Zap } from 'lucide-react'

interface Props {
  stack: Todo[]
  currentIndex: number
}

const ACTION_LABEL: Record<string, string> = {
  send_reminder: 'Erinnerung',
}

export function FocusQueueSidebar({ stack, currentIndex }: Props) {
  const accounts = useAccountsStore(s => s.accounts)
  const upcoming = stack.slice(currentIndex + 1)

  return (
    <div style={{
      width: 272,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      paddingLeft: 24,
      borderLeft: '1px solid var(--border)',
    }}>
      <div style={{
        fontSize: 10,
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--fg-dim)',
        paddingBottom: 10,
      }}>
        Als Nächstes
      </div>

      {upcoming.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--fg-dim)', paddingTop: 8 }}>
          Nichts mehr offen
        </div>
      )}

      {upcoming.map(todo => {
        const account = todo.customerId
          ? accounts.find(a => a.id === todo.customerId)
          : undefined
        const actionLabel = todo.actionType ? ACTION_LABEL[todo.actionType] : undefined

        return (
          <div key={todo.id} style={{
            padding: '10px 12px',
            borderRadius: 10,
            background: 'var(--surface-2)',
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 10,
              color: 'var(--fg-dim)',
            }}>
              {actionLabel && (
                <span style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  color: 'var(--accent)',
                  fontWeight: 600,
                }}>
                  <Zap size={9} />
                  {actionLabel}
                </span>
              )}
              {account && <span>{account.name}</span>}
            </div>
            <div style={{
              fontSize: 13,
              lineHeight: 1.3,
              color: 'var(--fg)',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}>
              {todo.title}
            </div>
          </div>
        )
      })}
    </div>
  )
}
