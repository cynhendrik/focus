import type { TodoActionType } from '@/types/todo.types'

/**
 * Multilingual keyword map for actionType detection at TODO CREATION time.
 * The detected type is stored in the DB — never inferred from title text at render time.
 * Adding a new language = add keywords here. Nothing else changes.
 */
const ACTION_KEYWORDS: Partial<Record<TodoActionType, string[]>> = {
  create_invoice: [
    // DE
    'rechnung', 'faktura', 'fakturier', 'abrechnung', 'rechnungsstellung',
    // EN
    'invoice', 'bill', 'billing',
    // FR
    'facture', 'facturer', 'facturation',
    // IT
    'fattura', 'fatturare',
    // ES
    'factura', 'facturar',
    // NL
    'factuur',
  ],
  write_offer: [
    // DE
    'angebot', 'kostenvoranschlag', 'kva',
    // EN
    'offer', 'quote', 'quotation', 'proposal',
    // FR
    'devis', 'offre', 'proposition',
    // IT
    'offerta', 'preventivo',
    // ES
    'presupuesto', 'oferta', 'cotización',
  ],
  send_reminder: [
    // DE
    'mahnung', 'zahlungserinnerung', 'zahlungsmahnung',
    // EN
    'payment reminder', 'dunning',
    // FR
    'rappel de paiement', 'relance',
    // IT
    'sollecito',
    // ES
    'recordatorio de pago', 'morosidad',
  ],
  followup: [
    // DE
    'nachfassen', 'nachhalten', 'wiedervorlage', 'follow-up', 'followup',
    // EN
    'follow up', 'check in', 'check-in',
    // FR
    'relancer', 'faire un suivi', 'suivi',
    // IT
    'follow-up', 'ricontattare',
    // ES
    'seguimiento', 'dar seguimiento',
  ],
  reply_mail: [
    // DE
    'mail beantworten', 'e-mail beantworten', 'antworten auf', 'antwort schreiben',
    // EN
    'reply to', 'respond to', 'answer email',
    // FR
    'répondre à', 'répondre au mail',
    // IT
    'rispondere a',
    // ES
    'responder a',
  ],
  call: [
    // DE
    'anrufen', 'telefonieren', 'telefonat', 'rückruf', 'zurückrufen',
    // EN
    'call', 'phone call', 'ring',
    // FR
    'appeler', 'rappeler', 'coup de fil',
    // IT
    'chiamare', 'telefonare',
    // ES
    'llamar', 'llamada',
  ],
}

export function detectActionType(title: string): TodoActionType | null {
  const lower = title.toLowerCase()
  for (const [type, keywords] of Object.entries(ACTION_KEYWORDS)) {
    if (keywords?.some(kw => lower.includes(kw))) {
      return type as TodoActionType
    }
  }
  return null
}

export const ACTION_TYPE_LABELS: Partial<Record<TodoActionType, string>> = {
  create_invoice: '📄 Rechnung',
  write_offer:    '📋 Angebot',
  send_reminder:  '📬 Mahnung',
  followup:       '🔁 Follow-Up',
  reply_mail:     '✉️ Mail antworten',
  call:           '📞 Anruf',
}
