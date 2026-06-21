/** Freitext-Einheit → UN/ECE-Rec-20-Code (EN16931 BT-130). Fallback C62 (Stück). */
const MAP: Record<string, string> = {
  std: 'HUR', st  : 'HUR', stunde: 'HUR', stunden: 'HUR', h: 'HUR', hr: 'HUR', 'h.': 'HUR',
  tag: 'DAY', tage: 'DAY', day: 'DAY', days: 'DAY',
  stk: 'C62', 'stk.': 'C62', stueck: 'C62', 'stück': 'C62', stueckk: 'C62', x: 'C62',
  pauschale: 'C62', psch: 'C62', pcs: 'C62', piece: 'C62', stueckzahl: 'C62',
  km: 'KMT', kilometer: 'KMT',
  monat: 'MON', monate: 'MON', month: 'MON',
  pkt: 'C62', stk_: 'C62',
}

export function unitCode(unit?: string | null): string {
  if (!unit) return 'C62'
  const key = unit.trim().toLowerCase()
  if (!key) return 'C62'
  return MAP[key] ?? 'C62'
}
