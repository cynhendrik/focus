import { describe, it, expect } from 'vitest'
import { createCompanySlice } from '../../store/companySlice'

function makeSlice() {
  let state = {}
  const set = (updater) => { state = typeof updater === 'function' ? updater(state) : { ...state, ...updater } }
  const get = () => state
  const slice = createCompanySlice(set, get)
  state = { ...slice }
  return { get, slice }
}

describe('createCompanySlice', () => {
  it('initializes companyProfile with empty strings', () => {
    const { get } = makeSlice()
    expect(get().companyProfile.name).toBe('')
    expect(get().companyProfile.industry).toBe('')
  })

  it('setCompanyProfile merges without overwriting other fields', () => {
    const { get, slice } = makeSlice()
    slice.setCompanyProfile({ name: 'Muster GmbH' })
    expect(get().companyProfile.name).toBe('Muster GmbH')
    expect(get().companyProfile.description).toBe('')
  })

  it('setModule toggles workflow off', () => {
    const { get, slice } = makeSlice()
    expect(get().modules.workflow).toBe(true)
    slice.setModule('workflow', false)
    expect(get().modules.workflow).toBe(false)
  })

  it('setModule enables deals', () => {
    const { get, slice } = makeSlice()
    expect(get().modules.deals).toBe(false)
    slice.setModule('deals', true)
    expect(get().modules.deals).toBe(true)
  })

  it('updateCrmSettings replaces statuses list', () => {
    const { get, slice } = makeSlice()
    slice.updateCrmSettings({ statuses: ['Lead', 'Aktiv', 'Geschlossen'] })
    expect(get().crmSettings.statuses).toEqual(['Lead', 'Aktiv', 'Geschlossen'])
    expect(get().crmSettings.followUpEnabled).toBe(false)
  })

  it('updateCrmSettings adds a tag', () => {
    const { get, slice } = makeSlice()
    slice.updateCrmSettings({ tags: ['Premium'] })
    expect(get().crmSettings.tags).toContain('Premium')
  })

  it('setCompanyView changes active view', () => {
    const { get, slice } = makeSlice()
    expect(get().companyView).toBeNull()
    slice.setCompanyView('profil')
    expect(get().companyView).toBe('profil')
  })

  it('setWorkspaceName updates name', () => {
    const { get, slice } = makeSlice()
    slice.setWorkspaceName('Meine Agentur')
    expect(get().workspaceName).toBe('Meine Agentur')
  })
})
