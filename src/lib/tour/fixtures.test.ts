import { describe, it, expect } from 'vitest'
import { tourCustomers, tourAccounts, tourTodos, tourInvoices, tourKpis, tourLeads, tourActivities, TOUR_CUSTOMER_ID } from './fixtures'

describe('tour fixtures', () => {
  it('alle IDs sind tour-präfixiert (nichts kollidiert mit echten Daten)', () => {
    const ids = [...tourCustomers, ...tourAccounts, ...tourTodos, ...tourInvoices, ...tourLeads, ...tourActivities].map(x => x.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.every(id => id.startsWith('tour-'))).toBe(true)
  })
  it('enthält eine überfällige Rechnung (Mahnwesen leuchtet)', () => {
    expect(tourInvoices.some(i => i.status === 'overdue')).toBe(true)
  })
  it('enthält den geöffneten Beispiel-Kunden + dessen Timeline', () => {
    expect(tourCustomers.some(c => c.id === TOUR_CUSTOMER_ID)).toBe(true)
    expect(tourActivities.some(a => a.customerId === TOUR_CUSTOMER_ID || a.accountId === TOUR_CUSTOMER_ID)).toBe(true)
  })
  it('KPIs zeigen Umsatz + überfällig', () => {
    expect(tourKpis.overdueCount).toBeGreaterThan(0)
    expect(tourKpis.yearRevenue).toBeGreaterThan(0)
  })
})
