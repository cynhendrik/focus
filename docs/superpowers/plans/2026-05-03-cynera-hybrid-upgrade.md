# Cynera Hybrid Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Cynera from a pure CRM into a hybrid CRM + personal workspace with Tauri-native file storage, a real dashboard, and a Tiptap rich-text editor with slash commands and `[[backlinks]]`.

**Architecture:** The monolithic Zustand store is split into three slices (data, ui, files). File binaries leave localStorage and move to Tauri AppData via the `fs` API; `uploadedFiles` stores metadata + `tauriPath` only. A new Workspace sidebar section uses `customerId = null` on existing note/todo models — no schema changes needed. The note editor is replaced with Tiptap (WYSIWYG, slash commands, `[[backlinks]]`, Markdown storage via `tiptap-markdown`).

**Tech Stack:** React 18, Zustand 4 (slice pattern), Tauri v1 `@tauri-apps/api/fs`, Tiptap (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-mention`, `tiptap-markdown`), Vitest + jsdom, `@testing-library/react`, `tippy.js`

---

## File Map

### New Files
| Path | Purpose |
|---|---|
| `src/store/dataSlice.js` | All entity state + actions (customers, todos, notes, kpis, folders, uploadedFiles metadata) |
| `src/store/uiSlice.js` | UI state (selectedId, activeTab, selectedNoteId, customerView, workspaceView, theme) |
| `src/store/filesSlice.js` | Tauri FS helpers (writeTauriFile, readTauriFile, deleteTauriFile) |
| `src/store/migration.js` | One-time base64 → Tauri FS migration |
| `src/components/editor/TiptapEditor.jsx` | Tiptap WYSIWYG editor with slash commands + backlinks |
| `src/components/editor/SlashMenu.jsx` | Slash command popup (keyboard-navigable) |
| `src/components/editor/BacklinksList.jsx` | `[[backlink]]` suggestion popup |
| `src/components/editor/slashCommands.js` | Slash command definitions |
| `src/components/editor/editor.css` | Cynera-themed editor styles |
| `src/test/setup.js` | Vitest setup: Tauri API mocks |
| `vitest.config.js` | Vitest config |

### Modified Files
| Path | Change |
|---|---|
| `src/store/index.js` | Compose slices, bump persist key to `cynera-os-v4`, add `workspaceView` to partialize |
| `src/App.jsx` | Add workspace routing, run migration on mount |
| `src/components/layout/Sidebar.jsx` | Add Workspace section below customer list |
| `src/components/ablage/AblagePane.jsx` | File upload/download/delete via Tauri FS instead of base64 |
| `src/components/notes/NotesPane.jsx` | Accept `customerId` prop, replace editor with TiptapEditor |
| `src/components/todos/TodoPane.jsx` | Accept `customerId` prop |
| `src/components/dashboard/DashboardPane.jsx` | Full implementation (replaces skeleton) |
| `src/components/CommandPalette.jsx` | Workspace actions + full-text note search |
| `package.json` | Add vitest, testing-library, tiptap packages |

---

## Phase 1 — Store Refactor + Tauri Filesystem

### Task 1: Set Up Vitest

**Files:**
- Create: `vitest.config.js`
- Create: `src/test/setup.js`
- Modify: `package.json`

- [ ] **Step 1: Install dev dependencies**

```bash
npm install --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: Create `vitest.config.js`**

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
  },
})
```

- [ ] **Step 3: Create `src/test/setup.js`**

```javascript
import '@testing-library/jest-dom'
import { vi } from 'vitest'

vi.mock('@tauri-apps/api/fs', () => ({
  writeBinaryFile: vi.fn().mockResolvedValue(undefined),
  readBinaryFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  removeFile: vi.fn().mockResolvedValue(undefined),
  createDir: vi.fn().mockResolvedValue(undefined),
  BaseDirectory: { AppData: 'AppData' },
}))

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn().mockResolvedValue('/mock/appdata'),
}))
```

- [ ] **Step 4: Add test script to `package.json`**

In `"scripts"`, add:
```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 5: Run to verify setup**

```bash
npm run test:run
```

