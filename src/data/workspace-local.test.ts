import { describe, it, expect } from 'vitest'
import { makeLocalWorkspace } from './workspace-local'

describe('makeLocalWorkspace', () => {
  it('builds a local workspace with safe defaults', () => {
    const ws = makeLocalWorkspace('l1', 'Mein Workspace')
    expect(ws).toMatchObject({
      id: 'l1', name: 'Mein Workspace', role: 'owner',
      capabilities: [], join_code: null, isShared: false, logo_url: null,
    })
  })
})
