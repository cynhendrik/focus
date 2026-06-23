import { describe, it, expect } from 'vitest'
import {
  DEFAULT_DUNNING_FEES, dunningFee, parseFeeTag, reminderFeeTags,
} from './dunning.service'

describe('dunningFee', () => {
  it('uses default staffel 0/5/10 by level', () => {
    expect(dunningFee(0)).toBe(0)
    expect(dunningFee(1)).toBe(5)
    expect(dunningFee(2)).toBe(10)
  })
  it('clamps levels beyond the config to the last fee', () => {
    expect(dunningFee(3)).toBe(10)
  })
  it('honours a custom fee config', () => {
    expect(dunningFee(1, [0, 7.5, 15])).toBe(7.5)
  })
  it('falls back to 0 for an empty config', () => {
    expect(dunningFee(1, [])).toBe(0)
  })
})

describe('parseFeeTag', () => {
  it('parses cent tags to euro', () => {
    expect(parseFeeTag('fee:500')).toBe(5)
    expect(parseFeeTag('fee:0')).toBe(0)
  })
  it('ignores non-fee tags', () => {
    expect(parseFeeTag('priority:p1')).toBe(0)
  })
})

describe('reminderFeeTags', () => {
  it('snapshots the level fee as a cent tag', () => {
    expect(reminderFeeTags(1)).toEqual(['fee:500'])
    expect(reminderFeeTags(2, [0, 5, 12])).toEqual(['fee:1200'])
  })
  it('emits fee:0 for the free Zahlungserinnerung', () => {
    expect(reminderFeeTags(0)).toEqual(['fee:0'])
  })
  it('exposes the default staffel', () => {
    expect(DEFAULT_DUNNING_FEES).toEqual([0, 5, 10])
  })
})
