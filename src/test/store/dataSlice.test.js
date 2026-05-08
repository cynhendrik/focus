import { describe, it, expect } from 'vitest'
import { createDataSlice } from '../../store/dataSlice'

function makeSlice() {
  let state = {}
  const set = (updater) => {
    state = typeof updater === 'function' ? updater(state) : { ...state, ...updater }
  }
  const get = () => state
  const slice = createDataSlice(set, get)
  state = { ...slice }
  return { get, slice }
}

describe('createDataSlice', () => {
  it('addCustomer creates customer with id, timestamps, and selects it', () => {
    const { get, slice } = makeSlice()
    slice.addCustomer({ name: 'Test GmbH', company: '', email: '', phone: '' })
    expect(get().customers).toHaveLength(1)
    expect(get().customers[0].name).toBe('Test GmbH')
    expect(get().customers[0].id).toBeTruthy()
    expect(get().selectedId).toBe(get().customers[0].id)
  })

  it('deleteCustomer removes customer and all related todos, notes, kpis, folders, files', () => {
    const { get, slice } = makeSlice()
    slice.addCustomer({ name: 'Delete Me', company: '', email: '', phone: '' })
    const id = get().customers[0].id
    slice.addTodo(id, 'test todo')
    slice.addNote(id)
    slice.deleteCustomer(id)
    expect(get().customers).toHaveLength(0)
    expect(get().todos.filter(t => t.customerId === id)).toHaveLength(0)
    expect(get().notes.filter(n => n.customerId === id)).toHaveLength(0)
  })

  it('addNote with null customerId creates a workspace note', () => {
    const { get, slice } = makeSlice()
    slice.addNote(null)
    expect(get().notes[0].customerId).toBeNull()
  })

  it('addTodo with null customerId creates a workspace todo', () => {
    const { get, slice } = makeSlice()
    slice.addTodo(null, 'Personal task', 'mid', null)
    expect(get().todos[0].customerId).toBeNull()
    expect(get().todos[0].text).toBe('Personal task')
  })

  it('addFile stores tauriPath, not data', () => {
    const { get, slice } = makeSlice()
    slice.addFile('cust1', null, { name: 'doc.pdf', type: 'application/pdf', size: 1024, tauriPath: 'cynera/files/cust1/f1.pdf' })
    const file = get().uploadedFiles[0]
    expect(file.tauriPath).toBe('cynera/files/cust1/f1.pdf')
    expect(file.data).toBeUndefined()
  })

  it('touchCustomer with null customerId is a no-op', () => {
    const { get, slice } = makeSlice()
    slice.addCustomer({ name: 'Keep', company: '', email: '', phone: '' })
    const before = get().customers[0].updatedAt
    slice.touchCustomer(null)
    expect(get().customers[0].updatedAt).toBe(before)
  })

  it('pinKpi adds kpiName to dashboardKpis without duplicates', () => {
    const { get, slice } = makeSlice()
    slice.addCustomer({ name: 'A', company: '', email: '', phone: '' })
    const id = get().customers[0].id
    slice.pinKpi(id, 'Umsatz')
    slice.pinKpi(id, 'Umsatz')
    slice.pinKpi(id, 'Impressionen')
    expect(get().customers[0].dashboardKpis).toEqual(['Umsatz', 'Impressionen'])
  })

  it('unpinKpi removes kpiName from dashboardKpis', () => {
    const { get, slice } = makeSlice()
    slice.addCustomer({ name: 'B', company: '', email: '', phone: '' })
    const id = get().customers[0].id
    slice.pinKpi(id, 'Umsatz')
    slice.unpinKpi(id, 'Umsatz')
    expect(get().customers[0].dashboardKpis).toEqual([])
  })

  it('unpinKpi on customer without dashboardKpis is a no-op', () => {
    const { get, slice } = makeSlice()
    slice.addCustomer({ name: 'C', company: '', email: '', phone: '' })
    const id = get().customers[0].id
    expect(() => slice.unpinKpi(id, 'Umsatz')).not.toThrow()
    expect(get().customers[0].dashboardKpis).toEqual([])
  })
})
