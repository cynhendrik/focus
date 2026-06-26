import { describe, it, expect, beforeEach } from 'vitest'
import { useMessagesStore } from './messages.store'
import type { Message } from '@/types/message.types'

const mk = (id: string, createdAt: string): Message => ({
  id, workspaceId: 'ws1', createdBy: 'u1', kind: 'user', body: id,
  systemEvent: null, refType: null, refId: null, visibility: 'internal',
  mentions: [], createdAt, updatedAt: createdAt, deletedAt: null,
})

describe('messages.store', () => {
  beforeEach(() => useMessagesStore.setState({ messages: [], loading: false, hasMore: true, loadingMore: false }))

  it('appendRealtime adds a new message at the end', () => {
    useMessagesStore.setState({ messages: [mk('a', 'T1')] })
    useMessagesStore.getState().appendRealtime(mk('b', 'T2'))
    expect(useMessagesStore.getState().messages.map(m => m.id)).toEqual(['a', 'b'])
  })

  it('appendRealtime ignores duplicates by id', () => {
    useMessagesStore.setState({ messages: [mk('a', 'T1')] })
    useMessagesStore.getState().appendRealtime(mk('a', 'T1'))
    expect(useMessagesStore.getState().messages).toHaveLength(1)
  })
})
