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

  // Dashboard berechnet „Umsatz diesen Monat" aus bezahlten Rechnungen mit date >= Monatsanfang.
  // Mit fixen Mai-Daten wäre das Ende Juni leer → relativ zu heute datieren.
  it('hat eine bezahlte Rechnung im aktuellen Monat (Dashboard-Umsatz > 0)', () => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const paidThisMonth = tourInvoices.filter(
      i => i.status === 'paid' && new Date(i.date) >= startOfMonth && new Date(i.date) <= now,
    )
    expect(paidThisMonth.length).toBeGreaterThan(0)
  })

  it('hat mindestens eine heute fällige Aufgabe (Tagesplan/Heute-fällig gefüllt)', () => {
    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(tourTodos.some(t => t.dueDate === today || t.scheduledAt?.slice(0, 10) === today)).toBe(true)
  })
})
