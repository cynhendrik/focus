import { describe, it, expect } from 'vitest'
import { parseTaskText } from './prefix-parser'

describe('parseTaskText', () => {
  it('parses plain title', () => {
    const r = parseTaskText('Brand Guidelines')
    expect(r.title).toBe('Brand Guidelines')
    expect(r.priority).toBeUndefined()
    expect(r.tags).toEqual([])
  })

  it('parses ! as p2', () => {
    const r = parseTaskText('! Kunde anrufen')
    expect(r.priority).toBe('p2')
    expect(r.title).toBe('Kunde anrufen')
  })

  it('parses !! as p1', () => {
    const r = parseTaskText('!! Dringende Sache')
    expect(r.priority).toBe('p1')
    expect(r.title).toBe('Dringende Sache')
  })

  it('parses ~30m as 30 minutes', () => {
    const r = parseTaskText('~30m Mail beantworten')
    expect(r.plannedMinutes).toBe(30)
    expect(r.title).toBe('Mail beantworten')
  })

  it('parses ~1h as 60 minutes', () => {
    const r = parseTaskText('~1h Code Review')
    expect(r.plannedMinutes).toBe(60)
  })

  it('parses ~1.5h as 90 minutes', () => {
    const r = parseTaskText('~1.5h Sprint Planning')
    expect(r.plannedMinutes).toBe(90)
  })

  it('parses #tag and #another', () => {
    const r = parseTaskText('#call #wichtig Onboarding-Call')
    expect(r.tags).toEqual(['call', 'wichtig'])
    expect(r.title).toBe('Onboarding-Call')
  })

  it('parses @10:00 as today at given time', () => {
    const r = parseTaskText('@10:00 Brand Guidelines')
    expect(r.scheduledAt).toBeDefined()
    const d = new Date(r.scheduledAt!)
    expect(d.getHours()).toBe(10)
    expect(d.getMinutes()).toBe(0)
    const today = new Date().toISOString().slice(0, 10)
    expect(r.scheduledAt!.slice(0, 10)).toBe(today)
  })

  it('parses @morgen as tomorrow 09:00', () => {
    const r = parseTaskText('@morgen Statuscall')
    expect(r.scheduledAt).toBeDefined()
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    expect(r.scheduledAt!.slice(0, 10)).toBe(tomorrow.toISOString().slice(0, 10))
  })

  it('parses +Kunde as customerHint', () => {
    const r = parseTaskText('+TechCorp Statusupdate')
    expect(r.customerHint).toBe('TechCorp')
    expect(r.title).toBe('Statusupdate')
  })

  it('parses combined tokens', () => {
    const r = parseTaskText('!! ~45m @10:00 #call +TechCorp Brand Guidelines')
    expect(r.priority).toBe('p1')
    expect(r.plannedMinutes).toBe(45)
    expect(r.scheduledAt).toBeDefined()
    expect(r.tags).toEqual(['call'])
    expect(r.customerHint).toBe('TechCorp')
    expect(r.title).toBe('Brand Guidelines')
  })

  it('does not parse ! inside word', () => {
    const r = parseTaskText('Test! Wichtig')
    expect(r.priority).toBeUndefined()
    expect(r.title).toBe('Test! Wichtig')
  })

  it('returns empty title when only tokens', () => {
    const r = parseTaskText('!! ~30m #foo')
    expect(r.title).toBe('')
  })

  it('handles trailing whitespace', () => {
    const r = parseTaskText('  ! Test  ')
    expect(r.priority).toBe('p2')
    expect(r.title).toBe('Test')
  })

  describe('soft date detection (free text, no @-prefix)', () => {
    const todayStr = () => new Date().toISOString().slice(0, 10)
    const dayPlus = (n: number) => {
      const d = new Date(); d.setDate(d.getDate() + n)
      return d.toISOString().slice(0, 10)
    }

    it('detects "morgen" anywhere in title', () => {
      const r = parseTaskText('Morgen Kunde anrufen')
      expect(r.scheduledAt?.slice(0, 10)).toBe(dayPlus(1))
      expect(r.title).toBe('Kunde anrufen')
    })

    it('detects "heute" case-insensitive', () => {
      const r = parseTaskText('Brand Update heute fertig')
      expect(r.scheduledAt?.slice(0, 10)).toBe(todayStr())
      expect(r.title).toBe('Brand Update fertig')
    })

    it('detects "übermorgen"', () => {
      const r = parseTaskText('Statuscall übermorgen')
      expect(r.scheduledAt?.slice(0, 10)).toBe(dayPlus(2))
      expect(r.title).toBe('Statuscall')
    })

    it('detects full weekday name', () => {
      const r = parseTaskText('Review Montag')
      expect(r.scheduledAt).toBeDefined()
      expect(r.title).toBe('Review')
    })

    it('detects DD.MM. format (current year)', () => {
      const r = parseTaskText('Termin 15.6. mit Kunde')
      expect(r.scheduledAt).toBeDefined()
      const d = new Date(r.scheduledAt!)
      expect(d.getDate()).toBe(15)
      expect(d.getMonth()).toBe(5)  // June = month 5 (0-indexed)
      expect(r.title).toBe('Termin mit Kunde')
    })

    it('detects DD.MM.YYYY format', () => {
      const r = parseTaskText('Audit 15.10.2026 fertigstellen')
      expect(r.scheduledAt).toBeDefined()
      const d = new Date(r.scheduledAt!)
      expect(d.getDate()).toBe(15)
      expect(d.getMonth()).toBe(9)  // October
      expect(d.getFullYear()).toBe(2026)
      expect(r.title).toBe('Audit fertigstellen')
    })

    it('handles trailing comma after keyword', () => {
      const r = parseTaskText('Morgen, Brand Refresh')
      expect(r.scheduledAt?.slice(0, 10)).toBe(dayPlus(1))
      expect(r.title).toBe('Brand Refresh')
    })

    it('explicit @-token wins over soft token', () => {
      const r = parseTaskText('@heute morgen')
      expect(r.scheduledAt?.slice(0, 10)).toBe(todayStr())
      // 'morgen' should remain in title since @heute already set scheduledAt
      expect(r.title).toBe('morgen')
    })

    it('only first soft date matched', () => {
      const r = parseTaskText('morgen heute Brand')
      expect(r.scheduledAt?.slice(0, 10)).toBe(dayPlus(1))
      expect(r.title).toBe('heute Brand')
    })
  })
})
