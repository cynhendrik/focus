import { describe, it, expect } from 'vitest'
import { checkErechnungReadiness } from './erechnung-readiness'
import type { CompanyProfile } from '@/types/company.types'
import type { Account } from '@/types/account.types'

const fullProfile: CompanyProfile = { name: 'Muster GmbH', address: 'Hauptstr. 1, 10115 Berlin', taxId: 'DE123', iban: 'DE89...' }
const fullAccount = { name: 'Kunde AG', street: 'Weg 2', zip: '20095', city: 'Hamburg' } as Account

describe('checkErechnungReadiness', () => {
  it('vollständige Daten → keine fehlenden Felder', () => {
    expect(checkErechnungReadiness(fullProfile, fullAccount)).toEqual([])
  })
  it('fehlende USt-IdNr UND StNr → meldet Steuer-ID', () => {
    const missing = checkErechnungReadiness({ ...fullProfile, taxId: undefined, steuernummer: undefined }, fullAccount)
    expect(missing.join(' ')).toMatch(/USt-IdNr|Steuernummer/)
  })
  it('StNr statt USt-IdNr reicht', () => {
    expect(checkErechnungReadiness({ ...fullProfile, taxId: undefined, steuernummer: '30/123' }, fullAccount)).toEqual([])
  })
  it('fehlende IBAN und fehlender Kundenname werden gemeldet', () => {
    const missing = checkErechnungReadiness({ ...fullProfile, iban: undefined }, { ...fullAccount, name: '' } as Account)
    expect(missing.join(' ')).toMatch(/IBAN/)
    expect(missing.join(' ')).toMatch(/Kunde/)
  })
})
