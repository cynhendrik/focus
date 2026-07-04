import { describe, it, expect } from 'vitest'
import { isFollowUpActivity } from './followups'

describe('isFollowUpActivity', () => {
  it('erkennt die Konvention task + is_follow_up', () => {
    expect(isFollowUpActivity({ type: 'task', payload: '{"is_follow_up":true}' })).toBe(true)
  })

  it('erkennt Alt-Einträge mit type=followup (Composer vor dem Fix)', () => {
    expect(isFollowUpActivity({ type: 'followup' })).toBe(true)
  })

  it('normale Tasks, Deadlines und Notizen sind keine Follow-ups', () => {
    expect(isFollowUpActivity({ type: 'task', payload: '{"is_follow_up":false}' })).toBe(false)
    expect(isFollowUpActivity({ type: 'task' })).toBe(false)
    expect(isFollowUpActivity({ type: 'note', payload: '{"is_follow_up":true}' })).toBe(false)
  })

  it('kaputtes payload-JSON wirft nicht', () => {
    expect(isFollowUpActivity({ type: 'task', payload: '{nope' })).toBe(false)
  })
})
