import { describe, it, expect } from 'vitest'
import { insertMentionMarker, stripResolvedMentions } from './plain-input-mention'

describe('insertMentionMarker', () => {
  it('inserts the marker at the end of the text', () => {
    const result = insertMentionMarker('Hallo @kla', 6, 10, '@Klara')
    expect(result).toEqual({ value: 'Hallo @Klara ', cursor: 13 })
  })

  it('inserts the marker mid-text and preserves trailing content', () => {
    const result = insertMentionMarker('@kl, bitte', 0, 3, '@Klara')
    expect(result).toEqual({ value: '@Klara , bitte', cursor: 7 })
  })
})

describe('stripResolvedMentions', () => {
  it('strips a single resolved mention and returns its id', () => {
    const result = stripResolvedMentions('Website Texte pruefen @Klara', [{ marker: '@Klara', id: 'm1' }])
    expect(result).toEqual({ cleanTitle: 'Website Texte pruefen', assigneeId: 'm1' })
  })

  it('returns the title unchanged when there are no mentions', () => {
    const result = stripResolvedMentions('Rechnung schreiben', [])
    expect(result).toEqual({ cleanTitle: 'Rechnung schreiben', assigneeId: undefined })
  })

  it('leaves an unresolved @-token untouched as literal text', () => {
    const result = stripResolvedMentions('Kontakt @Someone anrufen', [])
    expect(result).toEqual({ cleanTitle: 'Kontakt @Someone anrufen', assigneeId: undefined })
  })

  it('the last matching mention wins when multiple are present', () => {
    const result = stripResolvedMentions('@Klara @Tom Zusammenfassung', [
      { marker: '@Klara', id: 'm1' },
      { marker: '@Tom', id: 'm2' },
    ])
    expect(result).toEqual({ cleanTitle: 'Zusammenfassung', assigneeId: 'm2' })
  })
})
