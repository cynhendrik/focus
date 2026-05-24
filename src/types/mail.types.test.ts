import type { MailFolder } from './mail.types'

describe('MailFolder', () => {
  it('has required fields', () => {
    const f: MailFolder = {
      id: 'acc1-INBOX',
      accountId: 'acc1',
      path: 'INBOX',
      delimiter: '.',
      displayName: 'INBOX',
      parentPath: null,
      flags: [],
      isSelectable: true,
    }
    expect(f.isSelectable).toBe(true)
    expect(f.parentPath).toBeNull()
  })

  it('optionally has children', () => {
    const f: MailFolder = {
      id: 'acc1-INBOX',
      accountId: 'acc1',
      path: 'INBOX',
      delimiter: '.',
      displayName: 'INBOX',
      parentPath: null,
      flags: [],
      isSelectable: true,
      children: [],
    }
    expect(f.children).toHaveLength(0)
  })
})
