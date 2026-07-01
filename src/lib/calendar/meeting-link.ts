import type { CalendarEvent } from '@/types/calendar.types'

/** Bekannte Video-Meeting-Anbieter. Nur diese erzeugen einen „Beitreten"-Button —
 *  ein beliebiger Website-Link (z.B. im Ort) soll KEINEN Call vortäuschen. */
const PROVIDERS: { host: RegExp; label: string }[] = [
  { host: /\bzoom\.us/i,                     label: 'Zoom' },
  { host: /\bteams\.(microsoft|live)\.com/i, label: 'Teams' },
  { host: /\bteams\.microsoft\.us/i,         label: 'Teams' },
  { host: /\bmeet\.google\.com/i,            label: 'Meet' },
  { host: /\bwhereby\.com/i,                 label: 'Whereby' },
  { host: /\bwebex\.com/i,                   label: 'Webex' },
  { host: /\bmeet\.jit\.si/i,                label: 'Jitsi' },
  { host: /\bgotomeet(ing)?\.com/i,          label: 'GoTo' },
  { host: /\bmeet\.goto\.com/i,              label: 'GoTo' },
]

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi

export interface MeetingLink { url: string; label: string }

/**
 * Zieht einen Meeting-Link aus Ort + Notiz eines Termins. Gibt den ersten Treffer
 * eines bekannten Anbieters zurück (mit Label), sonst null.
 */
export function extractMeetingLink(ev: Pick<CalendarEvent, 'location' | 'description'>): MeetingLink | null {
  const text = `${ev.location ?? ''}\n${ev.description ?? ''}`
  const urls = text.match(URL_RE)
  if (!urls) return null
  for (const raw of urls) {
    const url = raw.replace(/[.,;]+$/, '') // Satzzeichen am Ende abschneiden
    const p = PROVIDERS.find(pr => pr.host.test(url))
    if (p) return { url, label: p.label }
  }
  return null
}
