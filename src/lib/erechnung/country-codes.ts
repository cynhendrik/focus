/** Freitext-Land → ISO-3166-1 alpha-2 (EN16931 BT-40/BT-55). Fallback DE. */
const NAMES: Record<string, string> = {
  deutschland: 'DE', germany: 'DE',
  österreich: 'AT', oesterreich: 'AT', austria: 'AT',
  schweiz: 'CH', switzerland: 'CH',
  frankreich: 'FR', france: 'FR',
  niederlande: 'NL', netherlands: 'NL',
  italien: 'IT', italy: 'IT',
  spanien: 'ES', spain: 'ES',
  belgien: 'BE', belgium: 'BE',
  polen: 'PL', poland: 'PL',
  luxemburg: 'LU', luxembourg: 'LU',
}
const ISO2 = /^[A-Za-z]{2}$/

export function countryCode(country?: string | null): string {
  if (!country) return 'DE'
  const raw = country.trim()
  if (!raw) return 'DE'
  if (ISO2.test(raw)) return raw.toUpperCase()
  return NAMES[raw.toLowerCase()] ?? 'DE'
}
