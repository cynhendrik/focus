import { describe, it, expect } from 'vitest'
import { extractMeetingLink } from './meeting-link'

describe('extractMeetingLink', () => {
  it('erkennt einen Zoom-Link im Ort', () => {
    const r = extractMeetingLink({ location: 'https://us02web.zoom.us/j/123456789' })
    expect(r).toEqual({ url: 'https://us02web.zoom.us/j/123456789', label: 'Zoom' })
  })

  it('erkennt Teams / Meet in der Notiz', () => {
    expect(extractMeetingLink({ description: 'Call: https://teams.microsoft.com/l/meetup-join/abc' })?.label).toBe('Teams')
    expect(extractMeetingLink({ description: 'https://meet.google.com/abc-defg-hij' })?.label).toBe('Meet')
  })

  it('schneidet Satzzeichen am Ende ab', () => {
    const r = extractMeetingLink({ description: 'Link: https://meet.google.com/abc-defg-hij.' })
    expect(r?.url).toBe('https://meet.google.com/abc-defg-hij')
  })

  it('gibt null für einen normalen Website-Link zurück (kein Call)', () => {
    expect(extractMeetingLink({ location: 'Büro, siehe https://cultera.de/anfahrt' })).toBeNull()
  })

  it('gibt null zurück, wenn kein Link da ist', () => {
    expect(extractMeetingLink({ location: 'Konferenzraum 2', description: 'Agenda mitbringen' })).toBeNull()
    expect(extractMeetingLink({})).toBeNull()
  })

  it('bevorzugt den Meeting-Host vor einer anderen URL', () => {
    const r = extractMeetingLink({ description: 'Infos https://cultera.de\nCall https://zoom.us/j/999' })
    expect(r?.label).toBe('Zoom')
  })
})
