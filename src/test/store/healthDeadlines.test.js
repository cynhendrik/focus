import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../store'

beforeEach(() => {
  useStore.setState({
    customers: [],
    healthScores: [],
    deadlines: [],
    hasSeenIntro: false,
  })
})

describe('healthScores', () => {
  it('addHealthScore creates entry with customerId', () => {
    useStore.getState().addHealthScore('c1', { score: 82, engagement: 88, onTimeDelivery: 95 })
    const hs = useStore.getState().healthScores
    expect(hs).toHaveLength(1)
    expect(hs[0].customerId).toBe('c1')
    expect(hs[0].score).toBe(82)
    expect(hs[0].id).toBeTruthy()
  })

  it('updateHealthScore merges fields by id', () => {
    useStore.getState().addHealthScore('c1', { score: 70, engagement: 60, onTimeDelivery: 80 })
    const id = useStore.getState().healthScores[0].id
    useStore.getState().updateHealthScore(id, { score: 85 })
    expect(useStore.getState().healthScores[0].score).toBe(85)
    expect(useStore.getState().healthScores[0].engagement).toBe(60)
  })
})

describe('deadlines', () => {
  it('addDeadline creates entry', () => {
    useStore.getState().addDeadline('c1', { title: 'Campaign', date: '2026-05-10', priority: 'high' })
    const dl = useStore.getState().deadlines
    expect(dl).toHaveLength(1)
    expect(dl[0].title).toBe('Campaign')
    expect(dl[0].priority).toBe('high')
  })

  it('deleteDeadline removes by id', () => {
    useStore.getState().addDeadline('c1', { title: 'X', date: '2026-05-10', priority: 'low' })
    const id = useStore.getState().deadlines[0].id
    useStore.getState().deleteDeadline(id)
    expect(useStore.getState().deadlines).toHaveLength(0)
  })
})

describe('addCustomer with category/status', () => {
  it('stores category and status', () => {
    useStore.getState().addCustomer({ name: 'Test GmbH', category: 'Buchhaltung', status: 'aktiv' })
    const c = useStore.getState().customers[0]
    expect(c.category).toBe('Buchhaltung')
    expect(c.status).toBe('aktiv')
  })
})

describe('hasSeenIntro', () => {
  it('setHasSeenIntro sets to true', () => {
    expect(useStore.getState().hasSeenIntro).toBe(false)
    useStore.getState().setHasSeenIntro()
    expect(useStore.getState().hasSeenIntro).toBe(true)
  })
})