Expected output: "No test files found" — confirms Vitest starts without errors.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.js src/test/setup.js package.json package-lock.json
git commit -m "chore: add Vitest + jsdom + testing-library with Tauri API mocks"
```

---

### Task 2: Create Store Slices

**Files:**
- Create: `src/store/dataSlice.js`
- Create: `src/store/uiSlice.js`
- Create: `src/store/filesSlice.js`
- Create: `src/test/store/dataSlice.test.js`

- [ ] **Step 1: Write failing tests for dataSlice**

Create `src/test/store/dataSlice.test.js`:

```javascript
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
})
```

- [ ] **Step 2: Run to verify failure**

```bash
npm run test:run src/test/store/dataSlice.test.js
```

Expected: FAIL — "Cannot find module '../../store/dataSlice'"

- [ ] **Step 3: Create `src/store/dataSlice.js`**

```javascript
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
    set(s => ({ customers: [c, ...s.customers], selectedId: c.id }))
    return c
  },
  updateCustomer: (id, data) => set(s => ({
    customers: s.customers.map(c => c.id === id ? { ...c, ...data, updatedAt: now() } : c),
  })),
  deleteCustomer: (id) => set(s => {
    const remaining = s.customers.filter(c => c.id !== id)
    return {
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
  selectCustomer: (id) => set({ selectedId: id, selectedNoteId: null, customerView: 'workflow' }),
  touchCustomer: (id) => {
    if (!id) return
    set(s => ({ customers: s.customers.map(c => c.id === id ? { ...c, updatedAt: now() } : c) }))
  },

  addTodo: (customerId, text, prio = 'mid', due = null) => {
    const t = { id: uid(), customerId: customerId ?? null, text, prio, due, completed: false, createdAt: now() }
    set(s => ({ todos: [t, ...s.todos] }))
    if (customerId) get().touchCustomer(customerId)
    return t
  },
  toggleTodo: (id) => {
    set(s => ({ todos: s.todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t) }))
    const t = get().todos.find(x => x.id === id)
    if (t?.customerId) get().touchCustomer(t.customerId)
  },
  deleteTodo: (id) => set(s => ({ todos: s.todos.filter(t => t.id !== id) })),
  getTodos: (customerId) => get().todos.filter(t => t.customerId === customerId),

  addNote: (customerId) => {
    const n = { id: uid(), customerId: customerId ?? null, title: 'Neue Notiz', content: '', tag: '', createdAt: now(), updatedAt: now() }
    set(s => ({ notes: [n, ...s.notes], selectedNoteId: n.id }))
    if (customerId) get().touchCustomer(customerId)
    return n
  },
  updateNote: (id, data) => {
    set(s => ({ notes: s.notes.map(n => n.id === id ? { ...n, ...data, updatedAt: now() } : n) }))
    const n = get().notes.find(x => x.id === id)
    if (n?.customerId) get().touchCustomer(n.customerId)
  },
  deleteNote: (id) => {
    const n = get().notes.find(x => x.id === id)
    set(s => ({ notes: s.notes.filter(x => x.id !== id), selectedNoteId: s.selectedNoteId === id ? null : s.selectedNoteId }))
    if (n?.customerId) get().touchCustomer(n.customerId)
  },
  getNotes: (customerId) => get().notes.filter(n => n.customerId === customerId).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),

  addKpi: (customerId, data) => {
    const k = { id: uid(), customerId, date: now().slice(0, 10), createdAt: now(), ...data }
    set(s => ({ kpis: [...s.kpis, k] }))
    get().touchCustomer(customerId)
    return k
  },
  updateKpi: (id, data) => set(s => ({ kpis: s.kpis.map(k => k.id === id ? { ...k, ...data } : k) })),
  deleteKpi: (id) => set(s => ({ kpis: s.kpis.filter(k => k.id !== id) })),
  getKpis: (customerId) => get().kpis.filter(k => k.customerId === customerId),

  addFolder: (customerId, parentId, name) => {
    const f = { id: uid(), customerId, parentId: parentId ?? null, name, createdAt: now() }
    set(s => ({ folders: [...s.folders, f] }))
    return f
  },
  renameFolder: (id, name) => set(s => ({ folders: s.folders.map(f => f.id === id ? { ...f, name } : f) })),
  deleteFolder: (id) => {
    const getAllChildIds = (fid, all) => {
      const children = all.filter(f => f.parentId === fid)
      return [fid, ...children.flatMap(c => getAllChildIds(c.id, all))]
    }
    set(s => {
      const ids = getAllChildIds(id, s.folders)
      return { folders: s.folders.filter(f => !ids.includes(f.id)), uploadedFiles: s.uploadedFiles.filter(f => !ids.includes(f.folderId)) }
    })
  },

  // tauriPath replaces data (base64 is gone)
  addFile: (customerId, folderId, { name, type, size, tauriPath }) => {
    const f = { id: uid(), customerId: customerId ?? null, folderId: folderId ?? null, name, type, size, tauriPath, createdAt: now() }
    set(s => ({ uploadedFiles: [f, ...s.uploadedFiles] }))
    return f
  },
  renameFile: (id, name) => set(s => ({ uploadedFiles: s.uploadedFiles.map(f => f.id === id ? { ...f, name } : f) })),
  deleteFile: (id) => set(s => ({ uploadedFiles: s.uploadedFiles.filter(f => f.id !== id) })),

  exportData: () => {
    const { customers, todos, notes, kpis, folders, uploadedFiles } = get()
    const json = JSON.stringify({ customers, todos, notes, kpis, folders, uploadedFiles }, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cynera-export-${now().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  },
  importData: (json) => {
    const data = JSON.parse(json)
    if (!data.customers) throw new Error('Ungültiges Backup')
    set({
      customers: data.customers ?? [],
      todos: data.todos ?? [],
      notes: data.notes ?? [],
      kpis: data.kpis ?? [],
      folders: data.folders ?? [],
      uploadedFiles: (data.uploadedFiles ?? []).map(({ data: _drop, ...rest }) => rest),
      selectedId: data.customers?.[0]?.id ?? null,
      selectedNoteId: null,
      customerView: 'workflow',
    })
  },
})
```

- [ ] **Step 4: Create `src/store/uiSlice.js`**

```javascript
export const createUiSlice = (set) => ({
  selectedId: null,
  activeTab: 'todos',
  selectedNoteId: null,
  customerView: 'workflow',
  workspaceView: 'notes',
  theme: 'dark',

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedNoteId: (id) => set({ selectedNoteId: id }),
  setCustomerView: (view) => set({ customerView: view }),
  setWorkspaceView: (view) => set({ workspaceView: view }),
  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set(s => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
})
```

- [ ] **Step 5: Create `src/store/filesSlice.js`**

```javascript
import { writeBinaryFile, readBinaryFile, removeFile, createDir, BaseDirectory } from '@tauri-apps/api/fs'

export const createFilesSlice = () => ({
  writeTauriFile: async (tauriPath, uint8Array) => {
    const dir = tauriPath.substring(0, tauriPath.lastIndexOf('/'))
    await createDir(dir, { dir: BaseDirectory.AppData, recursive: true })
    await writeBinaryFile(tauriPath, uint8Array, { dir: BaseDirectory.AppData })
  },
  readTauriFile: async (tauriPath) => {
    return readBinaryFile(tauriPath, { dir: BaseDirectory.AppData })
  },
  deleteTauriFile: async (tauriPath) => {
    await removeFile(tauriPath, { dir: BaseDirectory.AppData }).catch(() => {})
  },
})
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm run test:run src/test/store/dataSlice.test.js
```

Expected: 6 PASS

- [ ] **Step 7: Commit**

```bash
git add src/store/dataSlice.js src/store/uiSlice.js src/store/filesSlice.js src/test/store/dataSlice.test.js
git commit -m "feat: Zustand store slices — dataSlice, uiSlice, filesSlice"
```

---

### Task 3: Refactor Store Index

**Files:**
- Modify: `src/store/index.js`

- [ ] **Step 1: Replace `src/store/index.js` with slice composition**

```javascript
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createDataSlice } from './dataSlice'
import { createUiSlice } from './uiSlice'
import { createFilesSlice } from './filesSlice'

export const useStore = create(
  persist(
    (...args) => ({
      ...createDataSlice(...args),
      ...createUiSlice(...args),
      ...createFilesSlice(...args),
    }),
    {
      name: 'cynera-os-v4',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        customers: s.customers,
        todos: s.todos,
        notes: s.notes,
        kpis: s.kpis,
        folders: s.folders,
        uploadedFiles: s.uploadedFiles,
        selectedId: s.selectedId,
        activeTab: s.activeTab,
        workspaceView: s.workspaceView,
        theme: s.theme,
      }),
    }
  )
)
```

Note: `selectedNoteId` and `customerView` are intentionally not persisted (same behaviour as before).

- [ ] **Step 2: Run dev server and verify no regressions**

```bash
npm run tauri dev
```

Click through the app: add a todo, open notes, switch between customers. All existing functionality should work. Open browser devtools → Application → Local Storage → verify key is `cynera-os-v4`.

- [ ] **Step 3: Commit**

```bash
git add src/store/index.js
git commit -m "refactor: compose Zustand store from slices, bump persist key to cynera-os-v4"
```

---

### Task 4: File Migration Logic

**Files:**
- Create: `src/store/migration.js`
- Create: `src/test/store/migration.test.js`

- [ ] **Step 1: Write failing tests**

Create `src/test/store/migration.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { migrateBase64Files } from '../../store/migration'
import * as fs from '@tauri-apps/api/fs'

