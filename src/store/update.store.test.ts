import { describe, it, expect, beforeEach } from 'vitest'
import { useUpdateStore } from './update.store'

const fakeUpdate = { version: '2.1.0', downloadAndInstall: async () => {} }

describe('update.store', () => {
  beforeEach(() => useUpdateStore.getState().reset())

  it('startet im idle-Zustand', () => {
    const s = useUpdateStore.getState()
    expect(s.phase).toBe('idle')
    expect(s.version).toBe('')
    expect(s.progress).toBe(0)
  })

  it('setAvailable speichert Version + Update und setzt phase=available', () => {
    useUpdateStore.getState().setAvailable(fakeUpdate)
    const s = useUpdateStore.getState()
    expect(s.phase).toBe('available')
    expect(s.version).toBe('2.1.0')
    expect(s.update).toBe(fakeUpdate)
  })

  it('Download-Fluss: downloading → progress → ready', () => {
    const st = useUpdateStore.getState()
    st.setAvailable(fakeUpdate)
    st.setDownloading()
    expect(useUpdateStore.getState().phase).toBe('downloading')
    st.setProgress(80)
    expect(useUpdateStore.getState().progress).toBe(80)
    st.setReady()
    const s = useUpdateStore.getState()
    expect(s.phase).toBe('ready')
    expect(s.progress).toBe(100)
  })

  it('setError setzt phase=error mit Nachricht', () => {
    useUpdateStore.getState().setError('kaputt')
    const s = useUpdateStore.getState()
    expect(s.phase).toBe('error')
    expect(s.errorMsg).toBe('kaputt')
  })

  it('dismiss merkt die Version und geht zurück zu idle', () => {
    const st = useUpdateStore.getState()
    st.setAvailable(fakeUpdate)
    st.dismiss()
    const s = useUpdateStore.getState()
    expect(s.phase).toBe('idle')
    expect(s.dismissedVersion).toBe('2.1.0')
  })
})
