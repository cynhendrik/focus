import { describe, it, expect } from 'vitest'
import { threadKeyOf, TEAM_KEY } from './threads'

describe('threadKeyOf', () => {
  it('team selection → TEAM_KEY', () => { expect(threadKeyOf('team')).toBe(TEAM_KEY) })
  it('dm selection → conversationId', () => { expect(threadKeyOf({ conversationId: 'c9' })).toBe('c9') })
})