describe('migrateBase64Files', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes base64 file to Tauri AppData, returns record with tauriPath and no data', async () => {
    const file = {
      id: 'f1', customerId: 'c1', folderId: null,
      name: 'photo.png', type: 'image/png', size: 100,
      data: 'data:image/png;base64,iVBORw0KGgo=',
    }
    const results = await migrateBase64Files([file])
    expect(fs.createDir).toHaveBeenCalledWith('cynera/files/c1', expect.objectContaining({ recursive: true }))
    expect(fs.writeBinaryFile).toHaveBeenCalled()
    expect(results[0].tauriPath).toBe('cynera/files/c1/f1.png')
    expect(results[0].data).toBeUndefined()
  })

  it('skips files that already have tauriPath', async () => {
    const file = { id: 'f2', customerId: 'c1', name: 'doc.pdf', tauriPath: 'cynera/files/c1/f2.pdf' }
    const results = await migrateBase64Files([file])
    expect(fs.writeBinaryFile).not.toHaveBeenCalled()
    expect(results[0].tauriPath).toBe('cynera/files/c1/f2.pdf')
  })

  it('uses workspace-files dir when customerId is null', async () => {
    const file = { id: 'f3', customerId: null, name: 'note.txt', type: 'text/plain', size: 5, data: 'data:text/plain;base64,aGVsbG8=' }
    await migrateBase64Files([file])
    expect(fs.createDir).toHaveBeenCalledWith('cynera/workspace-files', expect.any(Object))
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
npm run test:run src/test/store/migration.test.js
```

Expected: FAIL — "Cannot find module '../../store/migration'"

- [ ] **Step 3: Create `src/store/migration.js`**

```javascript
import { writeBinaryFile, createDir, BaseDirectory } from '@tauri-apps/api/fs'

function dataUrlToUint8Array(dataUrl) {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function migrateBase64Files(uploadedFiles) {
  const results = []
  for (const file of uploadedFiles) {
    if (file.tauriPath || !file.data) {
      results.push(file)
      continue
    }
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
    const dir = file.customerId ? `cynera/files/${file.customerId}` : 'cynera/workspace-files'
    const tauriPath = `${dir}/${file.id}.${ext}`
    await createDir(dir, { dir: BaseDirectory.AppData, recursive: true })
    await writeBinaryFile(tauriPath, dataUrlToUint8Array(file.data), { dir: BaseDirectory.AppData })
    const { data: _removed, ...meta } = file
    results.push({ ...meta, tauriPath })
  }
  return results
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run src/test/store/migration.test.js
```

Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/migration.js src/test/store/migration.test.js
git commit -m "feat: base64-to-Tauri-filesystem migration utility"
```

---

### Task 5: Update AblagePane for Tauri File I/O

**Files:**
- Modify: `src/components/ablage/AblagePane.jsx`

- [ ] **Step 1: Read AblagePane to find all base64 usages**

```bash
grep -n "data:" src/components/ablage/AblagePane.jsx
grep -n "readAsDataURL\|reader\." src/components/ablage/AblagePane.jsx
grep -n "\.data" src/components/ablage/AblagePane.jsx
```

Find: (a) FileReader upload block, (b) download link creation using `file.data`, (c) image preview using `file.data` as src.

- [ ] **Step 2: Add Tauri FS imports and store selectors at top of AblagePane**

At the top of `AblagePane.jsx`, after existing imports:

```javascript
import { v4 as uid } from 'uuid'
```

In the component body, add these store selectors alongside existing ones:

```javascript
const writeTauriFile = useStore(s => s.writeTauriFile)
const readTauriFile = useStore(s => s.readTauriFile)
const deleteTauriFile = useStore(s => s.deleteTauriFile)
```

- [ ] **Step 3: Replace FileReader upload with Tauri write**

Find the section where files are processed (typically in a drop handler or input `onChange`). It will look like:
```javascript
const reader = new FileReader()
reader.onload = (e) => addFile(selectedId, currentFolderId, { name, type, size, data: e.target.result })
reader.readAsDataURL(file)
```

Replace with:
```javascript
const processFile = async (file) => {
  const fileId = uid()
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
  const dir = selectedId ? `cynera/files/${selectedId}` : 'cynera/workspace-files'
  const tauriPath = `${dir}/${fileId}.${ext}`
  const buffer = await file.arrayBuffer()
  await writeTauriFile(tauriPath, new Uint8Array(buffer))
  addFile(selectedId, currentFolderId, { name: file.name, type: file.type, size: file.size, tauriPath })
}
```

Apply `processFile` in both the drag-drop handler and the file input `onChange` handler. Both handlers loop over files — wrap in `Promise.all(Array.from(files).map(processFile))`.

- [ ] **Step 4: Replace download from base64 with Tauri read**

Find the download handler (uses `file.data` or `URL.createObjectURL`). Replace:

```javascript
const handleDownload = async (file) => {
  const bytes = await readTauriFile(file.tauriPath)
  const blob = new Blob([bytes], { type: file.type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 5: Replace image preview (base64 src → object URL)**

Find where image thumbnails are rendered. Replace inline `src={file.data}` with a component that loads on mount:

```javascript
function ImagePreview({ file, readTauriFile, style }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    if (!file.tauriPath) return
    let url
    readTauriFile(file.tauriPath).then(bytes => {
      const blob = new Blob([bytes], { type: file.type })
      url = URL.createObjectURL(blob)
      setSrc(url)
    }).catch(() => {})
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [file.tauriPath])
  return src ? <img src={src} style={style} alt={file.name} /> : null
}
```

Use `<ImagePreview file={f} readTauriFile={readTauriFile} style={...} />` where image thumbnails appeared.

- [ ] **Step 6: Add Tauri file removal on delete**

Find the delete file handler. After removing from store, also delete from disk:

```javascript
const handleDeleteFile = async (file) => {
  if (file.tauriPath) await deleteTauriFile(file.tauriPath)
  deleteFile(file.id)
}
```

- [ ] **Step 7: Smoke test upload, download, delete**

```bash
npm run tauri dev
```

Select a customer → Ablage tab. Upload a PNG and a PDF. Verify they appear. Download the PNG, verify the file opens. Delete the PDF, verify it disappears.

- [ ] **Step 8: Commit**

```bash
git add src/components/ablage/AblagePane.jsx
git commit -m "feat: AblagePane file I/O via Tauri filesystem — no more base64 in localStorage"
```

---

### Task 6: Run Migration on App Startup

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add migration effect to App component**

In `src/App.jsx`, add this import at the top:

```javascript
import { migrateBase64Files } from './store/migration'
```

Inside the `App` function (or the root component), add a `useEffect` that runs once:

```javascript
const uploadedFiles = useStore(s => s.uploadedFiles)

useEffect(() => {
  const needsMigration = uploadedFiles.some(f => f.data && !f.tauriPath)
  if (!needsMigration) return

  migrateBase64Files(uploadedFiles).then(migrated => {
    useStore.setState(s => ({ ...s, uploadedFiles: migrated }))
  }).catch(err => console.error('File migration failed:', err))
}, []) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 2: Verify migration runs (if you have existing data)**

Open devtools → Application → Local Storage → `cynera-os-v4`. If any `uploadedFiles` entries have a `data` field, reload the page. After reload, `data` should be gone and `tauriPath` should be set.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: run base64-to-filesystem migration on app startup"
```

---

## Phase 2 — Dashboard

### Task 7: Implement DashboardPane

**Files:**
- Modify: `src/components/dashboard/DashboardPane.jsx`

- [ ] **Step 1: Read current DashboardPane to note the export name and any imports**

```bash
grep -n "export\|import" src/components/dashboard/DashboardPane.jsx
```

Note the exact export syntax (e.g., `export function DashboardPane` or `export default`) to preserve it.

- [ ] **Step 2: Replace DashboardPane with real implementation**

Replace the entire file contents (preserve the same export style found in Step 1):

```jsx
import { useMemo } from 'react'
import { useStore } from '../../store'
import { formatDistanceToNow, isToday, parseISO, subDays } from 'date-fns'
import { de } from 'date-fns/locale'

function KpiCard({ label, value, color, bg }) {
  return (
    <div style={{ background: bg, border: `1px solid ${color}40`, borderRadius: 10, padding: '16px 20px' }}>
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, opacity: .55, marginTop: 5 }}>{label}</div>
    </div>
  )
}

function ActivityRow({ icon, text, time }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 12, flex: 1, opacity: .8 }}>{text}</span>
      <span style={{ fontSize: 11, opacity: .35, whiteSpace: 'nowrap' }}>{time}</span>
    </div>
  )
}

