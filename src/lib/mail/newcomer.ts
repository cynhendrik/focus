import type { EmailHeader, IgnoredSender } from '@/types/mail.types'

/**
 * Klassifizierung für die Newcomer-Ansicht: welche Mail ist ein möglicher Lead,
 * welche gehört einem bekannten Lead/Kunden, welche ist System-Rauschen?
 */
export interface NewcomerGroups {
  /** Absender ist ein bekannter Lead. */
  leadMails: EmailHeader[]
  /** Unbekannte Absender — mögliche Leads. */
  candidates: EmailHeader[]
  /** Automatisch aussortiert: noreply-, Newsletter- und System-Absender. */
  autoSorted: EmailHeader[]
  /** Vom Nutzer ausgeblendet (not_a_lead — einzeln oder per Ignorierliste). */
  hidden: EmailHeader[]
}

// Lokalteile, die auf automatische Absender hindeuten. Domain zählt bewusst
// nicht: anna@newsletter-agentur.de ist ein Mensch.
const AUTO_LOCALPART = /(^|[-_.+])(no[-_]?reply|do[-_]?not[-_]?reply|notifications?|newsletters?|mailer-daemon|postmaster|bounces?|alerts?)([-_.+]|$)/i

/** Heuristik: Absender ist eine Maschine (noreply, Newsletter, Systemdienst). */
export function isAutoSender(addr: string): boolean {
  const at = addr.indexOf('@')
  if (at <= 0) return false
  return AUTO_LOCALPART.test(addr.slice(0, at))
}

/** Prüft, ob eine Adresse von einem Ignorier-Eintrag abgedeckt ist (Adresse exakt, Domain inkl. Subdomains). */
export function matchesIgnoredSender(addr: string, entries: IgnoredSender[]): boolean {
  const a = addr.trim().toLowerCase()
  const at = a.indexOf('@')
  const domain = at >= 0 ? a.slice(at + 1) : ''
  return entries.some(e =>
    e.scope === 'address'
      ? a === e.pattern
      : domain === e.pattern || domain.endsWith('.' + e.pattern),
  )
}

export function classifyMails(
  emails: EmailHeader[],
  leadEmails: Set<string>,
  customerEmails: Set<string>,
): NewcomerGroups {
  const groups: NewcomerGroups = { leadMails: [], candidates: [], autoSorted: [], hidden: [] }
  const sorted = [...emails].sort((a, b) => b.sentAt.localeCompare(a.sentAt))
  for (const mail of sorted) {
    const addr = mail.fromAddr.toLowerCase()
    if (addr && leadEmails.has(addr)) groups.leadMails.push(mail)
    else if (addr && customerEmails.has(addr)) continue // gehört ins CRM, nicht in die Akquise
    else if (mail.notALead) groups.hidden.push(mail)
    else if (isAutoSender(addr)) groups.autoSorted.push(mail)
    else groups.candidates.push(mail)
  }
  return groups
}
