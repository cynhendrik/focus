import { useEffect } from 'react'
import { useFinanceStore } from '@/store/finance.store'
import { useNotificationSettingsStore } from '@/store/notification-settings.store'
import { newlyOverdueInvoices } from '@/lib/notifications/money-events'
import { notify } from '@/services/notify.service'

function eur(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}

/**
 * Meldet Rechnungen, die überfällig geworden sind — je Rechnung genau einmal.
 * Mehr als 3 auf einmal werden gebündelt (kein Notification-Spam nach Urlaub).
 */
export function useMoneyEvents() {
  const invoices = useFinanceStore(s => s.invoices)

  useEffect(() => {
    if (invoices.length === 0) return
    const s = useNotificationSettingsStore.getState()
    const todayIso = new Date().toLocaleDateString('sv')
    const fresh = newlyOverdueInvoices(invoices, s.notifiedOverdueIds, todayIso)
    if (fresh.length === 0) return

    // Erst markieren, dann senden — verhindert Doppel-Meldungen bei Re-Renders.
    s.markOverdueNotified(fresh.map(i => i.id))

    if (fresh.length <= 3) {
      for (const inv of fresh) {
        void notify('money',
          `Rechnung ${inv.number ?? ''} ist überfällig`,
          `${eur(inv.total)} offen. Die Zahlungserinnerung liegt im Mahnwesen bereit.`)
      }
    } else {
      const sum = fresh.reduce((acc, i) => acc + i.total, 0)
      void notify('money',
        `${fresh.length} Rechnungen sind überfällig`,
        `Insgesamt ${eur(sum)} offen. Details im Mahnwesen.`)
    }
  }, [invoices])
}
