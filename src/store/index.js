import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { v4 as uid } from "uuid";

const now = () => new Date().toISOString();
export const PRIVAT_ID = '__cynera_privat__'

const PRIVAT_CUSTOMER = {
  id: PRIVAT_ID,
  name: 'Privat',
  company: '',
  email: '',
  phone: '',
  category: 'Intern',
  status: 'Aktiv',
  isPrivat: true,
  createdAt: '2000-01-01T00:00:00.000Z',
  updatedAt: '2000-01-01T00:00:00.000Z',
}

export const useStore = create(
  persist(
    (set, get) => ({
      // ── Data ──────────────────────────────────────────────────────
      customers: [],
      todos: [],
      notes: [],
      kpis: [],
      folders: [],
      uploadedFiles: [],
      healthScores: [],
      deadlines: [],
      instagramConnections: [],
      instagramCache: [],
      crmFollowUps: [],
      timeEntries: [],
      timePlanning: { globalWeekHours: 100, globalMonthHours: 400, perCustomer: {} },
      chatMessages: [],
      emails: [],
      emailAccounts:   [],
      emailSyncStatus: {},

      // ── Company ───────────────────────────────────────────────────
      companyProfile: { name: '', industry: '', teamSize: '', targetType: '', description: '' },
      modules: {
        crm: true, workflow: true, socialMedia: true,
        deals: false, followUps: false, healthScore: true, aiInsights: false,
      },
      crmSettings: {
        statuses: ['Lead', 'Aktiv', 'Inaktiv', 'Lost'],
        priorities: ['Low', 'Medium', 'High'],
        tags: [],
        followUpEnabled: false,
        followUpDays: 3,
      },
      companyView: null,
      focusMode: false,
      preFocusTheme: 'light',
      workspaceName: 'Mein Workspace',
      workspaceCreatedAt: new Date().toISOString(),

      // ── FOCUS AI ─────────────────────────────────────────────────
      focusAiApiKey: '',
      setFocusAiApiKey: (key) => set({ focusAiApiKey: key }),

      // ── UI State ──────────────────────────────────────────────────
      selectedId: null,
      activeTab: "todos",
      selectedNoteId: null,
      customerView: "workflow", // "dashboard" | "workflow" | "ablage"
      theme: "light", // "dark" | "light"
      hasSeenIntro: false,

      // ── Customers ─────────────────────────────────────────────────
      addCustomer: (data) => {
        const c = { id: uid(), createdAt: now(), updatedAt: now(), ...data };
        set((s) => ({ customers: [c, ...s.customers], selectedId: c.id }));
        return c;
      },
      updateCustomer: (id, data) =>
        set((s) => ({
          customers: s.customers.map((c) =>
            c.id === id ? { ...c, ...data, updatedAt: now() } : c
          ),
        })),
      ensurePrivatCustomer: () => {
        if (!get().customers.find(c => c.id === PRIVAT_ID)) {
          set(s => ({ customers: [...s.customers, PRIVAT_CUSTOMER] }))
        }
      },

      deleteCustomer: (id) =>
        set((s) => {
          if (id === PRIVAT_ID) return s
          const remaining = s.customers.filter((c) => c.id !== id);
          return {
            customers: remaining,
            todos: s.todos.filter((t) => t.customerId !== id),
            notes: s.notes.filter((n) => n.customerId !== id),
            kpis: s.kpis.filter((k) => k.customerId !== id),
            folders: s.folders.filter((f) => f.customerId !== id),
            uploadedFiles: s.uploadedFiles.filter((f) => f.customerId !== id),
            healthScores: s.healthScores.filter((h) => h.customerId !== id),
            deadlines: s.deadlines.filter((d) => d.customerId !== id),
            instagramConnections: s.instagramConnections.filter((c) => c.customerId !== id),
            instagramCache: s.instagramCache.filter((c) => c.customerId !== id),
            crmFollowUps: s.crmFollowUps.filter((f) => f.customerId !== id),
            chatMessages: s.chatMessages.filter((m) => m.customerId !== id),
            emails:       s.emails.filter((e) => e.customerId !== id),
            timeEntries: s.timeEntries.filter((e) => e.customerId !== id),
            timePlanning: {
              ...s.timePlanning,
              perCustomer: Object.fromEntries(
                Object.entries(s.timePlanning.perCustomer).filter(([k]) => k !== id)
              ),
            },
            selectedId: remaining[0]?.id ?? null,
            selectedNoteId: null,
            customerView: "workflow",
          };
        }),
      selectCustomer: (id) => set({ selectedId: id, selectedNoteId: null, customerView: "workflow", companyView: null }),
      touchCustomer: (id) =>
        set((s) => ({
          customers: s.customers.map((c) =>
            c.id === id ? { ...c, updatedAt: now() } : c
          ),
        })),

      // ── UI ────────────────────────────────────────────────────────
      setActiveTab: (tab) => set({ activeTab: tab }),
      setSelectedNoteId: (id) => set({ selectedNoteId: id }),
      setCustomerView: (view) => set({ customerView: view }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
      setHasSeenIntro: () => set({ hasSeenIntro: true }),

      // ── Company ───────────────────────────────────────────────────
      setCompanyView:    (view) => set({ companyView: view }),
      toggleFocusMode: () => set(s => s.focusMode
        ? { focusMode: false, theme: s.preFocusTheme }
        : { focusMode: true,  preFocusTheme: s.theme, theme: 'dark' }
      ),
      setCompanyProfile: (data) => set((s) => ({ companyProfile: { ...s.companyProfile, ...data } })),
      setModule:         (key, value) => set((s) => ({ modules: { ...s.modules, [key]: value } })),
      updateCrmSettings: (data) => set((s) => ({ crmSettings: { ...s.crmSettings, ...data } })),
      setWorkspaceName:  (name) => set({ workspaceName: name }),

      // ── Todos ─────────────────────────────────────────────────────
      addTodo: (customerId, text, prio = "high", due = null) => {
        const t = { id: uid(), customerId, text, prio, due, completed: false, createdAt: now() };
        set((s) => ({ todos: [t, ...s.todos] }));
        get().touchCustomer(customerId);
        return t;
      },
      toggleTodo: (id) => {
        set((s) => ({
          todos: s.todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
        }));
        const t = get().todos.find((x) => x.id === id);
        if (t) get().touchCustomer(t.customerId);
      },
      updateTodoStatus: (id, status) => {
        set((s) => ({
          todos: s.todos.map((t) =>
            t.id === id ? { ...t, status, completed: status === 'done' } : t
          ),
        }));
        const t = get().todos.find((x) => x.id === id);
        if (t) get().touchCustomer(t.customerId);
      },
      deleteTodo: (id) => {
        const todo = get().todos.find(t => t.id === id)
        if (todo?.completed) {
          set(s => ({ todos: s.todos.map(t => t.id === id ? { ...t, archived: true } : t) }))
        } else {
          set(s => ({ todos: s.todos.filter(t => t.id !== id) }))
        }
      },
      getTodos: (customerId) => get().todos.filter((t) => t.customerId === customerId),

      // ── Note ordering ─────────────────────────────────────────────
      noteOrders: {},
      setNoteOrder: (customerId, ids) =>
        set(s => ({ noteOrders: { ...s.noteOrders, [customerId]: ids } })),

      // ── Notes ─────────────────────────────────────────────────────
      addNote: (customerId) => {
        const n = {
          id: uid(), customerId,
          title: "Neue Notiz", content: "", tag: "",
          createdAt: now(), updatedAt: now(),
        };
        set((s) => ({ notes: [n, ...s.notes], selectedNoteId: n.id }));
        get().touchCustomer(customerId);
        return n;
      },
      updateNote: (id, data) => {
        set((s) => ({
          notes: s.notes.map((n) =>
            n.id === id ? { ...n, ...data, updatedAt: now() } : n
          ),
        }));
        const n = get().notes.find((x) => x.id === id);
        if (n) get().touchCustomer(n.customerId);
      },
      deleteNote: (id) => {
        const n = get().notes.find((x) => x.id === id);
        set((s) => ({
          notes: s.notes.filter((x) => x.id !== id),
          selectedNoteId: s.selectedNoteId === id ? null : s.selectedNoteId,
          noteOrders: n ? {
            ...s.noteOrders,
            [n.customerId]: (s.noteOrders[n.customerId] ?? []).filter(nid => nid !== id),
          } : s.noteOrders,
        }));
        if (n) get().touchCustomer(n.customerId);
      },
      getNotes: (customerId) =>
        get().notes
          .filter((n) => n.customerId === customerId)
          .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
      pinNote: (id) =>
        set(s => ({ notes: s.notes.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n) })),

      // ── KPIs ──────────────────────────────────────────────────────
      addKpi: (customerId, data) => {
        const k = {
          id: uid(), customerId,
          date: new Date().toISOString().slice(0, 10),
          createdAt: now(), ...data,
        };
        set((s) => ({ kpis: [...s.kpis, k] }));
        get().touchCustomer(customerId);
        return k;
      },
      updateKpi: (id, data) =>
        set((s) => ({ kpis: s.kpis.map((k) => (k.id === id ? { ...k, ...data } : k)) })),
      deleteKpi: (id) => set((s) => ({ kpis: s.kpis.filter((k) => k.id !== id) })),
      getKpis: (customerId) => get().kpis.filter((k) => k.customerId === customerId),
      pinKpi: (customerId, kpiName) =>
        set((s) => ({
          customers: s.customers.map((c) =>
            c.id === customerId
              ? { ...c, dashboardKpis: [...new Set([...(c.dashboardKpis ?? []), kpiName])] }
              : c
          ),
        })),
      unpinKpi: (customerId, kpiName) =>
        set((s) => ({
          customers: s.customers.map((c) =>
            c.id === customerId
              ? { ...c, dashboardKpis: (c.dashboardKpis ?? []).filter((n) => n !== kpiName) }
              : c
          ),
        })),

      // ── Folders ───────────────────────────────────────────────────
      addFolder: (customerId, parentId, name) => {
        const f = { id: uid(), customerId, parentId: parentId || null, name, createdAt: now() };
        set((s) => ({ folders: [...s.folders, f] }));
        return f;
      },
      renameFolder: (id, name) =>
        set((s) => ({ folders: s.folders.map((f) => (f.id === id ? { ...f, name } : f)) })),
      deleteFolder: (id) => {
        const getAllChildIds = (fid, all) => {
          const children = all.filter((f) => f.parentId === fid);
          return [fid, ...children.flatMap((c) => getAllChildIds(c.id, all))];
        };
        set((s) => {
          const ids = getAllChildIds(id, s.folders);
          return {
            folders: s.folders.filter((f) => !ids.includes(f.id)),
            uploadedFiles: s.uploadedFiles.filter((f) => !ids.includes(f.folderId)),
          };
        });
      },

      // ── Files ─────────────────────────────────────────────────────
      addFile: (customerId, folderId, { name, type, size, data }) => {
        const f = { id: uid(), customerId, folderId: folderId || null, name, type, size, data, createdAt: now() };
        set((s) => ({ uploadedFiles: [f, ...s.uploadedFiles] }));
        return f;
      },
      renameFile: (id, name) =>
        set((s) => ({ uploadedFiles: s.uploadedFiles.map((f) => (f.id === id ? { ...f, name } : f)) })),
      deleteFile: (id) =>
        set((s) => ({ uploadedFiles: s.uploadedFiles.filter((f) => f.id !== id) })),

      // ── Health Scores ─────────────────────────────────────────────
      addHealthScore: (customerId, data) => {
        const h = { id: uid(), customerId, updatedAt: now(), ...data };
        set((s) => ({ healthScores: [h, ...s.healthScores.filter((x) => x.customerId !== customerId)] }));
        return h;
      },
      updateHealthScore: (id, data) =>
        set((s) => ({ healthScores: s.healthScores.map((h) => h.id === id ? { ...h, ...data, updatedAt: now() } : h) })),
      getHealthScore: (customerId) => get().healthScores.find((h) => h.customerId === customerId) ?? null,

      // ── Deadlines ─────────────────────────────────────────────────
      addDeadline: (customerId, data) => {
        const d = { id: uid(), customerId, createdAt: now(), ...data };
        set((s) => ({ deadlines: [...s.deadlines, d] }));
        return d;
      },
      updateDeadline: (id, data) =>
        set((s) => ({ deadlines: s.deadlines.map((d) => d.id === id ? { ...d, ...data } : d) })),
      deleteDeadline: (id) => set((s) => ({ deadlines: s.deadlines.filter((d) => d.id !== id) })),
      getDeadlines: (customerId) => get().deadlines.filter((d) => d.customerId === customerId).sort((a, b) => new Date(a.date) - new Date(b.date)),

      // ── CRM Follow-Ups ───────────────────────────────────────────
      addCrmFollowUp: (customerId, data) => {
        const f = { id: uid(), customerId, status: 'offen', notes: '', createdAt: now(), ...data }
        set(s => ({ crmFollowUps: [...s.crmFollowUps, f] }))
        return f
      },
      updateCrmFollowUp: (id, data) =>
        set(s => ({ crmFollowUps: s.crmFollowUps.map(f => f.id === id ? { ...f, ...data } : f) })),
      deleteCrmFollowUp: (id) =>
        set(s => ({ crmFollowUps: s.crmFollowUps.filter(f => f.id !== id) })),
      getCrmFollowUps: (customerId) =>
        get().crmFollowUps.filter(f => f.customerId === customerId).sort((a, b) => new Date(a.date) - new Date(b.date)),

      // ── Time Tracking ─────────────────────────────────────────────
      addTimeEntry: (data) => {
        const e = { id: uid(), createdAt: now(), ...data }
        set(s => ({ timeEntries: [e, ...s.timeEntries] }))
        return e
      },
      updateTimeEntry: (id, data) =>
        set(s => ({ timeEntries: s.timeEntries.map(e => e.id === id ? { ...e, ...data } : e) })),
      deleteTimeEntry: (id) =>
        set(s => ({ timeEntries: s.timeEntries.filter(e => e.id !== id) })),
      updateTimePlanning: (data) =>
        set(s => ({ timePlanning: { ...s.timePlanning, ...data } })),
      setCustomerPlanHours: (customerId, hours) =>
        set(s => ({
          timePlanning: {
            ...s.timePlanning,
            perCustomer: { ...s.timePlanning.perCustomer, [customerId]: hours },
          },
        })),

      // ── Chat ──────────────────────────────────────────────────────
      addChatMessage: (customerId, { text, sender = 'me', senderName = '' }) => {
        const m = { id: uid(), customerId, sender, senderName, text, createdAt: now(), read: sender === 'me' }
        set(s => ({ chatMessages: [m, ...s.chatMessages] }))
        if (sender === 'me') get().touchCustomer(customerId)
        return m
      },
      markChatRead: (customerId) =>
        set(s => ({
          chatMessages: s.chatMessages.map(m =>
            m.customerId === customerId && m.sender === 'customer' ? { ...m, read: true } : m
          ),
        })),
      deleteChatMessage: (id) =>
        set(s => ({ chatMessages: s.chatMessages.filter(m => m.id !== id) })),

      // ── Email ─────────────────────────────────────────────────────
      addEmail: (data) => {
        const e = { id: uid(), createdAt: now(), read: data.direction === 'out', tags: [], ...data }
        set(s => ({ emails: [e, ...s.emails] }))
        if (data.customerId) get().touchCustomer(data.customerId)
        return e
      },
      updateEmail: (id, data) =>
        set(s => ({ emails: s.emails.map(e => e.id === id ? { ...e, ...data } : e) })),
      markEmailRead: (id) =>
        set(s => ({ emails: s.emails.map(e => e.id === id ? { ...e, read: true } : e) })),
      deleteEmail: (id) =>
        set(s => ({ emails: s.emails.filter(e => e.id !== id) })),
      assignEmailToCustomer: (emailId, customerId) =>
        set(s => ({ emails: s.emails.map(e => e.id === emailId ? { ...e, customerId } : e) })),

      // ── Email Accounts (IMAP) ──────────────────────────────────────
      addEmailAccount: (account) =>
        set(s => ({ emailAccounts: [...s.emailAccounts, account] })),
      removeEmailAccount: (id) =>
        set(s => ({ emailAccounts: s.emailAccounts.filter(a => a.id !== id) })),
      setEmailSyncStatus: (accountId, status) =>
        set(s => ({ emailSyncStatus: { ...s.emailSyncStatus, [accountId]: status } })),

      // ── Instagram ─────────────────────────────────────────────────
      connectInstagram: (customerId, data) =>
        set(s => ({
          instagramConnections: [
            ...s.instagramConnections.filter(c => c.customerId !== customerId),
            { customerId, connectedAt: now(), ...data },
          ],
        })),
      disconnectInstagram: (customerId) =>
        set(s => ({
          instagramConnections: s.instagramConnections.filter(c => c.customerId !== customerId),
          instagramCache: s.instagramCache.filter(c => c.customerId !== customerId),
        })),
      saveInstagramCache: (customerId, reels) =>
        set(s => ({
          instagramCache: [
            ...s.instagramCache.filter(c => c.customerId !== customerId),
            { customerId, reels, fetchedAt: now() },
          ],
        })),
      getInstagramConnection: (customerId) =>
        get().instagramConnections.find(c => c.customerId === customerId) ?? null,
      getInstagramCache: (customerId) =>
        get().instagramCache.find(c => c.customerId === customerId) ?? null,

      // ── Import / Export ───────────────────────────────────────────
      exportData: () => {
        const { customers, todos, notes, kpis, folders, uploadedFiles } = get();
        return JSON.stringify({
          customers:   customers.filter(c => c.id !== PRIVAT_ID),
          todos:       todos.filter(t => t.customerId !== PRIVAT_ID),
          notes:       notes.filter(n => n.customerId !== PRIVAT_ID),
          kpis:        kpis.filter(k => k.customerId !== PRIVAT_ID),
          folders:     folders.filter(f => f.customerId !== PRIVAT_ID),
          uploadedFiles: uploadedFiles.filter(f => f.customerId !== PRIVAT_ID),
        }, null, 2);
      },
      importData: (json) => {
        const data = JSON.parse(json);
        if (!data.customers) throw new Error("Ungültiges Backup");
        set({
          customers: data.customers ?? [],
          todos: data.todos ?? [],
          notes: data.notes ?? [],
          kpis: data.kpis ?? [],
          folders: data.folders ?? [],
          uploadedFiles: data.uploadedFiles ?? [],
          selectedId: data.customers?.[0]?.id ?? null,
          selectedNoteId: null,
          customerView: "workflow",
        });
      },
    }),
    {
      name: "cynera-os-v4",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        customers: s.customers,
        todos: s.todos,
        notes: s.notes,
        kpis: s.kpis,
        folders: s.folders,
        uploadedFiles: s.uploadedFiles,
        healthScores: s.healthScores,
        deadlines: s.deadlines,
        selectedId: s.selectedId,
        activeTab: s.activeTab,
        theme: s.theme,
        hasSeenIntro: s.hasSeenIntro,
        instagramConnections: s.instagramConnections,
        instagramCache: s.instagramCache,
        companyProfile:     s.companyProfile,
        modules:            s.modules,
        crmSettings:        s.crmSettings,
        workspaceName:      s.workspaceName,
        workspaceCreatedAt: s.workspaceCreatedAt,
        focusAiApiKey:      s.focusAiApiKey,
        noteOrders:         s.noteOrders,
        crmFollowUps:       s.crmFollowUps,
        timeEntries:        s.timeEntries,
        timePlanning:       s.timePlanning,
        chatMessages:       s.chatMessages,
        emails:             s.emails,
        emailAccounts:      s.emailAccounts,
      }),
    }
  )
);
