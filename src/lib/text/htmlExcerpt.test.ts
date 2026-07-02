import { describe, it, expect } from 'vitest'
import { htmlToExcerpt } from './htmlExcerpt'

describe('htmlToExcerpt', () => {
  it('returns empty string for null/undefined/empty', () => {
    expect(htmlToExcerpt(null)).toBe('')
    expect(htmlToExcerpt(undefined)).toBe('')
    expect(htmlToExcerpt('')).toBe('')
  })

  it('strips HTML tags', () => {
    expect(htmlToExcerpt('<p>Kann <strong>telefonieren</strong></p>')).toBe('Kann telefonieren')
  })

  it('collapses whitespace across block tags', () => {
    expect(htmlToExcerpt('<p>Zeile eins</p><p>Zeile zwei</p>')).toBe('Zeile eins Zeile zwei')
  })

  it('decodes the common HTML entities', () => {
    expect(htmlToExcerpt('<p>Müller &amp; Co. &lt;wichtig&gt;</p>')).toBe('Müller & Co. <wichtig>')
  })

  it('truncates long text with an ellipsis', () => {
    const long = '<p>' + 'a'.repeat(200) + '</p>'
    const out = htmlToExcerpt(long, 50)
    expect(out.length).toBe(50)
    expect(out.endsWith('…')).toBe(true)
  })

  it('does not truncate text at or below the limit', () => {
    expect(htmlToExcerpt('<p>kurz</p>', 50)).toBe('kurz')
  })
})
