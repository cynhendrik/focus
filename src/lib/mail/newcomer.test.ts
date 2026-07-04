import { describe, it, expect } from 'vitest'
import type { EmailHeader } from '@/types/mail.types'
import type { IgnoredSender } from '@/types/mail.types'
import { classifyMails, isAutoSender, matchesIgnoredSender } from './newcomer'

function mail(over: Partial<EmailHeader>): EmailHeader {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    accountId: 'a1',
    uid: 1,
    folder: 'INBOX',
    subject: 'Betreff',
    fromAddr: 'wer@irgendwo.de',
    fromName: '',
    toAddrs: [],
    sentAt: '2026-07-01T10:00:00Z',
    isRead: false,
    customerId: null,
    notALead: false,
    ...over,
  }
}

function ignored(pattern: string, scope: IgnoredSender['scope']): IgnoredSender {
  return { id: pattern, pattern, scope, createdAt: '2026-07-01T00:00:00Z' }
}

describe('isAutoSender', () => {
  it('erkennt gängige System-Absender', () => {
    expect(isAutoSender('noreply@app.com')).toBe(true)
    expect(isAutoSender('no-reply@shop.de')).toBe(true)
    expect(isAutoSender('no_reply@shop.de')).toBe(true)
    expect(isAutoSender('donotreply@service.io')).toBe(true)
    expect(isAutoSender('support-noreply@github.com')).toBe(true)
    expect(isAutoSender('notifications@github.com')).toBe(true)
    expect(isAutoSender('notification@app.com')).toBe(true)
    expect(isAutoSender('newsletter@laden.de')).toBe(true)
    expect(isAutoSender('mailer-daemon@mx.web.de')).toBe(true)
    expect(isAutoSender('postmaster@firma.de')).toBe(true)
    expect(isAutoSender('bounces@mailchimp.com')).toBe(true)
    expect(isAutoSender('alerts@monitoring.io')).toBe(true)
    expect(isAutoSender('NoReply@App.com')).toBe(true)
  })

  it('lässt echte Menschen durch', () => {
    expect(isAutoSender('hans.mueller@firma.de')).toBe(false)
    expect(isAutoSender('info@kunde.de')).toBe(false)
    expect(isAutoSender('support@kunde.de')).toBe(false)
    expect(isAutoSender('anna@newsletter-agentur.de')).toBe(false) // Domain zählt nicht
    expect(isAutoSender('')).toBe(false)
  })
})

describe('matchesIgnoredSender', () => {
  it('matcht exakte Adressen case-insensitiv', () => {
    const list = [ignored('privat@gmx.de', 'address')]
    expect(matchesIgnoredSender('privat@gmx.de', list)).toBe(true)
    expect(matchesIgnoredSender('Privat@GMX.de', list)).toBe(true)
    expect(matchesIgnoredSender('anderer@gmx.de', list)).toBe(false)
  })

  it('matcht Domains inklusive Subdomains', () => {
    const list = [ignored('app.com', 'domain')]
    expect(matchesIgnoredSender('x@app.com', list)).toBe(true)
    expect(matchesIgnoredSender('x@mail.app.com', list)).toBe(true)
    expect(matchesIgnoredSender('x@notapp.com', list)).toBe(false)
    expect(matchesIgnoredSender('x@app.com.evil.de', list)).toBe(false)
  })
})

describe('classifyMails', () => {
  const leadSet = new Set(['lead@firma.de'])
  const customerSet = new Set(['kunde@bestand.de'])

  it('ordnet Lead-Absender den bekannten Leads zu (case-insensitiv)', () => {
    const g = classifyMails([mail({ fromAddr: 'Lead@Firma.de' })], leadSet, customerSet)
    expect(g.leadMails).toHaveLength(1)
    expect(g.candidates).toHaveLength(0)
  })

  it('blendet Mails bestehender Kunden komplett aus', () => {
    const g = classifyMails([mail({ fromAddr: 'kunde@bestand.de' })], leadSet, customerSet)
    expect(g.leadMails).toHaveLength(0)
    expect(g.candidates).toHaveLength(0)
    expect(g.autoSorted).toHaveLength(0)
    expect(g.hidden).toHaveLength(0)
  })

  it('legt notALead-Mails in hidden — auch wenn sie wie System-Mails aussehen', () => {
    const g = classifyMails(
      [mail({ fromAddr: 'noreply@app.com', notALead: true })],
      leadSet, customerSet,
    )
    expect(g.hidden).toHaveLength(1)
    expect(g.autoSorted).toHaveLength(0)
  })

  it('sortiert System-Absender automatisch aus', () => {
    const g = classifyMails([mail({ fromAddr: 'notifications@github.com' })], leadSet, customerSet)
    expect(g.autoSorted).toHaveLength(1)
    expect(g.candidates).toHaveLength(0)
  })

  it('unbekannte normale Absender sind Kandidaten, neueste zuerst', () => {
    const g = classifyMails([
      mail({ id: 'alt', fromAddr: 'a@x.de', sentAt: '2026-07-01T08:00:00Z' }),
      mail({ id: 'neu', fromAddr: 'b@y.de', sentAt: '2026-07-02T08:00:00Z' }),
    ], leadSet, customerSet)
    expect(g.candidates.map(m => m.id)).toEqual(['neu', 'alt'])
  })

  it('Lead-Zuordnung schlägt Kunden-Ausschluss', () => {
    const g = classifyMails(
      [mail({ fromAddr: 'lead@firma.de' })],
      leadSet,
      new Set(['lead@firma.de']),
    )
    expect(g.leadMails).toHaveLength(1)
  })
})
