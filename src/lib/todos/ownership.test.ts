import { describe, it, expect } from 'vitest'
import { isMine, filterMine } from './ownership'

describe('isMine', () => {
  it('task assigned to me is mine', () => {
    expect(isMine({ assignee: 'u1' }, 'u1')).toBe(true)
  })
  it('task assigned to someone else is NOT mine', () => {
    expect(isMine({ assignee: 'u2' }, 'u1')).toBe(false)
  })
  it('unassigned task is mine (solo / grab-pool)', () => {
    expect(isMine({ assignee: undefined }, 'u1')).toBe(true)
    expect(isMine({ assignee: '' }, 'u1')).toBe(true)
  })
  it('no signed-in user → nothing hidden', () => {
    expect(isMine({ assignee: 'u2' }, undefined)).toBe(true)
  })
})

describe('filterMine', () => {
  it('keeps mine + unassigned, drops others', () => {
    const todos = [{ assignee: 'u1' }, { assignee: 'u2' }, { assignee: undefined }]
    expect(filterMine(todos, 'u1')).toEqual([{ assignee: 'u1' }, { assignee: undefined }])
  })
})