export function DashboardPane() {
  const customers = useStore(s => s.customers)
  const todos = useStore(s => s.todos)
  const notes = useStore(s => s.notes)

  const openCustomerTodos = useMemo(() => todos.filter(t => !t.completed && t.customerId !== null), [todos])
  const dueTodayCount = useMemo(() => openCustomerTodos.filter(t => t.due && isToday(parseISO(t.due))).length, [openCustomerTodos])
  const activeCustomers = useMemo(() => {
    const cutoff = subDays(new Date(), 30).toISOString()
    return customers.filter(c => c.updatedAt >= cutoff)
  }, [customers])

  const recentActivity = useMemo(() => {
    const events = [
      ...customers.map(c => ({ time: c.updatedAt, icon: '👤', text: `Kunde: ${c.name}` })),
      ...notes.filter(n => n.customerId).map(n => {
        const customer = customers.find(c => c.id === n.customerId)
        return { time: n.updatedAt, icon: '📝', text: `Notiz: ${n.title || 'Unbenannt'} · ${customer?.name ?? ''}` }
      }),
      ...todos.filter(t => t.completed && t.customerId).map(t => {
        const customer = customers.find(c => c.id === t.customerId)
        return { time: t.createdAt, icon: '✓', text: `Todo erledigt: ${t.text} · ${customer?.name ?? ''}` }
      }),
    ]
    return events.sort((a, b) => b.time.localeCompare(a.time)).slice(0, 8)
  }, [customers, notes, todos])

  const highPrioTodos = useMemo(() =>
    openCustomerTodos
      .filter(t => t.prio === 'high' || (t.due && parseISO(t.due) < new Date()))
      .slice(0, 6),
    [openCustomerTodos]
  )

  const panelStyle = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 10,
    padding: 16,
  }

  return (
    <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        <KpiCard label="Offene Todos" value={openCustomerTodos.length} color="#FF6B82" bg="rgba(120,0,26,0.12)" />
        <KpiCard label="Aktive Kunden" value={activeCustomers.length} color="#60A5FA" bg="rgba(59,130,246,0.1)" />
        <KpiCard label="Fällig heute" value={dueTodayCount} color="#F59E0B" bg="rgba(245,158,11,0.1)" />
        <KpiCard label="Notizen" value={notes.filter(n => n.customerId).length} color="#22C55E" bg="rgba(34,197,94,0.1)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={panelStyle}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', opacity: .35, marginBottom: 10 }}>LETZTE AKTIVITÄTEN</div>
          {recentActivity.length === 0
            ? <div style={{ fontSize: 12, opacity: .35 }}>Noch keine Aktivitäten</div>
            : recentActivity.map((item, i) => (
              <ActivityRow key={i} icon={item.icon} text={item.text}
                time={formatDistanceToNow(parseISO(item.time), { locale: de, addSuffix: true })} />
            ))
          }
        </div>

        <div style={panelStyle}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', opacity: .35, marginBottom: 10 }}>HIGH PRIORITY</div>
          {highPrioTodos.length === 0
            ? <div style={{ fontSize: 12, opacity: .35 }}>Keine dringenden Todos</div>
            : highPrioTodos.map(t => {
              const customer = customers.find(c => c.id === t.customerId)
              const isOverdue = t.due && parseISO(t.due) < new Date()
              return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ fontSize: 12, flexShrink: 0 }}>{isOverdue ? '🔴' : '🟡'}</span>
                  <span style={{ fontSize: 12, flex: 1, opacity: .8 }}>{t.text}</span>
                  <span style={{ fontSize: 11, opacity: .35 }}>{customer?.name ?? ''}</span>
                </div>
              )
            })
          }
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify dashboard in dev mode**

```bash
npm run tauri dev
```

Select a customer → Dashboard tab. Verify KPI cards show real counts, activity feed populates, and high-priority panel shows todos.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/DashboardPane.jsx
git commit -m "feat: implement DashboardPane with real KPI cards, activity feed, and high-priority todos"
```

---

## Phase 3 — Personal Workspace

### Task 8: Add Workspace Section to Sidebar

**Files:**
- Modify: `src/components/layout/Sidebar.jsx`

- [ ] **Step 1: Read Sidebar.jsx to find where the customer list ends and footer begins**

```bash
grep -n "Neuer Kunde\|footer\|theme\|return\|Footer" src/components/layout/Sidebar.jsx | head -30
```

- [ ] **Step 2: Add workspace store selectors to Sidebar**

After existing `useStore` calls at the top of the Sidebar component, add:

```javascript
const workspaceView = useStore(s => s.workspaceView)
const setWorkspaceView = useStore(s => s.setWorkspaceView)
const selectedId = useStore(s => s.selectedId)
const selectCustomer = useStore(s => s.selectCustomer)
const workspaceNotesCount = useStore(s => s.notes.filter(n => n.customerId === null).length)
const workspaceTodosCount = useStore(s => s.todos.filter(t => t.customerId === null && !t.completed).length)
```

- [ ] **Step 3: Add workspace section in JSX after the customer list and "Neuer Kunde" button**

Find the closing tag after the "Neuer Kunde" button and insert before the footer:

```jsx
{/* Workspace Section */}
<div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', margin: '10px 0 8px' }} />

