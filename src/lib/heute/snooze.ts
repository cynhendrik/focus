/**
 * Rechnungs-Snooze für die HEUTE-Queue (lokal persistiert).
 *
 * Warum: Eine überfällige Rechnung stand jeden Tag wieder auf #1 — `handleDone`
 * hatte keinen Zweig dafür, und „Überspringen" merkte sich nichts. Nach dem
 * Senden einer Erinnerung (oder bewusstem „ruhen lassen") legt sie sich für N
 * Tage schlafen, statt zum Broken-Record zu werden. Bewusst localStorage (kein
 * Datenmodell-Umbau) — reiner UI-Zustand, lokal-first.
 */
const KEY = 'heute:invoice-snooze' // { [invoiceId]: snoozeUntilIso }

function read(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {}
  } catch {
    return {}
  }
}

function write(map: Record<string, string>): void {
  try { localStorage.setItem(KEY, JSON.stringify(map)) } catch { /* Storage voll/blockiert → ignorieren */ }
}

/** Legt eine Rechnung für `days` Tage in HEUTE schlafen. */
export function snoozeInvoice(id: string, days: number, nowMs: number = Date.now()): void {
  const until = new Date(nowMs + days * 86_400_000).toISOString()
  write({ ...read(), [id]: until })
}

/** IDs der aktuell schlafenden Rechnungen. Abgelaufene werden ignoriert und
 *  nebenbei aus dem Speicher bereinigt. */
export function snoozedInvoiceIds(nowMs: number = Date.now()): Set<string> {
  const map = read()
  const live: Record<string, string> = {}
  const ids = new Set<string>()
  for (const [id, until] of Object.entries(map)) {
    if (new Date(until).getTime() > nowMs) { live[id] = until; ids.add(id) }
  }
  if (Object.keys(live).length !== Object.keys(map).length) write(live)
  return ids
}
