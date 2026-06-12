import { useTodosStore } from '@/store/todos.store'
import { useMailStore } from '@/store/mail.store'
import { useCrmStore } from '@/store/crm.store'
import { useFinanceStore } from '@/store/finance.store'
import type { Todo } from '@/types/todo.types'
import type { EmailHeader } from '@/types/mail.types'
import type { FollowUp } from '@/types/crm.types'
import type { Invoice } from '@/types/finance.types'

export function computeOpenCount(
  customerId: string,
  todos: Todo[],
  emails: EmailHeader[],
  followUps: FollowUp[],
  invoices: Invoice[],
): number {
  const todoCount = todos.filter(
    t => t.customerId === customerId && t.status !== 'done',
  ).length

  const mailCount = emails.filter(
    e => e.customerId === customerId && !e.isRead,
  ).length

  const followUpCount = followUps.filter(
    f => f.customerId === customerId,
  ).length

  const invoiceCount = invoices.filter(
    i => i.accountId === customerId && (i.status === 'open' || i.status === 'overdue'),
  ).length

  return todoCount + mailCount + followUpCount + invoiceCount
}

export function useCustomerOpenCount(customerId: string): number {
  const allTodos     = useTodosStore(s => s.allTodos)
  const emails       = useMailStore(s => s.emails)
  const allFollowUps = useCrmStore(s => s.allFollowUps)
  const invoices     = useFinanceStore(s => s.invoices)
  return computeOpenCount(customerId, allTodos, emails, allFollowUps, invoices)
}
