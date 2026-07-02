/**
 * Macht aus rohen Fehlern (Rust-Strings, Error-Objekte, Supabase-Fehler) eine
 * lesbare deutsche Meldung: benannter Kontext zuerst, technisches Detail in Klammern.
 * Ersetzt das Muster `setError(String(e))`, das Nutzern rohe DB-Fehler zeigte.
 */
const TECH_PREFIXES = [/^invoke error:?\s*/i, /^error:?\s*/i]
const MAX_DETAIL = 180

export function humanizeError(err: unknown, fallback: string): string {
  let raw = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  raw = raw.trim()
  for (const p of TECH_PREFIXES) raw = raw.replace(p, '')
  if (!raw || raw === '[object Object]' || raw === 'null' || raw === 'undefined') return fallback
  if (raw.length > MAX_DETAIL) raw = raw.slice(0, MAX_DETAIL - 1) + '…'
  return `${fallback} (${raw})`
}
