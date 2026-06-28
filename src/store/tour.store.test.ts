import { describe, it, expect, beforeEach } from 'vitest'
import { useTourStore, TOUR_STEP_COUNT } from './tour.store'

beforeEach(() => { useTourStore.setState({ active: false, step: 0, seen: false }) })

describe('useTourStore', () => {
  it('start aktiviert bei Schritt 0', () => {
    useTourStore.getState().start()
    expect(useTourStore.getState().active).toBe(true)
    expect(useTourStore.getState().step).toBe(0)
  })
  it('next/prev bleiben in den Grenzen', () => {
    useTourStore.getState().start()
    for (let i = 0; i < TOUR_STEP_COUNT + 3; i++) useTourStore.getState().next()
    expect(useTourStore.getState().step).toBe(TOUR_STEP_COUNT - 1)
    for (let i = 0; i < TOUR_STEP_COUNT + 3; i++) useTourStore.getState().prev()
    expect(useTourStore.getState().step).toBe(0)
  })
  it('finish deaktiviert + setzt seen', () => {
    useTourStore.getState().start()
    useTourStore.getState().finish()
    expect(useTourStore.getState().active).toBe(false)
    expect(useTourStore.getState().seen).toBe(true)
  })
  it('skip = finish (seen=true, inaktiv)', () => {
    useTourStore.getState().start(); useTourStore.getState().skip()
    expect(useTourStore.getState().active).toBe(false)
    expect(useTourStore.getState().seen).toBe(true)
  })
})