<div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', opacity: .3, marginBottom: 5, paddingLeft: 2 }}>
  WORKSPACE
</div>

{[
  { key: 'notes', icon: '📓', label: 'Meine Notizen', count: workspaceNotesCount },
  { key: 'todos', icon: '✓', label: 'Meine Todos', count: workspaceTodosCount },
].map(item => {
  const isActive = !selectedId && workspaceView === item.key
  return (
    <div
      key={item.key}
      onClick={() => {
        selectCustomer(null)
        setWorkspaceView(item.key)
      }}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 8px', borderRadius: 7, cursor: 'pointer', marginBottom: 2,
        background: isActive ? 'rgba(59,130,246,0.1)' : 'transparent',
        border: isActive ? '1px solid rgba(59,130,246,0.22)' : '1px solid transparent',
        transition: 'background 0.1s',
      }}
    >
      <span style={{ fontSize: 14 }}>{item.icon}</span>
      <span style={{ fontSize: 12, flex: 1 }}>{item.label}</span>
      {item.count > 0 && (
        <span style={{ fontSize: 10, background: 'rgba(59,130,246,0.18)', color: '#60A5FA', borderRadius: 3, padding: '1px 5px' }}>
          {item.count}
        </span>
      )}
    </div>
  )
})}
```

- [ ] **Step 4: Run dev server and verify sidebar**

```bash
npm run tauri dev
```

Verify: divider appears below customer list, "Meine Notizen" and "Meine Todos" show below, clicking them highlights correctly.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Sidebar.jsx
git commit -m "feat: add personal workspace section to Sidebar"
```

---

