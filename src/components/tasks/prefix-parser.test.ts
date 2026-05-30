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

  describe('soft date detection (free text)', () => {
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
      expect(d.getMonth()).toBe(5)
      // "mit" is a filler word and gets dropped
      expect(r.title).toBe('Termin Kunde')
    })

    it('detects DD.MM.YYYY format', () => {
      const r = parseTaskText('Audit 15.10.2026 fertigstellen')
      expect(r.scheduledAt).toBeDefined()
      const d = new Date(r.scheduledAt!)
      expect(d.getDate()).toBe(15)
      expect(d.getMonth()).toBe(9)
      expect(d.getFullYear()).toBe(2026)
      expect(r.title).toBe('Audit fertigstellen')
    })

    it('handles trailing comma after keyword', () => {
      const r = parseTaskText('Morgen, Brand Refresh')
      expect(r.scheduledAt?.slice(0, 10)).toBe(dayPlus(1))
      expect(r.title).toBe('Brand Refresh')
    })

    it('only first soft date matched', () => {
      const r = parseTaskText('morgen heute Brand')
      expect(r.scheduledAt?.slice(0, 10)).toBe(dayPlus(1))
      expect(r.title).toBe('heute Brand')
    })
  })

  describe('soft-time + hasExplicitTime', () => {
    it('bare "12:30" sets time + hasExplicitTime, anchored today', () => {
      const r = parseTaskText('Brand 12:30')
      expect(r.hasExplicitTime).toBe(true)
      const d = new Date(r.scheduledAt!)
      expect(d.getHours()).toBe(12)
      expect(d.getMinutes()).toBe(30)
      const today = new Date().toISOString().slice(0, 10)
      expect(r.scheduledAt!.slice(0, 10)).toBe(today)
      expect(r.title).toBe('Brand')
    })

    it('"morgen 12:30" combines date + time, hasExplicitTime=true', () => {
      const r = parseTaskText('!! Telefonmeeting Morgen 12:30')
      expect(r.priority).toBe('p1')
      expect(r.hasExplicitTime).toBe(true)
      const d = new Date(r.scheduledAt!)
      expect(d.getHours()).toBe(12)
      expect(d.getMinutes()).toBe(30)
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
      expect(r.scheduledAt!.slice(0, 10)).toBe(tomorrow.toISOString().slice(0, 10))
      expect(r.title).toBe('Telefonmeeting')
    })

    it('"15.6. 14:00" combines date + time', () => {
      const r = parseTaskText('Termin 15.6. 14:00')
      expect(r.hasExplicitTime).toBe(true)
      const d = new Date(r.scheduledAt!)
      expect(d.getHours()).toBe(14)
      expect(d.getDate()).toBe(15)
      expect(d.getMonth()).toBe(5)
      expect(r.title).toBe('Termin')
    })

    it('plain "morgen" without time does NOT set hasExplicitTime', () => {
      const r = parseTaskText('Morgen Brand')
      expect(r.hasExplicitTime).toBeUndefined()
      expect(r.scheduledAt).toBeDefined()
    })

    it('invalid time "25:99" stays in title', () => {
      const r = parseTaskText('Test 25:99')
      expect(r.hasExplicitTime).toBeUndefined()
      expect(r.scheduledAt).toBeUndefined()
      expect(r.title).toBe('Test 25:99')
    })
  })

  describe('@-mention resolution via ParseContext', () => {
    it('resolved @-mention sets customerId, marker removed from title', () => {
      const r = parseTaskText('Call mit @Klara', {
        mentions: [{ marker: '@Klara', customerId: 'cust-1' }],
      })
      expect(r.customerId).toBe('cust-1')
      // "mit" is a filler, gets stripped
      expect(r.title).toBe('Call')
    })

    it('case-insensitive marker match', () => {
      const r = parseTaskText('Treffen mit @KLARA', {
        mentions: [{ marker: '@Klara', customerId: 'cust-1' }],
      })
      expect(r.customerId).toBe('cust-1')
    })

    it('unresolved @-token: drops the @ and keeps the word in title', () => {
      const r = parseTaskText('Call mit @Klara')
      expect(r.customerId).toBeUndefined()
      expect(r.title).toBe('Call Klara')
    })

    it('multiple resolved mentions: first wins', () => {
      const r = parseTaskText('Treffen @Klara @Tobi', {
        mentions: [
          { marker: '@Klara', customerId: 'cust-1' },
          { marker: '@Tobi',  customerId: 'cust-2' },
        ],
      })
      expect(r.customerId).toBe('cust-1')
    })

    it('combined: priority + date + time + mention', () => {
      const r = parseTaskText('!! Morgen 12:30 Termin mit @Klara', {
        mentions: [{ marker: '@Klara', customerId: 'cust-1' }],
      })
      expect(r.priority).toBe('p1')
      expect(r.hasExplicitTime).toBe(true)
      expect(r.customerId).toBe('cust-1')
      const d = new Date(r.scheduledAt!)
      expect(d.getHours()).toBe(12)
      expect(d.getMinutes()).toBe(30)
      expect(r.title).toBe('Termin')
    })
  })
})
