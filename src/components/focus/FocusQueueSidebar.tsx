import { useAccountsStore } from '@/store/accounts.store'
import { useFinanceStore } from '@/store/finance.store'
import type { Todo } from '@/types/todo.types'

interface Props {
  stack: Todo[]
  currentIndex: number
}

function itemBorderColor(todo: Todo): string {
  if (todo.source === 'finance') return 'oklch(60% 0.2 25)'
  return 'oklch(55% 0 0 / 0.25)'
}

function itemIconBg(todo: Todo): string {
  if (todo.source === 'finance') return 'oklch(60% 0.2 25 / 0.15)'
  return 'oklch(50% 0 0 / 0.1)'
}

function itemIconColor(todo: Todo): string {
  if (todo.source === 'finance') return 'oklch(60% 0.2 25)'
  return 'var(--fg-dim)'
}

function itemIconLabel(todo: Todo): string {
  if (todo.source === 'finance') return '€'
  return '✓'
}

export function FocusQueueSidebar({ stack, currentIndex }: Props) {
  const accounts = useAccountsStore(s => s.accounts)
  const invoices = useFinanceStore(s => s.invoices)
  const upcoming = stack.slice(currentIndex + 1)

  return (
    <div style={{
      width: 300,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      paddingLeft: 24,
      borderLeft: '1px solid var(--border)',
      maxHeight: '100%',
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 2,
        paddingBottom: 14,
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--fg-dim)',
        }}>
          Als Nächstes
        </span>
        <span style={{
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          color: 'var(--fg-muted)',
          background: 'var(--surface-3)',
          padding: '2px 7px',
          borderRadius: 99,
        }}>
          {upcoming.length}
        </span>
      </div>

      {/* Empty state */}
      {upcoming.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--fg-dim)', paddingTop: 4 }}>
          Nichts mehr offen
        </div>
      )}

      {/* Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {upcoming.map(todo => {
          const account = todo.customerId
            ? accounts.find(a => a.id === todo.customerId)
            : undefined
          const invoice = todo.sourceRef
            ? invoices.find(i => i.id === todo.sourceRef)
            : undefined
          const amount = invoice
            ? `${(invoice.total / 1000).toFixed(1)}k €`
            : undefined

          return (
            <div key={todo.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              borderRadius: 10,
              borderLeft: `3px solid ${itemBorderColor(todo)}`,
              background: 'transparent',
            }}>
              {/* Icon circle */}
              <div style={{
                width: 28,
                height: 28,
                borderRadius: 99,
                background: itemIconBg(todo),
                color: itemIconColor(todo),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
              }}>
                {itemIconLabel(todo)}
              </div>

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12,
                  color: 'var(--fg)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  lineHeight: 1.3,
                }}>
                  {todo.title}
                </div>
                {account && (
                  <div style={{
                    fontSize: 11,
                    color: 'var(--fg-dim)',
                    marginTop: 1,
                  }}>
                    {account.name}
                  </div>
                )}
              </div>

              {/* Amount */}
              {amount && (
                <span style={{
                  fontSize: 11,
                  color: 'var(--fg-muted)',
                  fontFamily: 'var(--font-mono)',
                  flexShrink: 0,
                }}>
                  {amount}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