### Task 9: Workspace Routing in App.jsx + Pane Props

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/notes/NotesPane.jsx`
- Modify: `src/components/todos/TodoPane.jsx`

- [ ] **Step 1: Read App.jsx from line 80 onward to find the main content rendering logic**

```bash
grep -n "customerView\|selectedId\|DashboardPane\|WorkflowPane\|AblagePane" src/App.jsx
```

- [ ] **Step 2: Add workspaceView selector and workspace render branch in App.jsx**

Add to the store destructuring:

```javascript
const workspaceView = useStore(s => s.workspaceView)
```

In the main content area, add a workspace branch. Find where the current customer content is rendered (typically gated on `selectedId`) and wrap like this:

```jsx
{/* Main content */}
{!selectedId ? (
  // Workspace mode
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <div style={{ padding: '14px 20px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>
        {workspaceView === 'notes' ? '📓 Meine Notizen' : '✓ Meine Todos'}
      </div>
      <div style={{ fontSize: 11, opacity: .35, marginTop: 2, marginBottom: 12 }}>Persönlicher Workspace</div>
    </div>
    {workspaceView === 'notes'
      ? <NotesPane workspaceMode />
      : <TodoPane workspaceMode />
    }
  </div>
) : (
  // existing customer content JSX unchanged
  <>
    <TopBar />
    <CustomerNav />
    {/* existing views */}
  </>
)}
```

- [ ] **Step 3: Update NotesPane to accept workspaceMode prop**

At the top of the `NotesPane` function:

```javascript
export function NotesPane({ workspaceMode = false }) {
  const storeSelectedId = useStore(s => s.selectedId)
  const customerId = workspaceMode ? null : storeSelectedId
  const notes = useStore(s =>
    s.notes
      .filter(n => n.customerId === customerId)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  )
  // rest of component uses `customerId` and `notes` — no other changes needed
```

Every call to `addNote()` inside NotesPane must pass `customerId`:

```javascript
// was: addNote(selectedId)
addNote(customerId)
```

- [ ] **Step 4: Update TodoPane to accept workspaceMode prop**

Same pattern in `TodoPane`:

```javascript
export function TodoPane({ workspaceMode = false }) {
  const storeSelectedId = useStore(s => s.selectedId)
  const customerId = workspaceMode ? null : storeSelectedId
  const todos = useStore(s => s.todos.filter(t => t.customerId === customerId))
  // Every addTodo call: addTodo(customerId, text, prio, due)
```

- [ ] **Step 5: Verify workspace flow end-to-end**

```bash
npm run tauri dev
```

1. Click "Meine Notizen" → empty note list with workspace header
2. Create a note → appears in list, editor opens
3. Click "Meine Todos" → empty todo list
4. Add a todo → appears in list
5. Click a customer → customer view restores correctly
6. Badge counts in sidebar update

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/components/notes/NotesPane.jsx src/components/todos/TodoPane.jsx
git commit -m "feat: workspace routing in App.jsx, NotesPane + TodoPane accept workspaceMode prop"
```

---

### Task 10: Extend CommandPalette With Workspace Actions

**Files:**
- Modify: `src/components/CommandPalette.jsx`

- [ ] **Step 1: Read the actions section of CommandPalette**

```bash
grep -n "action\|Actions\|setActiveTab\|exportData" src/components/CommandPalette.jsx | head -30
```

- [ ] **Step 2: Add workspace store selectors**

In CommandPalette, add to `useStore` calls:

```javascript
const setWorkspaceView = useStore(s => s.setWorkspaceView)
const selectCustomer = useStore(s => s.selectCustomer)
const addNote = useStore(s => s.addNote)
const addTodo = useStore(s => s.addTodo)
```

- [ ] **Step 3: Add workspace actions to the actions array**

Find where actions like "Neue Aufgabe" or tab-switching actions are defined. Add:

```javascript
{ label: 'Meine Notizen öffnen', icon: '📓', action: () => { selectCustomer(null); setWorkspaceView('notes'); close() } },
{ label: 'Meine Todos öffnen', icon: '✓', action: () => { selectCustomer(null); setWorkspaceView('todos'); close() } },
{ label: 'Neue persönliche Notiz', icon: '📓', action: () => { selectCustomer(null); setWorkspaceView('notes'); addNote(null); close() } },
{ label: 'Neues persönliches Todo', icon: '✓', action: () => { selectCustomer(null); setWorkspaceView('todos'); close() } },
```

Where `close` is however the palette closes itself (likely `setOpen(false)` or `onClose()`).

- [ ] **Step 4: Verify workspace actions appear in palette**

```bash
npm run tauri dev
```

Press Ctrl+K, type "workspace" or "notiz". Verify workspace actions appear and work when selected.

- [ ] **Step 5: Commit**

```bash
git add src/components/CommandPalette.jsx
git commit -m "feat: add workspace actions to command palette"
```

---

## Phase 4 — Tiptap Rich Editor

### Task 11: Install Tiptap + tippy.js

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Tiptap packages**

```bash
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-mention @tiptap/suggestion tiptap-markdown tippy.js
```

- [ ] **Step 2: Verify install**

```bash
npm ls @tiptap/react tiptap-markdown tippy.js
```

Expected: all three listed without errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add Tiptap + tiptap-markdown + tippy.js"
```

---

### Task 12: Build TiptapEditor With Slash Commands

**Files:**
- Create: `src/components/editor/editor.css`
- Create: `src/components/editor/slashCommands.js`
- Create: `src/components/editor/SlashMenu.jsx`
- Create: `src/components/editor/TiptapEditor.jsx`

- [ ] **Step 1: Create `src/components/editor/editor.css`**

```css
.tiptap-editor { outline: none; min-height: 160px; font-size: 14px; line-height: 1.75; color: var(--text1, #F2F5F8); font-family: 'Plus Jakarta Sans', sans-serif; }
.tiptap-editor p { margin: 0 0 6px 0; }
.tiptap-editor h1 { font-size: 22px; font-weight: 800; margin: 18px 0 8px; }
.tiptap-editor h2 { font-size: 18px; font-weight: 700; margin: 14px 0 6px; }
.tiptap-editor h3 { font-size: 15px; font-weight: 600; margin: 10px 0 4px; }
.tiptap-editor code { background: rgba(255,255,255,0.08); border-radius: 4px; padding: 1px 5px; font-family: monospace; font-size: 12px; }
.tiptap-editor pre { background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 14px; overflow-x: auto; margin: 10px 0; }
.tiptap-editor pre code { background: none; padding: 0; }
.tiptap-editor blockquote { border-left: 3px solid rgba(200,30,50,0.5); padding-left: 14px; opacity: .7; margin: 8px 0; }
.tiptap-editor ul, .tiptap-editor ol { padding-left: 20px; margin: 4px 0; }
.tiptap-editor li { margin: 2px 0; }
.tiptap-editor hr { border: none; border-top: 1px solid rgba(255,255,255,0.09); margin: 14px 0; }
.tiptap-editor table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px; }
.tiptap-editor th, .tiptap-editor td { border: 1px solid rgba(255,255,255,0.1); padding: 6px 10px; }
.tiptap-editor th { background: rgba(255,255,255,0.05); font-weight: 600; }
.tiptap-editor .mention { background: rgba(200,30,50,0.18); border: 1px solid rgba(200,30,50,0.35); border-radius: 4px; padding: 1px 5px; color: #FF6B82; cursor: pointer; }
.tiptap-editor p.is-editor-empty:first-child::before { content: attr(data-placeholder); float: left; color: rgba(255,255,255,0.22); pointer-events: none; height: 0; }
```

- [ ] **Step 2: Create `src/components/editor/slashCommands.js`**

```javascript
export const SLASH_COMMANDS = [
  { title: 'Überschrift 1', description: 'Große Überschrift', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run() },
  { title: 'Überschrift 2', description: 'Mittlere Überschrift', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run() },
  { title: 'Überschrift 3', description: 'Kleine Überschrift', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run() },
  { title: 'Aufzählung', description: 'Unsortierte Liste', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run() },
  { title: 'Nummerierung', description: 'Nummerierte Liste', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run() },
  { title: 'Code-Block', description: 'Code-Snippet', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run() },
  { title: 'Zitat', description: 'Blockquote', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run() },
  { title: 'Trennlinie', description: 'Horizontale Linie', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run() },
]
```

- [ ] **Step 3: Create `src/components/editor/SlashMenu.jsx`**

```jsx
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'

export const SlashMenu = forwardRef(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => setSelectedIndex(0), [items])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') { setSelectedIndex(i => (i + items.length - 1) % items.length); return true }
      if (event.key === 'ArrowDown') { setSelectedIndex(i => (i + 1) % items.length); return true }
      if (event.key === 'Enter') { if (items[selectedIndex]) command(items[selectedIndex]); return true }
      return false
    },
  }))

  return (
    <div style={{ background: 'var(--bg2, #1c1c1c)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 6, minWidth: 220, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 1000 }}>
      {items.length === 0
        ? <div style={{ padding: '8px 10px', fontSize: 12, opacity: .4 }}>Keine Befehle</div>
        : items.map((item, i) => (
          <div key={i} onClick={() => command(item)} style={{ padding: '7px 10px', borderRadius: 7, cursor: 'pointer', background: i === selectedIndex ? 'rgba(255,255,255,0.07)' : 'transparent' }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{item.title}</div>
            <div style={{ fontSize: 11, opacity: .4 }}>{item.description}</div>
          </div>
        ))
      }
    </div>
  )
})
SlashMenu.displayName = 'SlashMenu'
```

- [ ] **Step 4: Create `src/components/editor/TiptapEditor.jsx`**

```jsx
import { useEditor, EditorContent, ReactRenderer } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { Mention } from '@tiptap/extension-mention'
import { Markdown } from 'tiptap-markdown'
import tippy from 'tippy.js'
import 'tippy.js/dist/tippy.css'
import { SLASH_COMMANDS } from './slashCommands'
import { SlashMenu } from './SlashMenu'
import './editor.css'

function makeSuggestionPopup(Component) {
  return {
    render: () => {
      let component, popup
      return {
        onStart: (props) => {
          component = new ReactRenderer(Component, { props, editor: props.editor })
          popup = tippy('body', { getReferenceClientRect: props.clientRect, appendTo: () => document.body, content: component.element, showOnCreate: true, interactive: true, trigger: 'manual', placement: 'bottom-start' })
        },
        onUpdate: (props) => { component?.updateProps(props); popup?.[0]?.setProps({ getReferenceClientRect: props.clientRect }) },
        onKeyDown: (props) => {
          if (props.event.key === 'Escape') { popup?.[0]?.hide(); return true }
          return component?.ref?.onKeyDown(props) ?? false
        },
        onExit: () => { popup?.[0]?.destroy(); component?.destroy() },
      }
    },
  }
}

const SlashCommandsExtension = Extension.create({
  name: 'slashCommands',
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        command: ({ editor, range, props }) => props.command({ editor, range }),
        items: ({ query }) => SLASH_COMMANDS.filter(c => c.title.toLowerCase().includes(query.toLowerCase())),
        ...makeSuggestionPopup(SlashMenu),
      }),
    ]
  },
})

