/**
 * Deterministische Mahn-/Begleittexte — ersetzen den KORA-Call im Mahnwesen.
 * Mahnungen SOLLEN standardisiert klingen: rechtlich sicherer, konsistent, kostenlos.
 * Individuell wird per „Mit KORA umformulieren"-Knopf (Karte → Anpassen).
 */
export interface MahnungInput {
  customerName: string
  invoiceNumber: string
  base: number
  fee: number
  total: number
  daysOverdue: number
  level: number        // 0=Zahlungserinnerung, 1=1. Mahnung, 2=2. Mahnung
  newDeadline: string  // 'YYYY-MM-DD'
}

const LEVEL_LABEL = ['Zahlungserinnerung', '1. Mahnung', '2. Mahnung']
export function levelLabel(level: number): string { return LEVEL_LABEL[level] ?? '2. Mahnung' }

export function fmtEur(n: number): string {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' €'
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

export function mahnungSubject(i: MahnungInput): string {
  return `${levelLabel(i.level)} · Rechnung ${i.invoiceNumber} · zu zahlen ${fmtEur(i.total)}`
}

export function mahnungBody(i: MahnungInput): string {
  const anrede = `Sehr geehrte Damen und Herren,`
  const betrag = i.fee > 0
    ? `Rechnungsbetrag ${fmtEur(i.base)} + Mahngebühr ${fmtEur(i.fee)} = zu zahlen ${fmtEur(i.total)}.`
    : `Der offene Betrag beläuft sich auf ${fmtEur(i.total)}.`
  const frist = `Bitte gleichen Sie den Betrag bis zum ${fmtDate(i.newDeadline)} aus.`
  const gruss = `Mit freundlichen Grüßen`

  if (i.level === 0) {
    return `${anrede}\n\nsicher ist es Ihrer Aufmerksamkeit entgangen: Die Rechnung ${i.invoiceNumber} (${i.customerName}) ist seit ${i.daysOverdue} Tagen fällig. ${betrag}\n\n${frist} Sollte sich die Zahlung mit diesem Schreiben überschnitten haben, betrachten Sie es bitte als gegenstandslos.\n\n${gruss}`
  }
  if (i.level === 1) {
    return `${anrede}\n\ntrotz unserer Zahlungserinnerung ist die Rechnung ${i.invoiceNumber} weiterhin offen (${i.daysOverdue} Tage überfällig). ${betrag}\n\n${frist}\n\n${gruss}`
  }
  return `${anrede}\n\ndie Rechnung ${i.invoiceNumber} ist trotz Erinnerung und 1. Mahnung weiterhin offen (${i.daysOverdue} Tage überfällig). ${betrag}\n\n${frist} Sollte bis dahin kein Zahlungseingang erfolgen, behalten wir uns weitere Schritte vor.\n\n${gruss}`
}

export function begleitmailBody(i: { customerName: string; invoiceNumber: string; total: number; dueDate: string }): string {
  return `Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie die Rechnung ${i.invoiceNumber} über ${fmtEur(i.total)}. Zahlbar bis zum ${fmtDate(i.dueDate)}.\n\nBei Fragen melden Sie sich gern.\n\nMit freundlichen Grüßen`
}
