import { describe, it, expect } from 'vitest'
import { parseVerdict } from './newcomer-classify'

describe('parseVerdict', () => {
  it('parses a valid lead verdict', () => {
    const raw = '{"verdict": "lead", "reason": "Klingt nach echter Anfrage."}'
    expect(parseVerdict(raw)).toEqual({ verdict: 'lead', reason: 'Klingt nach echter Anfrage.' })
  })

  it('parses a valid not_lead verdict', () => {
    const raw = '{"verdict": "not_lead", "reason": "Newsletter-Sprache erkannt."}'
    expect(parseVerdict(raw)).toEqual({ verdict: 'not_lead', reason: 'Newsletter-Sprache erkannt.' })
  })

  it('strips markdown code fences before parsing', () => {
    const raw = '```json\n{"verdict": "lead", "reason": "Test"}\n```'
    expect(parseVerdict(raw)).toEqual({ verdict: 'lead', reason: 'Test' })
  })

  it('falls back to a neutral lead verdict on malformed JSON', () => {
    const result = parseVerdict('not valid json at all')
    expect(result.verdict).toBe('lead')
    expect(result.reason).toContain('nicht eindeutig')
  })

  it('falls back to a neutral lead verdict on an unknown verdict value', () => {
    const raw = '{"verdict": "maybe", "reason": "unsicher"}'
    const result = parseVerdict(raw)
    expect(result.verdict).toBe('lead')
    expect(result.reason).toContain('nicht eindeutig')
  })

  it('defaults reason to an empty string when missing', () => {
    const raw = '{"verdict": "lead"}'
    expect(parseVerdict(raw)).toEqual({ verdict: 'lead', reason: '' })
  })
})
