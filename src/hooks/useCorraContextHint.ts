import { useMemo } from 'react'
import { useFinanceStore } from '@/store/finance.store'
import { useDealsStore } from '@/store/deals.store'
import { useActivitiesStore } from '@/store/activities.store'
import { generateCorraContextHint } from '@/lib/ai/corra'
import type { CorraHintTaskKind } from '@/lib/ai/corra'

export function useCorraContextHint(
  customerId: string | undefined,
  customerName: string,
  taskKind: CorraHintTaskKind,
  invoiceId?: string,
): string {
  const invoices   = useFinanceStore(s => s.invoices)
  const allDeals   = useDealsStore(s => s.deals)
  const activities = useActivitiesStore(s => s.activities)

  return useMemo(() => {
    if (!customerId) return ''

    // Average payment days based on paid invoices for this account
    const paidInvoices = invoices.filter(
      i => i.accountId === customerId && i.status === 'paid' && !!i.dueDate && !!i.updatedAt,
    )
    // TODO: replace updatedAt with paidAt when the field exists on Invoice
    let avgPaymentDays: number | undefined
    if (paidInvoices.length > 0) {
      const daysArr = paidInvoices.map(i => {
        const due  = new Date(i.dueDate).getTime()
        const paid = new Date(i.updatedAt).getTime()
        return Math.max(0, Math.floor((paid - due) / 86_400_000))
      })
      avgPaymentDays = Math.round(daysArr.reduce((a, b) => a + b, 0) / daysArr.length)
    }

    // Days overdue for a specific invoice
    let daysOverdue: number | undefined
    if (invoiceId) {
      const inv = invoices.find(i => i.id === invoiceId)
      if (inv?.dueDate) {
        daysOverdue = Math.max(0, Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86_400_000))
      }
    }

    // Days since last customer activity (Activity links via accountId)
    const customerActivities = activities.filter(a => a.accountId === customerId)
    let lastContactDays: number | undefined
    if (customerActivities.length > 0) {
      const latest = customerActivities
        .map(a => new Date(a.updatedAt).getTime())
        .sort((a, b) => b - a)[0]
      lastContactDays = Math.max(0, Math.floor((Date.now() - latest) / 86_400_000))
    }

    // Open deal with value (Deal links via accountId only — no customerId field on Deal)
    const openDeal = allDeals.find(
      d => d.accountId === customerId && d.value,
    )

    return generateCorraContextHint({
      customerName,
      taskKind,
      avgPaymentDays,
      daysOverdue,
      lastContactDays,
      openDealValue: openDeal?.value,
      openDealTitle: openDeal?.title,
    })
  }, [customerId, customerName, taskKind, invoiceId, invoices, allDeals, activities])
}