export function TiptapEditor({ content, onChange, placeholder = 'Schreibe etwas... (/ für Befehle, [[ für Verlinkungen)', allNotes = [], allCustomers = [] }) {
  const mentionItems = [
    ...allNotes.map(n => ({ id: n.id, label: n.title || 'Unbenannt', subtitle: 'Notiz' })),
    ...allCustomers.map(c => ({ id: `c-${c.id}`, label: c.name, subtitle: c.company || 'Kunde' })),
  ]

  const editor = useEditor({
    extensions: [
      StarterKit,
      SlashCommandsExtension,
      Markdown.configure({ html: false, transformPastedText: true, transformCopiedText: true }),
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        renderLabel: ({ node }) => `[[${node.attrs.label}]]`,
        suggestion: {
          char: '[[',
          items: ({ query }) => mentionItems.filter(m => m.label.toLowerCase().includes(query.toLowerCase())).slice(0, 8),
          command: ({ editor, range, props }) => {
            editor.chain().focus().deleteRange(range).insertContent(`[[${props.label}]]`).run()
          },
          ...makeSuggestionPopup(SlashMenu),
        },
      }),
    ],
    content: content || '',
    editorProps: {
      attributes: { class: 'tiptap-editor', 'data-placeholder': placeholder },
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.storage.markdown.getMarkdown())
    },
  })

  return (
    <EditorContent
      editor={editor}
      style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}
    />
  )
}
```

Note: `tiptap-markdown` stores and returns Markdown strings. `content` prop accepts the existing Markdown strings from the store — no migration of note content needed.

- [ ] **Step 5: Verify component compiles**

```bash
npm run tauri dev
```

Dev server should start without import errors. (Editor not yet integrated into NotesPane.)

- [ ] **Step 6: Commit**

```bash
git add src/components/editor/editor.css src/components/editor/slashCommands.js src/components/editor/SlashMenu.jsx src/components/editor/TiptapEditor.jsx
git commit -m "feat: TiptapEditor with slash commands, [[backlink]] suggestions, Markdown storage"
```

---

### Task 13: Add BacklinksList Component

**Files:**
- Create: `src/components/editor/BacklinksList.jsx`
- Modify: `src/components/editor/TiptapEditor.jsx`

- [ ] **Step 1: Create `src/components/editor/BacklinksList.jsx`**

```jsx
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'

