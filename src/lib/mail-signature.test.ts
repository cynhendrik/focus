import { describe, it, expect } from 'vitest'
import { buildSignatureFromProfile, appendSignature } from './mail-signature'
import type { CompanyProfile } from '@/types/company.types'

describe('buildSignatureFromProfile', () => {
  it('includes only set fields, omitting empty ones', () => {
    const p: CompanyProfile = { name: 'Muster GmbH', address: 'Hauptstr. 1, 10115 Berlin', email: 'hallo@muster.de' }
    const sig = buildSignatureFromProfile(p)
    expect(sig).toContain('Muster GmbH')
    expect(sig).toContain('Hauptstr. 1, 10115 Berlin')
    expect(sig).toContain('hallo@muster.de')
    expect(sig).not.toContain('Tel:')
    expect(sig).not.toContain('USt-IdNr.')
    expect(sig).not.toContain('IBAN')
  })
  it('builds a contact line, tax line, register line and bank line when set', () => {
    const p: CompanyProfile = {
      name: 'Muster GmbH', phone: '+49 30 123', email: 'a@b.de', website: 'muster.de',
      taxId: 'DE123', steuernummer: '30/456', registergericht: 'AG Berlin',
      handelsregister: 'HRB 1', geschaeftsfuehrer: 'Erika M.',
      iban: 'DE89...', bic: 'XYZ', bankName: 'Sparkasse',
    }
    const sig = buildSignatureFromProfile(p)
    expect(sig).toContain('Tel: +49 30 123')
    expect(sig).toContain('a@b.de')
    expect(sig).toContain('muster.de')
    expect(sig).toContain('USt-IdNr.: DE123')
    expect(sig).toContain('StNr.: 30/456')
    expect(sig).toContain('AG Berlin')
    expect(sig).toContain('HRB 1')
    expect(sig).toContain('GF: Erika M.')
    expect(sig).toContain('IBAN: DE89...')
    expect(sig).toContain('BIC: XYZ')
    expect(sig).toContain('Sparkasse')
  })
  it('returns empty string for an empty profile', () => {
    expect(buildSignatureFromProfile({})).toBe('')
  })
})

describe('appendSignature', () => {
  it('appends with the standard "-- " delimiter', () => {
    expect(appendSignature('Hallo', 'Muster GmbH')).toBe('Hallo\n\n-- \nMuster GmbH')
  })
  it('returns the body unchanged when signature is empty', () => {
    expect(appendSignature('Hallo', '')).toBe('Hallo')
    expect(appendSignature('Hallo', undefined)).toBe('Hallo')
  })
  it('omits leading blank lines when body is empty', () => {
    expect(appendSignature('', 'Muster GmbH')).toBe('-- \nMuster GmbH')
  })
})
