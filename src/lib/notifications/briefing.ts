/**
 * Der eine Tages-Satz ("Heute stehen an: ...") - regelbasierter Satz-Baukasten,
 * genutzt vom Dashboard (koraLine) UND vom Morgen-Briefing. Kein KI-Call.
 */
export interface TodayCounts {
  overdueCount: number
  overdueSum: number
  fusDue: number
  tasksDue: number
  eventsToday: number
}

function eur0(n: number): string {
  // Intl.NumberFormat (de-DE) produces a narrow no-break space (U+202F) or
  // non-breaking space (U+00A0) before the currency symbol.
  // Normalise to a plain space so notification strings are predictable.
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    .format(n)
    .replace(/ | /g, ' ')
}

function joinDe(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return parts.slice(0, -1).join(', ') + ' und ' + parts[parts.length - 1]
}

/** Leerer Tag -> leerer String; Aufrufer entscheidet ueber den Fallback-Text. */
export function buildTodayLine(c: TodayCounts): string {
  const parts: string[] = []
  if (c.overdueCount) parts.push(c.overdueCount + ' ' + (c.overdueCount === 1 ? 'Rechnung' : 'Rechnungen') + ' (' + eur0(c.overdueSum) + ')')
  if (c.fusDue) parts.push(c.fusDue + ' Follow-up' + (c.fusDue === 1 ? '' : 's'))
  if (c.tasksDue) parts.push(c.tasksDue + ' To-do' + (c.tasksDue === 1 ? '' : 's'))
  if (c.eventsToday) parts.push(c.eventsToday + ' Termin' + (c.eventsToday === 1 ? '' : 'e'))
  return parts.length ? 'Heute stehen an: ' + joinDe(parts) + '.' : ''
}