export const BacklinksList = forwardRef(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => setSelectedIndex(0), [items])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') { setSelectedIndex(i => (i + items.length - 1) % items.length); return true }
      if (event.key === 'ArrowDown') { setSelectedIndex(i => (i + 1) % items.length); return true }
      if (event.key === 'Enter') { if (items[selectedIndex]) command(items[selectedIndex]); return true }
      return false
    },
  }))

  return (
    <div style={{ background: 'var(--bg2, #1c1c1c)', border: '1px solid rgba(200,30,50,0.35)', borderRadius: 10, padding: 6, minWidth: 200, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
      {items.length === 0
        ? <div style={{ padding: '8px 10px', fontSize: 12, opacity: .4 }}>Keine Notizen gefunden</div>
        : items.map((item, i) => (
          <div key={i} onClick={() => command(item)} style={{ padding: '7px 10px', borderRadius: 7, cursor: 'pointer', background: i === selectedIndex ? 'rgba(200,30,50,0.12)' : 'transparent' }}>
            <div style={{ fontSize: 13 }}>{item.label}</div>
            {item.subtitle && <div style={{ fontSize: 11, opacity: .4 }}>{item.subtitle}</div>}
          </div>
        ))
      }
    </div>
  )
})
BacklinksList.displayName = 'BacklinksList'
```

- [ ] **Step 2: Update TiptapEditor to use BacklinksList for `[[` suggestions**

In `TiptapEditor.jsx`, import `BacklinksList`:

```javascript
import { BacklinksList } from './BacklinksList'
```

In the `Mention.configure` block, update the `suggestion.render` key to use `makeSuggestionPopup(BacklinksList)`:

```javascript
// Change this line inside Mention.configure > suggestion:
...makeSuggestionPopup(BacklinksList),
// (was: ...makeSuggestionPopup(SlashMenu))
```

- [ ] **Step 3: Verify [[backlinks]] work**

```bash
npm run tauri dev
```

Open any note (after integrating in Task 14), type `[[`, verify the BacklinksList dropdown appears with note/customer names styled in red. (For now test in a dev component or verify after Task 14.)

- [ ] **Step 4: Commit**

```bash
git add src/components/editor/BacklinksList.jsx src/components/editor/TiptapEditor.jsx
git commit -m "feat: BacklinksList popup for [[backlink]] suggestions"
```

---

### Task 14: Integrate TiptapEditor Into NotesPane

**Files:**
- Modify: `src/components/notes/NotesPane.jsx`

- [ ] **Step 1: Read NotesPane to find the editor section**

```bash
grep -n "textarea\|editMode\|renderMarkdown\|preview\|toolbar\|debounce" src/components/notes/NotesPane.jsx
```

Find: (a) the `editMode` state, (b) the textarea, (c) the custom markdown renderer, (d) the toolbar buttons, (e) the debounce useEffect.

- [ ] **Step 2: Add TiptapEditor import**

At the top of `NotesPane.jsx`:

```javascript
import { TiptapEditor } from '../editor/TiptapEditor'
```

- [ ] **Step 3: Remove edit/preview state and custom renderer**

Delete:
- `const [editMode, setEditMode] = useState(true)` (and any `preview` / `editMode` state)
- The `renderMarkdown` function (or any regex-based markdown parser)
- The edit/preview toggle button from the toolbar
- The `<textarea>` element
- The preview `<div>` that rendered markdown

The format toolbar (B, I, Code etc.) can also be removed — Tiptap provides keyboard shortcuts natively (Ctrl+B = bold, Ctrl+I = italic, Ctrl+` = code). Keep only the tag select, title input, and delete button.

- [ ] **Step 4: Remove the debounce useEffect**

Delete the `useEffect` that saved content after a timer. TiptapEditor's `onChange` fires on a built-in 300ms debounce (set inside the editor's `onUpdate`).

- [ ] **Step 5: Insert TiptapEditor in the editor area**

In the right pane of NotesPane, replace the textarea/preview section with:

```jsx
const allNotes = useStore(s => s.notes)
const allCustomers = useStore(s => s.customers)

// In JSX:
{selectedNote ? (
  <TiptapEditor
    key={selectedNote.id}
    content={selectedNote.content}
    onChange={(markdown) => updateNote(selectedNote.id, { content: markdown })}
    allNotes={allNotes}
    allCustomers={allCustomers}
  />
) : (
  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: .25, fontSize: 13 }}>
    Wähle eine Notiz
  </div>
)}
```

The `key={selectedNote.id}` prop is required — it forces Tiptap to remount when switching notes.

- [ ] **Step 6: Test editor with existing notes**

```bash
npm run tauri dev
```

1. Open an existing note with markdown content → verify it renders as formatted rich text (not raw `**bold**`)
2. Type new content → verify it saves (switch notes and back)
3. Type `/` → verify slash menu appears
4. Type `[[` → verify backlinks dropdown appears
5. Use Ctrl+B on selected text → verify bold works
6. Create note in workspace mode → same editor appears

- [ ] **Step 7: Commit**

```bash
git add src/components/notes/NotesPane.jsx
git commit -m "feat: replace custom markdown editor with Tiptap WYSIWYG in NotesPane"
```

---

### Task 15: Enhance CommandPalette Full-Text Search

**Files:**
- Modify: `src/components/CommandPalette.jsx`

- [ ] **Step 1: Read the notes search section in CommandPalette**

```bash
grep -n "notes\|note\|title\|content\|query" src/components/CommandPalette.jsx | head -30
```

Find where notes are filtered and rendered in the palette.

- [ ] **Step 2: Replace notes filter with full-text search including content**

Add `useMemo` import if not already there. Replace the notes filter:

```javascript
import { useMemo } from 'react'

// Add these selectors at top of component:
const allNotes = useStore(s => s.notes)
const customers = useStore(s => s.customers)
const setWorkspaceView = useStore(s => s.setWorkspaceView)
const setSelectedNoteId = useStore(s => s.setSelectedNoteId)

// Replace existing note filter:
const noteResults = useMemo(() => {
  if (!query || query.length < 2) return []
  const q = query.toLowerCase()
  return allNotes
    .filter(n => n.title?.toLowerCase().includes(q) || n.content?.toLowerCase().includes(q))
    .slice(0, 6)
    .map(n => {
      const customer = customers.find(c => c.id === n.customerId)
      const contentIdx = n.content?.toLowerCase().indexOf(q) ?? -1
      const snippet = contentIdx > -1
        ? '…' + n.content.slice(Math.max(0, contentIdx - 20), contentIdx + 50) + '…'
        : n.content?.slice(0, 70) + '…'
      return { ...n, snippet, contextLabel: customer?.name ?? 'Workspace' }
    })
}, [query, allNotes, customers])
```

- [ ] **Step 3: Update note result item rendering**

In the JSX where notes are rendered in the palette:

```jsx
{noteResults.map(note => (
  <div
    key={note.id}
    onClick={() => {
      if (note.customerId) {
        selectCustomer(note.customerId)
        setCustomerView('workflow')
        setActiveTab('notes')
      } else {
        selectCustomer(null)
        setWorkspaceView('notes')
      }
      setSelectedNoteId(note.id)
      close() // however the palette closes
    }}
    style={{ /* existing item style */ }}
  >
    <div style={{ fontSize: 13, fontWeight: 500 }}>{note.title || 'Unbenannt'}</div>
    <div style={{ fontSize: 11, opacity: .4 }}>
      <span style={{ color: '#60A5FA' }}>{note.contextLabel}</span>
      {note.snippet && <span> · {note.snippet}</span>}
    </div>
  </div>
))}
```

- [ ] **Step 4: Verify full-text search**

```bash
npm run tauri dev
```

1. Create a note with content "Projektplanung Q3 2026"
2. Press Ctrl+K
3. Type "Q3" → note appears with snippet
4. Click result → navigates to correct note
5. For a workspace note (customerId=null) → navigates to Workspace → Meine Notizen

- [ ] **Step 5: Final full-app smoke test**

Verify the complete upgrade works end-to-end:
- [ ] Upload a file → no localStorage growth (check devtools)
- [ ] Dashboard tab shows real counts
- [ ] Sidebar shows Workspace section with correct badge counts
- [ ] Meine Notizen: create, edit with Tiptap, `/` slash menu works
- [ ] Meine Todos: create personal todos, don't appear in PrioritySideboard
- [ ] `[[` backlinks work in editor
- [ ] Ctrl+K → type note content → result appears with snippet → navigation correct
- [ ] Switch between customer and workspace — no state bleed

- [ ] **Step 6: Commit**

```bash
git add src/components/CommandPalette.jsx
git commit -m "feat: full-text note search in command palette with content snippets"
```

---

## Self-Review Checklist (Pre-Implementation)

**Spec coverage:**
- [x] Phase 1 Store refactor → Tasks 2-3
- [x] Tauri filesystem migration → Tasks 4-6
- [x] Dashboard → Task 7
- [x] Workspace sidebar section → Task 8
- [x] Workspace routing (notes + todos) → Task 9
- [x] CommandPalette workspace actions → Task 10
- [x] Tiptap editor + slash commands → Tasks 11-12
- [x] `[[backlinks]]` → Task 13
- [x] NotesPane integration → Task 14
- [x] Full-text search → Task 15
- [x] Tag filter chips (spec mentions) → **Gap:** not covered. Tags already exist in the data model; the filter chips are a UI enhancement that fits naturally alongside Task 14. Add tag filter bar as a sub-step inside Task 14 Step 3.

**Tag filter bar (add as sub-step in Task 14, Step 3):**

In NotesPane, above the note list, add a horizontal chip row:

```jsx
const TAGS = ['meeting', 'telefon', 'email', 'idee', 'wichtig', 'angebot']
const [activeTags, setActiveTags] = useState([])

const toggleTag = (tag) => setActiveTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])

const filteredNotes = activeTags.length === 0
  ? notes
  : notes.filter(n => activeTags.includes(n.tag))

// JSX (above note list):
<div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
  {TAGS.map(tag => (
    <div
      key={tag}
      onClick={() => toggleTag(tag)}
      style={{
        fontSize: 10, padding: '2px 7px', borderRadius: 4, cursor: 'pointer',
        background: activeTags.includes(tag) ? 'rgba(200,30,50,0.2)' : 'rgba(255,255,255,0.05)',
        border: activeTags.includes(tag) ? '1px solid rgba(200,30,50,0.4)' : '1px solid rgba(255,255,255,0.08)',
        color: activeTags.includes(tag) ? '#FF6B82' : 'inherit',
        transition: 'all 0.1s',
      }}
    >
      {tag}
    </div>
  ))}
</div>
```

Use `filteredNotes` instead of `notes` in the note list render.

**Type consistency check:**
- `addNote(customerId)` — used consistently as positional arg throughout ✓
- `addTodo(customerId, text, prio, due)` — positional args preserved ✓
- `addFile(customerId, folderId, { name, type, size, tauriPath })` — `data` field removed ✓
- `workspaceMode` prop on `NotesPane`/`TodoPane` ✓
- `setWorkspaceView` in uiSlice, referenced in Sidebar/App/CommandPalette ✓
- `writeTauriFile`, `readTauriFile`, `deleteTauriFile` in filesSlice, used in AblagePane ✓
- `TiptapEditor` export: named export (`export function TiptapEditor`) — consistent with `NotesPane` usage ✓
