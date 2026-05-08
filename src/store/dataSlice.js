import { v4 as uid } from 'uuid'

const now = () => new Date().toISOString()

export const createDataSlice = (set, get) => ({
  customers: [],
  todos: [],
  notes: [],
  kpis: [],
  folders: [],
  uploadedFiles: [],

  addCustomer: (data) => {
    const c = { id: uid(), createdAt: now(), updatedAt: now(), ...data }
    set(s => ({ ...s, customers: [c, ...s.customers], selectedId: c.id }))
    return c
  },
  updateCustomer: (id, data) => set(s => ({
    ...s,
    customers: s.customers.map(c => c.id === id ? { ...c, ...data, updatedAt: now() } : c),
  })),
  deleteCustomer: (id) => set(s => {
    const remaining = s.customers.filter(c => c.id !== id)
    return {
      ...s,
      customers: remaining,
      todos: s.todos.filter(t => t.customerId !== id),
      notes: s.notes.filter(n => n.customerId !== id),
      kpis: s.kpis.filter(k => k.customerId !== id),
      folders: s.folders.filter(f => f.customerId !== id),
      uploadedFiles: s.uploadedFiles.filter(f => f.customerId !== id),
      selectedId: remaining[0]?.id ?? null,
      selectedNoteId: null,
      customerView: 'workflow',
    }
  }),
  selectCustomer: (id) => set(s => ({ ...s, selectedId: id, selectedNoteId: null, customerView: 'workflow' })),
  touchCustomer: (id) => {
    if (!id) return
    set(s => ({ ...s, customers: s.customers.map(c => c.id === id ? { ...c, updatedAt: now() } : c) }))
  },

  addTodo: (customerId, text, prio = 'mid', due = null) => {
    const t = { id: uid(), customerId: customerId ?? null, text, prio, due, status: 'open', completed: false, createdAt: now() }
    set(s => ({ ...s, todos: [t, ...s.todos] }))
    if (customerId) get().touchCustomer(customerId)
    return t
  },
  toggleTodo: (id) => {
    set(s => ({ ...s, todos: s.todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t) }))
    const t = get().todos.find(x => x.id === id)
    if (t?.customerId) get().touchCustomer(t.customerId)
  },
  updateTodoStatus: (id, status) => {
    set(s => ({ ...s, todos: s.todos.map(t => t.id === id ? { ...t, status, completed: status === 'done' } : t) }))
    const t = get().todos.find(x => x.id === id)
    if (t?.customerId) get().touchCustomer(t.customerId)
  },
  deleteTodo: (id) => set(s => ({ ...s, todos: s.todos.filter(t => t.id !== id) })),
  getTodos: (customerId) => get().todos.filter(t => t.customerId === customerId),

  addNote: (customerId) => {
    const n = { id: uid(), customerId: customerId ?? null, title: 'Neue Notiz', content: '', tag: '', createdAt: now(), updatedAt: now() }
    set(s => ({ ...s, notes: [n, ...s.notes], selectedNoteId: n.id }))
    if (customerId) get().touchCustomer(customerId)
    return n
  },
  updateNote: (id, data) => {
    set(s => ({ ...s, notes: s.notes.map(n => n.id === id ? { ...n, ...data, updatedAt: now() } : n) }))
    const n = get().notes.find(x => x.id === id)
    if (n?.customerId) get().touchCustomer(n.customerId)
  },
  deleteNote: (id) => {
    const n = get().notes.find(x => x.id === id)
    set(s => ({ ...s, notes: s.notes.filter(x => x.id !== id), selectedNoteId: s.selectedNoteId === id ? null : s.selectedNoteId }))
    if (n?.customerId) get().touchCustomer(n.customerId)
  },
  getNotes: (customerId) => get().notes.filter(n => n.customerId === customerId).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),

  addKpi: (customerId, data) => {
    const k = { id: uid(), customerId, date: now().slice(0, 10), createdAt: now(), ...data }
    set(s => ({ ...s, kpis: [...s.kpis, k] }))
    get().touchCustomer(customerId)
    return k
  },
  updateKpi: (id, data) => set(s => ({ ...s, kpis: s.kpis.map(k => k.id === id ? { ...k, ...data } : k) })),
  deleteKpi: (id) => set(s => ({ ...s, kpis: s.kpis.filter(k => k.id !== id) })),
  getKpis: (customerId) => get().kpis.filter(k => k.customerId === customerId),

  pinKpi: (customerId, kpiName) => set(s => ({
    ...s,
    customers: s.customers.map(c =>
      c.id === customerId
        ? { ...c, dashboardKpis: [...new Set([...(c.dashboardKpis ?? []), kpiName])] }
        : c
    ),
  })),
  unpinKpi: (customerId, kpiName) => set(s => ({
    ...s,
    customers: s.customers.map(c =>
      c.id === customerId
        ? { ...c, dashboardKpis: (c.dashboardKpis ?? []).filter(n => n !== kpiName) }
        : c
    ),
  })),

  addFolder: (customerId, parentId, name) => {
    const f = { id: uid(), customerId, parentId: parentId ?? null, name, createdAt: now() }
    set(s => ({ ...s, folders: [...s.folders, f] }))
    return f
  },
  renameFolder: (id, name) => set(s => ({ ...s, folders: s.folders.map(f => f.id === id ? { ...f, name } : f) })),
  deleteFolder: (id) => {
    const getAllChildIds = (fid, all) => {
      const children = all.filter(f => f.parentId === fid)
      return [fid, ...children.flatMap(c => getAllChildIds(c.id, all))]
    }
    set(s => {
      const ids = getAllChildIds(id, s.folders)
      return { ...s, folders: s.folders.filter(f => !ids.includes(f.id)), uploadedFiles: s.uploadedFiles.filter(f => !ids.includes(f.folderId)) }
    })
  },

  // tauriPath replaces data (base64 is gone)
  addFile: (customerId, folderId, { name, type, size, tauriPath }) => {
    const f = { id: uid(), customerId: customerId ?? null, folderId: folderId ?? null, name, type, size, tauriPath, createdAt: now() }
    set(s => ({ ...s, uploadedFiles: [f, ...s.uploadedFiles] }))
    return f
  },
  renameFile: (id, name) => set(s => ({ ...s, uploadedFiles: s.uploadedFiles.map(f => f.id === id ? { ...f, name } : f) })),
  deleteFile: (id) => set(s => ({ ...s, uploadedFiles: s.uploadedFiles.filter(f => f.id !== id) })),

  exportData: () => {
    const { customers, todos, notes, kpis, folders, uploadedFiles } = get()
    return JSON.stringify({ customers, todos, notes, kpis, folders, uploadedFiles }, null, 2)
  },
  importData: (json) => {
    const data = JSON.parse(json)
    if (!data.customers) throw new Error('Ungültiges Backup')
    set(s => ({
      ...s,
      customers: data.customers ?? [],
      todos: data.todos ?? [],
      notes: data.notes ?? [],
      kpis: data.kpis ?? [],
      folders: data.folders ?? [],
      uploadedFiles: (data.uploadedFiles ?? []).map(({ data: _drop, ...rest }) => rest),
      selectedId: data.customers?.[0]?.id ?? null,
      selectedNoteId: null,
      customerView: 'workflow',
    }))
  },
})
