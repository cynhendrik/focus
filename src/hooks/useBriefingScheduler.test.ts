import { describe, it, expect } from 'vitest'
import { shouldDeferBriefing, HYDRATION_GRACE_MS } from './useBriefingScheduler'

describe('shouldDeferBriefing', () => {
  it('returns true when line is empty AND uptime is within grace period', () => {
    expect(shouldDeferBriefing('', HYDRATION_GRACE_MS - 1)).toBe(true)
  })

  it('returns false when line is empty BUT uptime exceeds grace period', () => {
    expect(shouldDeferBriefing('', HYDRATION_GRACE_MS + 1)).toBe(false)
  })

  it('returns false when line is non-empty even if uptime is within grace period', () => {
    expect(shouldDeferBriefing('3 Aufgaben heute', 0)).toBe(false)
  })

  it('uses custom graceMs when provided', () => {
    expect(shouldDeferBriefing('', 500, 1000)).toBe(true)
    expect(shouldDeferBriefing('', 1001, 1000)).toBe(false)
  })
})
