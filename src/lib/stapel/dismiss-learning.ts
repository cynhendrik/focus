/**
 * Regel-Lernen per Code, nicht per KI: Wer dieselbe Kartenart dreimal verwirft,
 * bekommt genau einmal die Frage, ob sie künftig nicht mehr vorbereitet werden soll.
 */
import { useStapelSettingsStore } from '@/store/stapel-settings.store'

export const RULE_LABEL: Record<string, string> = {
  'mahnung-l0': 'Zahlungserinnerungen',
  'mahnung-l1': '1. Mahnungen',
  'mahnung-l2': '2. Mahnungen',
  'followup-due': 'Follow-up-Vorschläge',
  'rechnung-vorschlag': 'Rechnungsvorschläge',
  'aufgabe-heute': 'Heutige Aufgaben',
}

/** Erhöht den Zähler und gibt den neuen Stand zurück. */
export function recordDismissal(ruleId: string): number {
  return useStapelSettingsStore.getState().bumpDismiss(ruleId)
}

/** Genau beim 3. Verwerfen fragen — nicht davor, nicht danach erneut. */
export function shouldOfferSuppression(count: number): boolean {
  return count === 3
}
