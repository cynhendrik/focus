/**
 * DIE Follow-up-Konvention: type 'task' + is_follow_up im Payload — das ist,
 * was alle Follow-up-Listen (Mein Tag, Stapel, Pipeline-Filter, Akquise)
 * lesen. type='followup' ist ein Alt-Format des Verlauf-Composers, das in
 * keiner Liste auftauchte; es wird beim Anzeigen weiter erkannt.
 */
export function isFollowUpActivity(a: { type: string; payload?: string }): boolean {
  if (a.type === 'followup') return true
  if (a.type !== 'task') return false
  try { return JSON.parse(a.payload ?? '{}').is_follow_up === true } catch { return false }
}
