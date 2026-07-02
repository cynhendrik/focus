import { describe, it, expect, beforeEach } from 'vitest'
import { recordDismissal, shouldOfferSuppression, RULE_LABEL } from './dismiss-learning'
import { useStapelSettingsStore } from '@/store/stapel-settings.store'

describe('dismiss-learning', () => {
  beforeEach(() => useStapelSettingsStore.setState({ suppressedRuleIds: [], dismissCounts: {} }))

  it('zaehlt Verwerfen pro Regel und bietet beim 3. Mal die Abschaltung an', () => {
    expect(recordDismissal('followup-due')).toBe(1)
    expect(recordDismissal('followup-due')).toBe(2)
    const third = recordDismissal('followup-due')
    expect(third).toBe(3)
    expect(shouldOfferSuppression(third)).toBe(true)
    expect(shouldOfferSuppression(2)).toBe(false)
    expect(shouldOfferSuppression(4)).toBe(false) // nur genau beim 3. Mal fragen
  })

  it('suppressRule landet in suppressedRuleIds', () => {
    useStapelSettingsStore.getState().suppressRule('aufgabe-heute')
    expect(useStapelSettingsStore.getState().suppressedRuleIds).toContain('aufgabe-heute')
  })

  it('jede Regel hat ein deutsches Label', () => {
    for (const id of ['mahnung-l0', 'mahnung-l1', 'mahnung-l2', 'followup-due', 'rechnung-vorschlag', 'aufgabe-heute']) {
      expect(RULE_LABEL[id]).toBeTruthy()
    }
  })
})
