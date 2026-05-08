import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { log } from './logger'

describe('logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('log.warn calls console.warn with formatted message', () => {
    log.warn('test warning', { code: 42 })
    expect(console.warn).toHaveBeenCalledOnce()
    const call = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(call).toContain('[WARN]')
    expect(call).toContain('test warning')
    expect(call).toContain('"code":42')
  })

  it('log.error calls console.error', () => {
    log.error('something broke')
    expect(console.error).toHaveBeenCalledOnce()
  })
})
