import { describe, it, expect } from 'vitest'
import { tourCustomers, tourAccounts, tourTodos, tourInvoices, tourKpis, tourLeads, tourActivities, tourCalendarEvents, tourEmails, TOUR_CUSTOMER_ID } from './fixtures'

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

  // Dashboard zeigt „Umsatz" default für die LAUFENDE WOCHE (revRange='week') aus bezahlten
  // Rechnungen mit date >= Wochenanfang. Eine Rechnung „vor 4 Tagen" kann in der Vorwoche
  // liegen → paidNow=0 / -100%. Darum muss die bezahlte Demo-Rechnung in die aktuelle Woche fallen.
  it('hat eine bezahlte Rechnung in der laufenden Woche (Dashboard-Umsatz > 0, nicht -100%)', () => {
    const now = new Date()
    const day = now.getDay()
    const sow = new Date(now)
    sow.setHours(0, 0, 0, 0)
    sow.setDate(now.getDate() + (day === 0 ? -6 : 1 - day))   // Montag dieser Woche (wie DashboardRoute)
    // Zeitzonen-sicher: bare date-Strings (YYYY-MM-DD) werden von new Date() als UTC midnight
    // geparst → bei CET/CEST-Offset (UTC+1/+2) liegt 00:00 UTC NACH lokalem Mitternacht,
    // d. h. der Vergleich schlägt zwischen 00:00 und 02:00 fehl. Darum lexikografisch als
    // YYYY-MM-DD-Strings vergleichen – das ist immer korrekt und zonenunabhängig.
    const p = (n: number) => String(n).padStart(2, '0')
    const toYmd = (d: Date) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    const sowDate = toYmd(sow)
    const todayDate = toYmd(now)
    const paidThisWeek = tourInvoices.filter(
      i => i.status === 'paid' && i.date.slice(0, 10) >= sowDate && i.date.slice(0, 10) <= todayDate,
    )
    expect(paidThisWeek.length).toBeGreaterThan(0)
  })

  it('hat mindestens eine heute fällige Aufgabe (Tagesplan/Heute-fällig gefüllt)', () => {
    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(tourTodos.some(t => t.dueDate === today || t.scheduledAt?.slice(0, 10) === today)).toBe(true)
  })

  it('hat einen Kalender-Termin, der gerade läuft (Tagesplan zeigt „Jetzt")', () => {
    const now = new Date()
    expect(tourCalendarEvents.length).toBeGreaterThan(0)
    expect(tourCalendarEvents.some(e => new Date(e.startAt) <= now && new Date(e.endAt) >= now)).toBe(true)
  })

  it('hat Demo-Mails inkl. ungelesener (Inbox-Karte gefüllt)', () => {
    expect(tourEmails.length).toBeGreaterThan(0)
    expect(tourEmails.some(e => !e.isRead)).toBe(true)
  })
})
