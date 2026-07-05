/** Zahlenformat für PDF-Positionszeilen — dasselbe de-DE wie die Summen. */
const eur = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qty = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export function fmtEurPdf(n: number): string { return `${eur.format(n)} €` }
export function fmtQty(n: number): string { return qty.format(n) }
