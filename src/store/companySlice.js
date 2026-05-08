const now = () => new Date().toISOString()

export const createCompanySlice = (set, get) => ({
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
  workspaceName: 'Mein Workspace',
  workspaceCreatedAt: now(),

  setCompanyView:    (view) => set(s => ({ ...s, companyView: view })),
  setCompanyProfile: (data) => set(s => ({ ...s, companyProfile: { ...s.companyProfile, ...data } })),
  setModule:         (key, value) => set(s => ({ ...s, modules: { ...s.modules, [key]: value } })),
  updateCrmSettings: (data) => set(s => ({ ...s, crmSettings: { ...s.crmSettings, ...data } })),
  setWorkspaceName:  (name) => set(s => ({ ...s, workspaceName: name })),
})
