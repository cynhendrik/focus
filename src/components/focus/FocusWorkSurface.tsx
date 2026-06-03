// src/components/focus/FocusWorkSurface.tsx
import { useAccountsStore } from '@/store/accounts.store'
import type { Todo } from '@/types/todo.types'
import { FocusHero } from './FocusHero'
import { FocusBodyDefault } from './FocusBodyDefault'
import { FocusBodyReminder } from './FocusBodyReminder'
import { FocusBodyInvoice } from './FocusBodyInvoice'
import { FocusBodyFollowUp } from './FocusBodyFollowUp'
import { FocusCockpitBar } from './FocusCockpitBar'

interface Props {
  todo: Todo
  onComplete: () => Promise<void>
  onSkip: () => void
  onPostpone: () => Promise<void>
}

export function FocusWorkSurface({ todo, onComplete, onSkip, onPostpone }: Props) {
  const accounts     = useAccountsStore(s => s.accounts)
  const account      = todo.customerId ? accounts.find(a => a.id === todo.customerId) : undefined
  const customerName = account?.name ?? (todo.customerId ? 'Kunden-Session' : 'Allgemein')

  const isReminder = todo.actionType === 'send_reminder'
  const isInvoice  = todo.actionType === 'create_invoice'
  const isFollowup = todo.actionType === 'followup' || todo.actionType === 'reply_mail'

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <FocusHero
        todo={todo}
        onComplete={onComplete}
        onSkip={onSkip}
        onPostpone={onPostpone}
      />

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {isReminder ? (
          <FocusBodyReminder todo={todo} onComplete={onComplete} onSkip={onSkip} onPostpone={onPostpone} />
        ) : isInvoice ? (
          <FocusBodyInvoice todo={todo} onComplete={onComplete} onSkip={onSkip} onPostpone={onPostpone} />
        ) : isFollowup ? (
          <FocusBodyFollowUp todo={todo} onComplete={onComplete} onSkip={onSkip} onPostpone={onPostpone} />
        ) : (
          <FocusBodyDefault todo={todo} onComplete={onComplete} />
        )}
      </div>

      <FocusCockpitBar
        customerId={todo.customerId}
        customerName={customerName}
      />
    </div>
  )
}
