/**
 * Deutsche IBAN-Utilities + BLZ→Bankname-Lookup (offline, Bundesbank-Daten).
 * Datenbasis: Bundesbank BLZ-Verzeichnis, gültig 08.06.2026–06.09.2026
 */

/** Kompakte IBAN (ohne Leerzeichen, uppercase). */
export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase()
}

/**
 * BLZ aus deutscher IBAN — null wenn keine plausible DE-IBAN
 * (Länge 22, DE-Prefix, Prüfziffer+BLZ+Konto rein numerisch).
 * Beispiel: 'DE89 3704 0044 0532 0130 00' → '37040044'
 */
export function blzFromIban(raw: string): string | null {
  const iban = normalizeIban(raw)
  // DE + 2 Prüfziffern + 8 BLZ + 10 Konto = 22 Zeichen
  if (iban.length !== 22) return null
  if (!iban.startsWith('DE')) return null
  // Chars 3-22 (nach DE) müssen rein numerisch sein
  const digits = iban.slice(2)
  if (!/^\d{20}$/.test(digits)) return null
  // BLZ = Zeichen 5-12 der kompakten IBAN (1-indexed), d.h. nach DE+2 Prüfziffern
  return digits.slice(2, 10) // chars 5-12 → index 2-9 within digits
}

let _cache: Record<string, string> | null = null

/**
 * Bankname zur IBAN — null wenn unbekannt oder nicht-DE.
 * Lädt die BLZ-Map lazy (einmal, dann gecacht).
 */
export async function bankNameFromIban(raw: string): Promise<string | null> {
  const blz = blzFromIban(raw)
  if (!blz) return null

  if (!_cache) {
    const mod = await import('@/assets/blz/blz-map.json')
    _cache = (mod.default ?? mod) as Record<string, string>
  }

  return _cache[blz] ?? null
}

/** Cache zurücksetzen (nur für Tests). */
export function _resetBlzCache(): void {
  _cache = null
}

/** Cache direkt befüllen (nur für Tests — umgeht den JSON-Import). */
export function _setBlzCache(map: Record<string, string>): void {
  _cache = map
}
