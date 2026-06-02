import { useAccountsStore } from '@/store/accounts.store'
import { useFinanceStore } from '@/store/finance.store'
import type { Todo } from '@/types/todo.types'

interface Props {
  stack: Todo[]
  currentIndex: number
}

interface ItemMeta {
  borderColor: string
  iconBg: string
  iconColor: string
  label: string
}

function getItemMeta(todo: Todo): ItemMeta {
  if (todo.actionType === 'create_invoice' || (todo.source === 'finance' && todo.sourceRef)) {
    return {
      borderColor: 'oklch(60% 0.2 25)',
      iconBg: 'oklch(60% 0.2 25 / 0.15)',
      iconColor: 'oklch(60% 0.2 25)',
      label: '€',
    }
  }
  if (todo.actionType === 'send_reminder') {
    return {
      borderColor: 'oklch(65% 0.18 50)',
      iconBg: 'oklch(65% 0.18 50 / 0.15)',
      iconColor: 'oklch(65% 0.18 50)',
      label: '↑',
    }
  }
  const title = todo.title.toLowerCase()
  if (title.includes('mail') || title.includes('e-mail') || title.includes('antwort') || title.includes('re:')) {
    return {
      borderColor: 'oklch(60% 0.15 240)',
      iconBg: 'oklch(60% 0.15 240 / 0.15)',
      iconColor: 'oklch(60% 0.15 240)',
      label: '✉',
    }
  }
  if (title.includes('deal') || title.includes('angebot') || title.includes('pitch')) {
    return {
      borderColor: 'oklch(65% 0.18 140)',
      iconBg: 'oklch(65% 0.18 140 / 0.15)',
      iconColor: 'oklch(65% 0.18 140)',
      label: '↗',
    }
  }
  return {
    borderColor: 'oklch(55% 0 0 / 0.3)',
    iconBg: 'oklch(50% 0 0 / 0.1)',
    iconColor: 'var(--fg-dim)',
    label: '✓',
  }
}

export function FocusQueueSidebar({ stack, currentIndex }: Props) {
  const accounts = useAccountsStore(s => s.accounts)
  const invoices = useFinanceStore(s => s.invoices)
  const upcoming = stack.slice(currentIndex + 1)

  return (
    <div style={{
      width: 340,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      borderLeft: '1px solid var(--border)',
      maxHeight: '100%',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '20px 20px 14px 20px',
        flexShrink: 0,
        borderBottom: upcoming.length > 0 ? '1px solid var(--border)' : undefined,
      }}>
        <span style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--fg)',
          letterSpacing: '-0.01em',
        }}>
          Als Nächstes
        </span>
        <span style={{
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: 'var(--fg-muted)',
          background: 'var(--surface-3)',
          padding: '2px 8px',
          borderRadius: 99,
          minWidth: 24,
          textAlign: 'center',
        }}>
          {upcoming.length}
        </span>
      </div>

      {/* Items */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px 0',
      }}>
        {upcoming.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--fg-dim)', padding: '12px 20px' }}>
            Nichts mehr offen
          </div>
        )}

        {upcoming.map(todo => {
          const meta = getItemMeta(todo)
          const account = todo.customerId
            ? accounts.find(a => a.id === todo.customerId)
            : undefined
          const invoice = todo.sourceRef
            ? invoices.find(i => i.id === todo.sourceRef)
            : undefined
          const amount = invoice
            ? `${Math.round(invoice.total / 1000)}k €`
            : undefined

          return (
            <div key={todo.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 16px 9px 17px',
              borderLeft: `3px solid ${meta.borderColor}`,
              marginLeft: 0,
              marginBottom: 1,
            }}>
              {/* Icon circle */}
              <div style={{
                width: 30,
                height: 30,
                borderRadius: 99,
                background: meta.iconBg,
                color: meta.iconColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
              }}>
                {meta.label}
              </div>

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12,
                  fontWeight: 500,
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
                    marginTop: 2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {account.name}
                    {todo.dueDate && (
                      <span style={{ opacity: 0.7 }}>
                        {' · '}
                        {new Date(todo.dueDate).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })}
                      </span>
                    )}
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
                  marginLeft: 4,
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
