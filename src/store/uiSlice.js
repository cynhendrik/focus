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
  toggleTheme: () => set(s => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' })),
})
