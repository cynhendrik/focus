import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useToastStore } from './toast.store'

describe('useToastStore', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] })
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('appends toast with generated id', () => {
    useToastStore.getState().show({ message: 'Hello' })
    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0].message).toBe('Hello')
    expect(toasts[0].id).toBeTruthy()
  })

  it('auto-dismisses after duration (default 4000ms)', () => {
    useToastStore.getState().show({ message: 'Bye' })
    expect(useToastStore.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(4001)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('dismiss(id) removes toast', () => {
    useToastStore.getState().show({ message: 'A' })
    const id = useToastStore.getState().toasts[0].id
    useToastStore.getState().dismiss(id)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('supports action with label and onClick', () => {
    const onClick = vi.fn()
    useToastStore.getState().show({
      message: 'Deal angelegt',
      action: { label: '→ Pipeline öffnen', onClick },
    })
    expect(useToastStore.getState().toasts[0].action?.label).toBe('→ Pipeline öffnen')
    useToastStore.getState().toasts[0].action?.onClick()
    expect(onClick).toHaveBeenCalledOnce()
  })
})
