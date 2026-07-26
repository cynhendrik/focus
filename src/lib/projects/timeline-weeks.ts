const MONTH_LABELS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

export interface TimelineWeek {
  start: Date
  kw: number
  monthLabel: string | null
}

function mondayOf(d: Date): Date {
  const c = new Date(d)
  const dow = (c.getDay() + 6) % 7
  c.setDate(c.getDate() - dow)
  c.setHours(0, 0, 0, 0)
  return c
}

/** ISO-8601-Wochennummer (KW), gleiche Formel wie CalendarRoute.tsx#kwOf. */
export function kwOf(d: Date): number {
  const tmp = new Date(d)
  tmp.setHours(0, 0, 0, 0)
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7))
  const jan4 = new Date(tmp.getFullYear(), 0, 4)
  return 1 + Math.round(((tmp.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7)
}

/** Rollierendes Fenster um `today`: weeksBack Wochen zurück, weeksForward voraus. */
export function rollingWeeks(today: Date, weeksBack = 4, weeksForward = 10): TimelineWeek[] {
  const firstMonday = mondayOf(today)
  firstMonday.setDate(firstMonday.getDate() - (weeksBack - 1) * 7)
  const totalWeeks = weeksBack + weeksForward
  const weeks: TimelineWeek[] = []
  let prevMonth = -1
  for (let i = 0; i < totalWeeks; i++) {
    const start = new Date(firstMonday)
    start.setDate(start.getDate() + i * 7)
    const month = start.getMonth()
    weeks.push({ start, kw: kwOf(start), monthLabel: month !== prevMonth ? MONTH_LABELS[month] : null })
    prevMonth = month
  }
  return weeks
}

/** Fraktionaler Wochen-Index (0 = Start der ersten Woche) für ein YYYY-MM-DD-Datum,
 * oder null wenn außerhalb des sichtbaren Fensters. */
export function dateToTimelineOffset(dateIso: string, weeks: TimelineWeek[]): number | null {
  if (!weeks.length) return null
  const d = new Date(`${dateIso}T00:00:00Z`)
  const s = weeks[0].start
  const startUtc = Date.UTC(s.getFullYear(), s.getMonth(), s.getDate())
  const diffWeeks = (d.getTime() - startUtc) / (7 * 86400000)
  if (diffWeeks < 0 || diffWeeks > weeks.length) return null
  return diffWeeks
}
