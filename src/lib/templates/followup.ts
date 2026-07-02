/** Deterministische Follow-up-Texte für den Standardfall — KORA nur auf Klick. */
export function followupSubject(i: { title: string }): string {
  return `Kurze Rückfrage: ${i.title}`
}

export function followupBody(i: { contactName: string; title: string; daysOverdue: number }): string {
  const seit = i.daysOverdue > 0 ? ` vor ${i.daysOverdue} ${i.daysOverdue === 1 ? 'Tag' : 'Tagen'}` : ''
  return `Hallo ${i.contactName},\n\nich wollte kurz nachfassen zu „${i.title}"${seit ? ` — wir hatten${seit} zuletzt dazu gesprochen` : ''}. Gibt es dazu schon Neuigkeiten von Ihrer Seite?\n\nIch freue mich auf Ihre Rückmeldung.\n\nViele Grüße`
}
