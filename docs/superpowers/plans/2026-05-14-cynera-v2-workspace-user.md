# Cynera Focus v2 — Workspace + User System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cynera Focus erhält Login (Supabase Auth), Multi-Workspace-Support, eine offline-fähige SQLite-Cache-Schicht und einen Rust SyncWorker, der Änderungen bei Reconnect an Supabase pusht.

**Architecture:** React-Frontend nutzt `@supabase/supabase-js` direkt für Auth und Workspace-Daten. Alle Schreiboperationen gehen via Tauri Commands in SQLite + `sync_queue`. Ein Rust-Background-Task prüft alle 10s die Connectivity und flusht die Queue an Supabase REST. Reads kommen immer aus SQLite.

**Tech Stack:** @supabase/supabase-js 2.x, Zustand 4, Tailwind, Tauri v2, Rust (reqwest 0.11, rusqlite 0.31, tokio), Vitest 2.x

---

## File Map

### Neue Dateien — Frontend
| Pfad | Zweck |
|---|---|
| `src/lib/supabase.ts` | Supabase Client Singleton |
| `src/store/auth.store.ts` | Zustand: user, session, signIn, signOut, init |
| `src/store/workspace.store.ts` | Zustand: workspaces[], activeWorkspaceId, pendingCount, isOnline |
| `src/core/auth/LoginScreen.tsx` | E-Mail + Passwort Login-Formular |
| `src/core/workspace/WorkspacePicker.tsx` | Workspace auswählen / neu erstellen |
| `src/core/workspace/WorkspaceSwitcher.tsx` | Dropdown-Komponente für NavSidebar-Header |
| `.env` | VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY |
| `.env.example` | Vorlage ohne echte Werte |

### Geänderte Dateien — Frontend
| Pfad | Änderung |
|---|---|
| `src/App.tsx` | Auth-Gate + Workspace-Gate vor bestehendem Layout |
| `src/components/layout/NavSidebar.tsx` | Logo-Bereich → WorkspaceSwitcher |
| `src/test/setup.js` | Supabase-Mock hinzufügen |

### Neue Dateien — Rust
| Pfad | Zweck |
|---|---|
| `src-tauri/src/core/mod.rs` | Deklariert `auth` + `sync` Module |
| `src-tauri/src/core/auth/mod.rs` | `set_auth_token` Command + `SyncState` Struct |
| `src-tauri/src/core/sync/mod.rs` | `SyncWorker`, `sync_now`/`get_sync_status` Commands, `enqueue()` Helper |
| `src-tauri/src/core/sync/connectivity.rs` | Background-Loop: HEAD-Check + Event-Emit + Queue-Flush |
| `src-tauri/src/core/sync/push.rs` | sync_queue → Supabase REST (INSERT/UPDATE/DELETE) |
| `src-tauri/src/core/sync/pull.rs` | Supabase → SQLite (customers als Beispiel-Pattern) |

### Geänderte Dateien — Rust
| Pfad | Änderung |
|---|---|
| `src-tauri/src/db/pool.rs` | `impl Clone for DbPool` |
| `src-tauri/src/db/migrations.rs` | Migration v2 (workspace-Spalten) + v3 (sync-Tabellen), `CURRENT_VERSION = 3` |
| `src-tauri/src/db/customer.rs` | `get_all(workspace_id)` + `upsert` mit workspace_id + sync |
| `src-tauri/src/commands/customer.rs` | workspace_id Parameter in allen Commands |
| `src-tauri/src/db/mod.rs` | Keine Änderung nötig |
| `src-tauri/src/main.rs` | SyncState verwalten, Background-Task starten, neue Commands registrieren |
| `src-tauri/.cargo/config.toml` | SUPABASE_URL + SUPABASE_ANON_KEY hinzufügen |

---

## Task 1: Supabase Projekt einrichten

**Files:**
- Manuell: SQL in Supabase Dashboard ausführen

- [ ] **Step 1: Supabase-Projekt erstellen**

Gehe zu https://supabase.com → New Project. Merke dir:
- Project URL (z.B. `https://abcxyz.supabase.co`)
- Anon/Public Key (unter Settings → API)

- [ ] **Step 2: SQL Schema in Supabase SQL-Editor ausführen**

Gehe zu SQL Editor → New Query, füge ein und führe aus:

```sql
-- Nutzerprofil (wird automatisch bei Registrierung erstellt)
CREATE TABLE public.profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  text,
  avatar_url text,
  created_at timestamptz DEFAULT now()
);

-- Trigger: Profil automatisch beim Anlegen eines Nutzers erstellen
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Workspaces
CREATE TABLE public.workspaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  logo_url    text,
  created_by  uuid NOT NULL REFERENCES public.profiles(id),
  created_at  timestamptz DEFAULT now()
);

-- Workspace-Mitglieder
CREATE TABLE public.workspace_members (
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('owner', 'member')),
  joined_at     timestamptz DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

-- RLS aktivieren
ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Nutzer kann sein eigenes Profil lesen/schreiben
CREATE POLICY "own_profile" ON public.profiles
  FOR ALL USING (auth.uid() = id);

-- Workspace lesen: eigene Mitgliedschaft
CREATE POLICY "workspace_read" ON public.workspaces
  FOR SELECT USING (
    id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
  );

-- Workspace erstellen: eingeloggt
CREATE POLICY "workspace_create" ON public.workspaces
  FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Workspace_members lesen: eigene Mitgliedschaft
CREATE POLICY "members_read" ON public.workspace_members
  FOR SELECT USING (user_id = auth.uid());

-- Workspace_members einfügen: Owner darf einladen
CREATE POLICY "members_insert_owner" ON public.workspace_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = workspace_members.workspace_id
        AND user_id = auth.uid()
        AND role = 'owner'
    )
    OR auth.uid() = user_id  -- Eigene Mitgliedschaft beim ersten Workspace
  );
```

- [ ] **Step 3: Ersten Test-Nutzer anlegen**

Gehe zu Authentication → Users → Add User. Lege einen Test-Account an (z.B. `test@cynera.de` / `Test1234!`).

- [ ] **Commit**

```bash
git add docs/superpowers/plans/2026-05-14-cynera-v2-workspace-user.md
git commit -m "docs: add Workspace + User System implementation plan"
```

---

## Task 2: @supabase/supabase-js installieren + Client konfigurieren

**Files:**
- Create: `.env`
- Create: `.env.example`
- Create: `src/lib/supabase.ts`
- Modify: `package.json` (via npm install)

- [ ] **Step 1: SDK installieren**

```bash
npm install @supabase/supabase-js
```

Erwartete Ausgabe: `added 1 package` (oder ähnlich, kein Error).

- [ ] **Step 2: `.env` erstellen**

Ersetze `<URL>` und `<KEY>` mit den Werten aus Task 1 Step 1:

```
VITE_SUPABASE_URL=https://<dein-projekt>.supabase.co
VITE_SUPABASE_ANON_KEY=<dein-anon-key>
```

- [ ] **Step 3: `.env.example` erstellen**

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

- [ ] **Step 4: `.env` zu `.gitignore` hinzufügen**

Öffne `.gitignore` (falls nicht vorhanden, erstellen). Stelle sicher, dass diese Zeile enthalten ist:

```
.env
```

`.env.example` bleibt committed.

- [ ] **Step 5: `src/lib/supabase.ts` erstellen**

```typescript
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !key) {
  console.error('VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY müssen in .env gesetzt sein')
}

export const supabase = createClient(url, key)
```

- [ ] **Step 6: TypeScript prüfen**

```bash
npm run typecheck
```

Erwartete Ausgabe: Kein Fehler (oder nur bestehende Fehler, kein neuer wegen supabase.ts).

- [ ] **Commit**

```bash
git add src/lib/supabase.ts .env.example package.json package-lock.json
git commit -m "feat: install @supabase/supabase-js + configure client"
```

---

## Task 3: auth.store.ts

**Files:**
- Create: `src/store/auth.store.ts`
- Modify: `src/test/setup.js`

- [ ] **Step 1: Supabase-Mock zu `src/test/setup.js` hinzufügen**

Öffne `src/test/setup.js` und füge am Ende hinzu:

```javascript
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}))
```

- [ ] **Step 2: Failing-Test schreiben**

Erstelle `src/store/auth.store.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuthStore } from './auth.store'

beforeEach(() => {
  useAuthStore.setState({ user: null, session: null, loading: false })
  vi.clearAllMocks()
})

describe('useAuthStore', () => {
  it('starts with null user and loading false after setState', () => {
    const { user, loading } = useAuthStore.getState()
    expect(user).toBeNull()
    expect(loading).toBe(false)
  })

  it('signIn calls supabase.auth.signInWithPassword', async () => {
    const { supabase } = await import('@/lib/supabase')
    await useAuthStore.getState().signIn('test@example.com', 'pass')
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'pass',
    })
  })

  it('signIn throws when supabase returns error', async () => {
    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: {} as any,
      error: { message: 'Invalid credentials', status: 400, code: 'invalid_credentials', name: 'AuthApiError' } as any,
    })
    await expect(useAuthStore.getState().signIn('bad@email.com', 'wrong')).rejects.toThrow()
  })

  it('signOut clears user and session', async () => {
    useAuthStore.setState({ user: { id: 'u1' } as any, session: {} as any })
    await useAuthStore.getState().signOut()
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().session).toBeNull()
  })
})
```

- [ ] **Step 3: Test ausführen — erwartet FAIL**

```bash
npm run test:run src/store/auth.store.test.ts
```

Erwartete Ausgabe: `FAIL` — "Cannot find module './auth.store'"

- [ ] **Step 4: `src/store/auth.store.ts` implementieren**

```typescript
import { create } from 'zustand'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  init: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  session: null,
  loading: true,

  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    set({ session, user: session?.user ?? null, loading: false })

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null })
    })
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null })
  },
}))
```

- [ ] **Step 5: Tests laufen lassen — erwartet PASS**

```bash
npm run test:run src/store/auth.store.test.ts
```

Erwartete Ausgabe: `4 tests passed`

- [ ] **Commit**

```bash
git add src/store/auth.store.ts src/store/auth.store.test.ts src/test/setup.js
git commit -m "feat: auth.store — Supabase Auth mit signIn/signOut/init"
```

---

## Task 4: LoginScreen.tsx

**Files:**
- Create: `src/core/auth/LoginScreen.tsx`

- [ ] **Step 1: `src/core/auth/LoginScreen.tsx` erstellen**

```typescript
import { useState } from 'react'
import { useAuthStore } from '@/store/auth.store'

export function LoginScreen() {
  const signIn = useAuthStore(s => s.signIn)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (err: any) {
      setError(err?.message ?? 'Login fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="w-full max-w-sm p-8 rounded-2xl bg-[var(--bg1)] border border-[var(--border)]">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--text)]">Cynera Focus</p>
            <p className="text-xs text-[var(--text2)]">Einloggen</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-[var(--text2)] mb-1 block">E-Mail</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--text)] focus:outline-none focus:border-primary placeholder-[var(--text2)]"
              placeholder="deine@email.de"
            />
          </div>

          <div>
            <label className="text-xs text-[var(--text2)] mb-1 block">Passwort</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--text)] focus:outline-none focus:border-primary"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 px-3 py-2 rounded-lg border border-red-400/20">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Einloggen…' : 'Einloggen'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript-Check**

```bash
npm run typecheck
```

Erwartete Ausgabe: Kein neuer Fehler.

- [ ] **Commit**

```bash
git add src/core/auth/LoginScreen.tsx
git commit -m "feat: LoginScreen — E-Mail + Passwort Login mit Supabase"
```

---

## Task 5: Auth-Gate + Workspace-Gate in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Aktuellen App.tsx lesen**

Lese `src/App.tsx` um die bestehende Struktur zu verstehen. Die Datei sieht so aus (Stand Commit):

```typescript
import { useEffect } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { NavSidebar } from '@/components/layout/NavSidebar'
// ... weitere Imports
```

- [ ] **Step 2: `src/App.tsx` vollständig ersetzen**

```typescript
import { useEffect } from 'react'
import { AppShell }    from '@/components/layout/AppShell'
import { NavSidebar }  from '@/components/layout/NavSidebar'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore }   from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { CommandPalette } from '@/components/CommandPalette'
import { LoginScreen }   from '@/core/auth/LoginScreen'
import { WorkspacePicker } from '@/core/workspace/WorkspacePicker'

import { DashboardRoute }  from '@/routes/DashboardRoute'
import { ClientsRoute }    from '@/routes/ClientsRoute'
import { CustomerRoute }   from '@/routes/CustomerRoute'
import { InvoicesRoute }   from '@/routes/InvoicesRoute'
import { TasksRoute }      from '@/routes/TasksRoute'
import { KpisRoute }       from '@/routes/KpisRoute'
import { InsightsRoute }   from '@/routes/InsightsRoute'
import { CalendarRoute }   from '@/routes/CalendarRoute'
import { MailRoute }       from '@/routes/MailRoute'
import { CrmRoute }        from '@/routes/CrmRoute'
import { SettingsRoute }   from '@/routes/SettingsRoute'
import { ProfileRoute }    from '@/routes/ProfileRoute'

export default function App() {
  const initAuth        = useAuthStore(s => s.init)
  const user            = useAuthStore(s => s.user)
  const authLoading     = useAuthStore(s => s.loading)
  const loadWorkspaces  = useWorkspaceStore(s => s.loadWorkspaces)
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId)
  const init            = useCustomersStore(s => s.init)
  const selectedCustomerId = useUiStore(s => s.selectedCustomerId)
  const appView         = useUiStore(s => s.appView)
  const cmdOpen         = useUiStore(s => s.cmdPaletteOpen)
  const setCmdPaletteOpen = useUiStore(s => s.setCmdPaletteOpen)

  useEffect(() => { initAuth() }, [initAuth])

  useEffect(() => {
    if (user) loadWorkspaces()
  }, [user, loadWorkspaces])

  useEffect(() => {
    if (activeWorkspaceId) init()
  }, [activeWorkspaceId, init])

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!user) return <LoginScreen />

  if (!activeWorkspaceId) return <WorkspacePicker />

  const renderMain = () => {
    if (selectedCustomerId && appView === 'clients') return <CustomerRoute customerId={selectedCustomerId} />
    switch (appView) {
      case 'dashboard':  return <DashboardRoute />
      case 'profile':    return <ProfileRoute />
      case 'clients':    return <ClientsRoute />
      case 'invoices':   return <InvoicesRoute />
      case 'tasks':      return <TasksRoute />
      case 'kpis':       return <KpisRoute />
      case 'insights':   return <InsightsRoute />
      case 'calendar':   return <CalendarRoute />
      case 'mail':       return <MailRoute />
      case 'crm':        return <CrmRoute />
      case 'settings':   return <SettingsRoute />
      default:           return <DashboardRoute />
    }
  }

  return (
    <AppShell>
      <div className="flex flex-1 overflow-hidden">
        <NavSidebar />
        <main className="flex-1 overflow-auto">
          <ErrorBoundary>
            {renderMain()}
          </ErrorBoundary>
        </main>
      </div>
      {cmdOpen && <CommandPalette open={cmdOpen} onClose={() => setCmdPaletteOpen(false)} />}
    </AppShell>
  )
}
```

- [ ] **Step 3: TypeScript-Check**

```bash
npm run typecheck
```

Erwartete Ausgabe: Fehler wegen fehlendem `workspace.store` und `WorkspacePicker` — diese kommen in Task 6+7.

- [ ] **Commit nach Tasks 6+7 (noch nicht jetzt)**

---

## Task 6: workspace.store.ts

**Files:**
- Create: `src/store/workspace.store.ts`
- Create: `src/store/workspace.store.test.ts`

- [ ] **Step 1: Failing-Test schreiben**

Erstelle `src/store/workspace.store.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useWorkspaceStore } from './workspace.store'

beforeEach(() => {
  useWorkspaceStore.setState({
    workspaces: [],
    activeWorkspaceId: null,
    pendingCount: 0,
    isOnline: true,
  })
  vi.clearAllMocks()
})

describe('useWorkspaceStore', () => {
  it('starts empty', () => {
    const { workspaces, activeWorkspaceId } = useWorkspaceStore.getState()
    expect(workspaces).toHaveLength(0)
    expect(activeWorkspaceId).toBeNull()
  })

  it('setActiveWorkspace sets activeWorkspaceId', () => {
    useWorkspaceStore.getState().setActiveWorkspace('ws-1')
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-1')
  })

  it('setPendingCount updates pendingCount', () => {
    useWorkspaceStore.getState().setPendingCount(5)
    expect(useWorkspaceStore.getState().pendingCount).toBe(5)
  })

  it('setOnline updates isOnline', () => {
    useWorkspaceStore.getState().setOnline(false)
    expect(useWorkspaceStore.getState().isOnline).toBe(false)
  })

  it('loadWorkspaces calls supabase and sets workspaces', async () => {
    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockResolvedValue({
        data: [
          {
            workspace_id: 'ws-1',
            role: 'owner',
            workspaces: { id: 'ws-1', name: 'Agentur', logo_url: null },
          },
        ],
        error: null,
      }),
    } as any)
    await useWorkspaceStore.getState().loadWorkspaces()
    expect(useWorkspaceStore.getState().workspaces).toHaveLength(1)
    expect(useWorkspaceStore.getState().workspaces[0].name).toBe('Agentur')
  })
})
```

- [ ] **Step 2: Test ausführen — erwartet FAIL**

```bash
npm run test:run src/store/workspace.store.test.ts
```

Erwartete Ausgabe: `FAIL` — "Cannot find module './workspace.store'"

- [ ] **Step 3: `src/store/workspace.store.ts` implementieren**

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'

export interface Workspace {
  id: string
  name: string
  logo_url: string | null
  role: 'owner' | 'member'
}

interface WorkspaceState {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  pendingCount: number
  isOnline: boolean
  loadWorkspaces: () => Promise<void>
  createWorkspace: (name: string) => Promise<void>
  setActiveWorkspace: (id: string) => void
  setPendingCount: (count: number) => void
  setOnline: (online: boolean) => void
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      activeWorkspaceId: null,
      pendingCount: 0,
      isOnline: true,

      loadWorkspaces: async () => {
        const { data, error } = await supabase
          .from('workspace_members')
          .select('workspace_id, role, workspaces(id, name, logo_url)')

        if (error) throw error

        const workspaces: Workspace[] = (data ?? []).map((m: any) => ({
          id: m.workspaces.id,
          name: m.workspaces.name,
          logo_url: m.workspaces.logo_url,
          role: m.role as 'owner' | 'member',
        }))

        set({ workspaces })

        const { activeWorkspaceId } = get()
        if (workspaces.length === 1 && !activeWorkspaceId) {
          set({ activeWorkspaceId: workspaces[0].id })
        }
      },

      createWorkspace: async (name) => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Nicht eingeloggt')

        const { data: ws, error: wsErr } = await supabase
          .from('workspaces')
          .insert({ name, created_by: user.id })
          .select()
          .single()
        if (wsErr) throw wsErr

        const { error: memberErr } = await supabase
          .from('workspace_members')
          .insert({ workspace_id: ws.id, user_id: user.id, role: 'owner' })
        if (memberErr) throw memberErr

        await get().loadWorkspaces()
        set({ activeWorkspaceId: ws.id })
      },

      setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),
      setPendingCount: (count) => set({ pendingCount: count }),
      setOnline: (online) => set({ isOnline: online }),
    }),
    {
      name: 'focus-workspace-v1',
      partialize: (s) => ({ activeWorkspaceId: s.activeWorkspaceId }),
    }
  )
)
```

- [ ] **Step 4: Tests laufen lassen — erwartet PASS**

```bash
npm run test:run src/store/workspace.store.test.ts
```

Erwartete Ausgabe: `5 tests passed`

- [ ] **Commit**

```bash
git add src/store/workspace.store.ts src/store/workspace.store.test.ts
git commit -m "feat: workspace.store — Zustand Store mit loadWorkspaces/createWorkspace"
```

---

## Task 7: WorkspacePicker.tsx

**Files:**
- Create: `src/core/workspace/WorkspacePicker.tsx`

- [ ] **Step 1: `src/core/workspace/WorkspacePicker.tsx` erstellen**

```typescript
import { useState } from 'react'
import { useWorkspaceStore, type Workspace } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'

function WorkspaceCard({ workspace, onSelect }: { workspace: Workspace; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 p-4 rounded-xl bg-[var(--bg1)] border border-[var(--border)] hover:border-primary/40 transition-colors text-left"
    >
      <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0 text-sm font-bold text-primary">
        {workspace.name.charAt(0).toUpperCase()}
      </div>
      <div>
        <p className="text-sm font-semibold text-[var(--text)]">{workspace.name}</p>
        <p className="text-xs text-[var(--text2)]">{workspace.role === 'owner' ? 'Inhaber' : 'Mitglied'}</p>
      </div>
      <span className="ml-auto text-[var(--text2)] text-sm">→</span>
    </button>
  )
}

export function WorkspacePicker() {
  const workspaces = useWorkspaceStore(s => s.workspaces)
  const setActiveWorkspace = useWorkspaceStore(s => s.setActiveWorkspace)
  const createWorkspace = useWorkspaceStore(s => s.createWorkspace)
  const signOut = useAuthStore(s => s.signOut)

  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    setError(null)
    try {
      await createWorkspace(newName.trim())
    } catch (err: any) {
      setError(err?.message ?? 'Fehler beim Erstellen')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="w-full max-w-md p-8">
        <h1 className="text-xl font-bold text-[var(--text)] mb-1">Workspace auswählen</h1>
        <p className="text-sm text-[var(--text2)] mb-6">
          {workspaces.length === 0 ? 'Erstelle deinen ersten Workspace.' : 'Wähle einen Workspace oder erstelle einen neuen.'}
        </p>

        {workspaces.length > 0 && (
          <div className="flex flex-col gap-2 mb-6">
            {workspaces.map(ws => (
              <WorkspaceCard key={ws.id} workspace={ws} onSelect={() => setActiveWorkspace(ws.id)} />
            ))}
          </div>
        )}

        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <p className="text-xs text-[var(--text2)] font-medium">Neuer Workspace</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="z.B. Agentur Müller"
              className="flex-1 px-3 py-2.5 rounded-xl bg-[var(--bg1)] border border-[var(--border)] text-sm text-[var(--text)] focus:outline-none focus:border-primary placeholder-[var(--text2)]"
            />
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {creating ? '…' : 'Erstellen'}
            </button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </form>

        <button
          onClick={signOut}
          className="mt-8 text-xs text-[var(--text2)] hover:text-[var(--text)] transition-colors"
        >
          Ausloggen
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript-Check**

```bash
npm run typecheck
```

Erwartete Ausgabe: Kein neuer Fehler.

- [ ] **Commit**

```bash
git add src/core/workspace/WorkspacePicker.tsx
git commit -m "feat: WorkspacePicker — Workspace auswählen oder neu erstellen"
```

---

## Task 8: WorkspaceSwitcher.tsx + NavSidebar.tsx updaten

**Files:**
- Create: `src/core/workspace/WorkspaceSwitcher.tsx`
- Modify: `src/components/layout/NavSidebar.tsx`

- [ ] **Step 1: `src/core/workspace/WorkspaceSwitcher.tsx` erstellen**

```typescript
import { useState, useRef, useEffect } from 'react'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'

export function WorkspaceSwitcher() {
  const workspaces       = useWorkspaceStore(s => s.workspaces)
  const activeId         = useWorkspaceStore(s => s.activeWorkspaceId)
  const setActive        = useWorkspaceStore(s => s.setActiveWorkspace)
  const pendingCount     = useWorkspaceStore(s => s.pendingCount)
  const isOnline         = useWorkspaceStore(s => s.isOnline)
  const signOut          = useAuthStore(s => s.signOut)

  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const active = workspaces.find(w => w.id === activeId)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative px-3 pt-3 pb-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[var(--bg1)] border border-[var(--border)] hover:border-primary/30 transition-colors"
      >
        <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">
          {active?.name.charAt(0).toUpperCase() ?? '?'}
        </div>
        <span className="text-sm font-semibold text-[var(--text)] truncate flex-1 text-left">
          {active?.name ?? 'Kein Workspace'}
        </span>
        {pendingCount > 0 && (
          <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-1.5 py-0.5 font-medium flex-shrink-0">
            ⚡{pendingCount}
          </span>
        )}
        {!isOnline && (
          <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Offline" />
        )}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text2)] flex-shrink-0">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-3 right-3 mt-1 py-1 rounded-xl bg-[var(--bg1)] border border-[var(--border)] shadow-lg z-50">
          {workspaces.map(ws => (
            <button
              key={ws.id}
              onClick={() => { setActive(ws.id); setOpen(false) }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-[var(--bg2)] transition-colors
                ${ws.id === activeId ? 'text-primary font-medium' : 'text-[var(--text)]'}`}
            >
              {ws.id === activeId && <span className="text-xs">✓</span>}
              {ws.id !== activeId && <span className="w-3" />}
              {ws.name}
            </button>
          ))}
          <div className="h-px mx-3 bg-[var(--border)] my-1" />
          <button
            onClick={signOut}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--text2)] hover:text-red-400 hover:bg-[var(--bg2)] transition-colors text-left"
          >
            Ausloggen
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: `src/components/layout/NavSidebar.tsx` updaten**

Ersetze den Logo-Block (Zeilen 104–115) mit dem WorkspaceSwitcher. Ändere nur den oberen Teil der Sidebar:

```typescript
// Füge am Anfang der Imports hinzu:
import { WorkspaceSwitcher } from '@/core/workspace/WorkspaceSwitcher'
```

Ersetze diesen Block in der JSX:
```typescript
// ALT (zu ersetzen):
      {/* Logo */}
      <div
        data-tauri-drag-region
        className="px-4 py-4 border-b border-[var(--border)] flex items-center gap-2.5"
      >
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </div>
        <span className="text-sm font-bold text-[var(--text)] tracking-tight">Cynera Focus</span>
      </div>
```

```typescript
// NEU:
      {/* Workspace Switcher */}
      <div data-tauri-drag-region className="border-b border-[var(--border)]">
        <WorkspaceSwitcher />
      </div>
```

- [ ] **Step 3: Dev-Server starten und visuell prüfen**

```bash
npm run tauri dev
```

Erwartete Darstellung:
- Sidebar zeigt WorkspaceSwitcher statt festem Logo
- Klick auf den Switcher öffnet ein Dropdown mit Workspace-Namen
- "Ausloggen"-Option im Dropdown vorhanden

- [ ] **Commit**

Committe App.tsx, NavSidebar.tsx, WorkspaceSwitcher.tsx zusammen:

```bash
git add src/App.tsx src/components/layout/NavSidebar.tsx src/core/workspace/WorkspaceSwitcher.tsx
git commit -m "feat: WorkspaceSwitcher in NavSidebar + Auth/Workspace-Gate in App.tsx"
```

---

## Task 9: SQLite Migration v2 — Workspace-Spalten

**Files:**
- Modify: `src-tauri/src/db/migrations.rs`

- [ ] **Step 1: Failing-Test schreiben**

Füge in `src-tauri/src/db/migrations.rs` in den `tests`-Block hinzu:

```rust
#[test]
fn migration_v2_adds_workspace_columns() {
    let conn = in_memory_db();
    run(&conn).unwrap();
    // workspace_id muss in customers existieren
    let cols: Vec<String> = conn.prepare("PRAGMA table_info(customers)").unwrap()
        .query_map([], |r| r.get::<_, String>(1)).unwrap()
        .filter_map(|r| r.ok())
        .collect();
    assert!(cols.contains(&"workspace_id".to_string()), "workspace_id fehlt in customers");
    assert!(cols.contains(&"created_by".to_string()), "created_by fehlt in customers");
    assert!(cols.contains(&"pending_sync".to_string()), "pending_sync fehlt in customers");
}
```

- [ ] **Step 2: Test ausführen — erwartet FAIL**

```bash
cd src-tauri && cargo test migration_v2_adds_workspace_columns -- --nocapture
```

Erwartete Ausgabe: `FAILED` — assertion `workspace_id fehlt in customers`

- [ ] **Step 3: Migration v2 in `migrations.rs` implementieren**

Ändere `CURRENT_VERSION = 1` zu `CURRENT_VERSION = 3` und füge in `apply()` hinzu:

```rust
const CURRENT_VERSION: u32 = 3;

fn apply(conn: &Connection, version: u32) -> Result<(), AppError> {
    match version {
        1 => {
            let now = chrono::Utc::now().to_rfc3339();
            conn.execute(
                "INSERT OR IGNORE INTO customers (id, name, is_private, created_at, updated_at)
                 VALUES ('__cynera_privat__', 'Privat', 1, ?1, ?2)",
                rusqlite::params![now, now],
            )?;
            Ok(())
        }
        2 => {
            // Workspace-Spalten zu allen Datentabellen hinzufügen
            let tables = [
                "customers", "todos", "notes", "kpis", "deadlines",
                "crm_follow_ups", "health_scores", "time_entries",
                "folders", "files", "chat_messages", "emails",
            ];
            for table in &tables {
                conn.execute_batch(&format!(
                    "ALTER TABLE {table} ADD COLUMN workspace_id TEXT NOT NULL DEFAULT '';
                     ALTER TABLE {table} ADD COLUMN created_by   TEXT NOT NULL DEFAULT '';
                     ALTER TABLE {table} ADD COLUMN pending_sync INTEGER NOT NULL DEFAULT 0;"
                ))?;
            }
            Ok(())
        }
        3 => {
            conn.execute_batch(r#"
                CREATE TABLE IF NOT EXISTS sync_queue (
                    id          TEXT PRIMARY KEY,
                    table_name  TEXT NOT NULL,
                    record_id   TEXT NOT NULL,
                    operation   TEXT NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
                    payload     TEXT NOT NULL,
                    created_at  TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sync_meta (
                    key   TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
            "#)?;
            Ok(())
        }
        _ => Ok(()),
    }
}
```

- [ ] **Step 4: Test erneut ausführen — erwartet PASS**

```bash
cd src-tauri && cargo test migration_v2_adds_workspace_columns -- --nocapture
```

Erwartete Ausgabe: `test migration_v2_adds_workspace_columns ... ok`

- [ ] **Step 5: Alle bestehenden Rust-Tests laufen lassen**

```bash
cd src-tauri && cargo test
```

Erwartete Ausgabe: Alle bestehenden Tests weiter grün. Wenn `delete_private_customer_fails` oder andere Tests auf Spaltenanzahl angewiesen sind, könnten sie fehlschlagen — dann Tests anpassen.

- [ ] **Commit**

```bash
git add src-tauri/src/db/migrations.rs
git commit -m "feat: SQLite Migration v2+v3 — workspace_id, pending_sync, sync_queue"
```

---

## Task 10: DbPool Clone + SyncState + core/auth/mod.rs

**Files:**
- Modify: `src-tauri/src/db/pool.rs`
- Create: `src-tauri/src/core/mod.rs`
- Create: `src-tauri/src/core/auth/mod.rs`

- [ ] **Step 1: `DbPool` Clone-Implementierung in `pool.rs`**

Füge nach dem `impl DbPool`-Block hinzu:

```rust
impl Clone for DbPool {
    fn clone(&self) -> Self {
        DbPool { conn: std::sync::Arc::clone(&self.conn) }
    }
}
```

- [ ] **Step 2: Failing-Test für set_auth_token schreiben**

In `src-tauri/src/core/auth/mod.rs` (noch zu erstellen) wird es einen `SyncState`-Struct geben. Schreibe zuerst den Test. Erstelle temporär `src-tauri/src/core/auth/mod.rs`:

```rust
use std::sync::{Arc, Mutex};

#[derive(Clone, Default)]
pub struct SyncState {
    pub token: Arc<Mutex<Option<String>>>,
    pub supabase_url: String,
    pub anon_key: String,
}

impl SyncState {
    pub fn new() -> Self {
        SyncState {
            token: Arc::new(Mutex::new(None)),
            supabase_url: option_env!("SUPABASE_URL").unwrap_or("").to_string(),
            anon_key: option_env!("SUPABASE_ANON_KEY").unwrap_or("").to_string(),
        }
    }

    pub fn set_token(&self, token: String) {
        *self.token.lock().unwrap() = Some(token);
    }

    pub fn get_token(&self) -> Option<String> {
        self.token.lock().unwrap().clone()
    }
}

#[tauri::command]
pub fn set_auth_token(
    token: String,
    state: tauri::State<'_, SyncState>,
) -> Result<(), String> {
    state.set_token(token);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sync_state_set_and_get_token() {
        let state = SyncState::new();
        assert!(state.get_token().is_none());
        state.set_token("test-jwt-123".to_string());
        assert_eq!(state.get_token(), Some("test-jwt-123".to_string()));
    }

    #[test]
    fn sync_state_clone_shares_token() {
        let state = SyncState::new();
        let clone = state.clone();
        state.set_token("shared-token".to_string());
        assert_eq!(clone.get_token(), Some("shared-token".to_string()));
    }
}
```

- [ ] **Step 3: `src-tauri/src/core/mod.rs` erstellen**

```rust
pub mod auth;
pub mod sync;
```

- [ ] **Step 4: Tests laufen lassen — erwartet PASS**

```bash
cd src-tauri && cargo test sync_state
```

Erwartete Ausgabe: `2 tests passed`

- [ ] **Commit**

```bash
git add src-tauri/src/db/pool.rs src-tauri/src/core/mod.rs src-tauri/src/core/auth/mod.rs
git commit -m "feat: DbPool Clone + SyncState + set_auth_token Command"
```

---

## Task 11: core/sync/mod.rs + push.rs + connectivity.rs + pull.rs

**Files:**
- Create: `src-tauri/src/core/sync/mod.rs`
- Create: `src-tauri/src/core/sync/push.rs`
- Create: `src-tauri/src/core/sync/connectivity.rs`
- Create: `src-tauri/src/core/sync/pull.rs`

- [ ] **Step 1: `src-tauri/src/core/sync/mod.rs` erstellen**

```rust
pub mod connectivity;
pub mod push;
pub mod pull;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::{AppError, db::pool::DbPool};
use super::auth::SyncState;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncEntry {
    pub id: String,
    pub table_name: String,
    pub record_id: String,
    pub operation: String,
    pub payload: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct SyncStatus {
    pub pending_count: u32,
    pub last_synced_at: String,
    pub is_online: bool,
}

pub fn enqueue(
    conn: &Connection,
    table_name: &str,
    record_id: &str,
    operation: &str,
    payload: serde_json::Value,
) -> Result<(), AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, table_name, record_id, operation, payload.to_string(), now],
    )?;
    Ok(())
}

pub fn get_pending_count(conn: &Connection) -> Result<u32, AppError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sync_queue", [], |r| r.get(0)
    )?;
    Ok(count as u32)
}

pub fn get_last_synced_at(conn: &Connection) -> String {
    conn.query_row(
        "SELECT value FROM sync_meta WHERE key = 'last_sync_at'",
        [],
        |r| r.get::<_, String>(0),
    ).unwrap_or_default()
}

pub fn set_last_synced_at(conn: &Connection, ts: &str) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO sync_meta (key, value) VALUES ('last_sync_at', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [ts],
    )?;
    Ok(())
}

#[tauri::command]
pub async fn get_sync_status(
    db: tauri::State<'_, DbPool>,
    sync: tauri::State<'_, SyncState>,
) -> Result<SyncStatus, AppError> {
    let conn = db.conn();
    let pending_count = get_pending_count(&conn)?;
    let last_synced_at = get_last_synced_at(&conn);
    let is_online = sync.supabase_url.is_empty().not();
    Ok(SyncStatus { pending_count, last_synced_at, is_online })
}

#[tauri::command]
pub async fn sync_now(
    db: tauri::State<'_, DbPool>,
    sync: tauri::State<'_, SyncState>,
) -> Result<SyncStatus, AppError> {
    let client = reqwest::Client::new();
    push::flush_pending(&client, &sync, &db).await?;
    let conn = db.conn();
    let pending_count = get_pending_count(&conn)?;
    let last_synced_at = get_last_synced_at(&conn);
    Ok(SyncStatus { pending_count, last_synced_at, is_online: true })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{schema, migrations};

    fn setup() -> (DbPool, Connection) {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();
        migrations::run(&conn).unwrap();
        // DbPool für den Rückgabewert, direkte conn für Tests
        let pool = DbPool::new(std::path::Path::new(":memory:")).unwrap();
        (pool, conn)
    }

    #[test]
    fn enqueue_adds_entry() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        crate::db::schema::create_tables(&conn).unwrap();
        crate::db::migrations::run(&conn).unwrap();

        let payload = serde_json::json!({"id": "c1", "name": "Test"});
        enqueue(&conn, "customers", "c1", "INSERT", payload).unwrap();
        let count = get_pending_count(&conn).unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn last_synced_at_roundtrip() {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::schema::create_tables(&conn).unwrap();
        crate::db::migrations::run(&conn).unwrap();

        set_last_synced_at(&conn, "2026-05-14T10:00:00Z").unwrap();
        assert_eq!(get_last_synced_at(&conn), "2026-05-14T10:00:00Z");
    }
}
```

Hinweis: `is_online.not()` braucht `use std::ops::Not;` — alternativ `!is_online` verwenden. Korrigiere im Impl:

```rust
let is_online = !sync.supabase_url.is_empty();
```

- [ ] **Step 2: `src-tauri/src/core/sync/push.rs` erstellen**

```rust
use crate::{AppError, db::pool::DbPool};
use super::{SyncEntry, mod::set_last_synced_at};
use super::super::auth::SyncState;

pub async fn flush_pending(
    client: &reqwest::Client,
    state: &SyncState,
    pool: &DbPool,
) -> Result<(), AppError> {
    let token = match state.get_token() {
        Some(t) => t,
        None => return Ok(()),
    };

    let entries = get_queue(pool)?;
    if entries.is_empty() { return Ok(()); }

    for entry in &entries {
        let success = match entry.operation.as_str() {
            "INSERT" | "UPDATE" => {
                let url = format!("{}/rest/v1/{}", state.supabase_url, entry.table_name);
                let payload: serde_json::Value = serde_json::from_str(&entry.payload)
                    .map_err(|e| AppError::Validation(e.to_string()))?;

                let resp = client.post(&url)
                    .header("Authorization", format!("Bearer {token}"))
                    .header("apikey", &state.anon_key)
                    .header("Content-Type", "application/json")
                    .header("Prefer", "resolution=merge-duplicates,return=minimal")
                    .json(&payload)
                    .send()
                    .await
                    .map_err(|e| AppError::ExternalApi(e.to_string()))?;

                resp.status().is_success() || resp.status().as_u16() == 409
            }
            "DELETE" => {
                let url = format!(
                    "{}/rest/v1/{}?id=eq.{}",
                    state.supabase_url, entry.table_name, entry.record_id
                );
                let resp = client.delete(&url)
                    .header("Authorization", format!("Bearer {token}"))
                    .header("apikey", &state.anon_key)
                    .send()
                    .await
                    .map_err(|e| AppError::ExternalApi(e.to_string()))?;

                resp.status().is_success() || resp.status().as_u16() == 404
            }
            _ => false,
        };

        if success {
            delete_entry(pool, &entry.id)?;
        }
    }

    let now = chrono::Utc::now().to_rfc3339();
    let conn = pool.conn();
    set_last_synced_at(&conn, &now)?;

    Ok(())
}

fn get_queue(pool: &DbPool) -> Result<Vec<SyncEntry>, AppError> {
    let conn = pool.conn();
    let mut stmt = conn.prepare(
        "SELECT id, table_name, record_id, operation, payload, created_at
         FROM sync_queue ORDER BY created_at ASC LIMIT 100"
    )?;
    let entries = stmt.query_map([], |row| Ok(SyncEntry {
        id:         row.get(0)?,
        table_name: row.get(1)?,
        record_id:  row.get(2)?,
        operation:  row.get(3)?,
        payload:    row.get(4)?,
        created_at: row.get(5)?,
    }))?.collect::<Result<Vec<_>, _>>()?;
    Ok(entries)
}

fn delete_entry(pool: &DbPool, id: &str) -> Result<(), AppError> {
    pool.conn().execute("DELETE FROM sync_queue WHERE id = ?1", [id])?;
    Ok(())
}
```

Hinweis: `super::mod::set_last_synced_at` ist in Rust kein gültiger Pfad. Verwende stattdessen:

```rust
use super::set_last_synced_at;  // aus sync/mod.rs
```

Die `push.rs`-Datei liegt in `core/sync/`, also ist `super` das `sync`-Modul (mod.rs). Das ist korrekt.

- [ ] **Step 3: `src-tauri/src/core/sync/connectivity.rs` erstellen**

```rust
use std::time::Duration;
use tauri::Emitter;
use crate::db::pool::DbPool;
use super::super::auth::SyncState;
use super::push;

pub async fn run_loop(app: tauri::AppHandle, state: SyncState, pool: DbPool) {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap_or_default();

    let health_url = format!("{}/rest/v1/", state.supabase_url);
    let mut was_online = true;

    loop {
        tokio::time::sleep(Duration::from_secs(10)).await;

        if state.supabase_url.is_empty() { continue; }

        let is_online = client
            .head(&health_url)
            .header("apikey", &state.anon_key)
            .send()
            .await
            .map(|r| r.status().as_u16() < 500)
            .unwrap_or(false);

        if is_online != was_online {
            let _ = app.emit("cynera://connectivity-changed", is_online);
            was_online = is_online;
        }

        if is_online {
            if let Err(e) = push::flush_pending(&client, &state, &pool).await {
                eprintln!("[SyncWorker] Push failed: {e}");
            } else {
                let conn = pool.conn();
                if let Ok(count) = super::get_pending_count(&conn) {
                    let _ = app.emit("cynera://pending-count", count);
                }
            }
        }
    }
}
```

- [ ] **Step 4: `src-tauri/src/core/sync/pull.rs` erstellen**

```rust
use crate::{AppError, db::pool::DbPool};
use super::{set_last_synced_at, get_last_synced_at};
use super::super::auth::SyncState;

pub async fn pull_customers(
    client: &reqwest::Client,
    state: &SyncState,
    pool: &DbPool,
    workspace_id: &str,
) -> Result<usize, AppError> {
    let token = match state.get_token() {
        Some(t) => t,
        None => return Ok(0),
    };

    let last_sync = {
        let conn = pool.conn();
        get_last_synced_at(&conn)
    };

    let url = if last_sync.is_empty() {
        format!(
            "{}/rest/v1/customers?workspace_id=eq.{}&select=*",
            state.supabase_url, workspace_id
        )
    } else {
        format!(
            "{}/rest/v1/customers?workspace_id=eq.{}&updated_at=gt.{}&select=*",
            state.supabase_url, workspace_id, last_sync
        )
    };

    let resp = client.get(&url)
        .header("Authorization", format!("Bearer {token}"))
        .header("apikey", &state.anon_key)
        .send()
        .await
        .map_err(|e| AppError::ExternalApi(e.to_string()))?;

    if !resp.status().is_success() {
        return Ok(0);
    }

    let rows: Vec<serde_json::Value> = resp.json().await
        .map_err(|e| AppError::ExternalApi(e.to_string()))?;

    let count = rows.len();
    {
        let conn = pool.conn();
        for row in &rows {
            let id = row["id"].as_str().unwrap_or_default();
            let name = row["name"].as_str().unwrap_or_default();
            let workspace_id = row["workspace_id"].as_str().unwrap_or_default();
            let updated_at = row["updated_at"].as_str().unwrap_or_default();
            let created_at = row["created_at"].as_str().unwrap_or(updated_at);

            conn.execute(
                "INSERT INTO customers (id, name, workspace_id, created_by, created_at, updated_at, pending_sync)
                 VALUES (?1, ?2, ?3, '', ?4, ?5, 0)
                 ON CONFLICT(id) DO UPDATE SET
                   name = excluded.name,
                   updated_at = excluded.updated_at,
                   pending_sync = 0
                 WHERE excluded.updated_at > customers.updated_at",
                rusqlite::params![id, name, workspace_id, created_at, updated_at],
            ).map_err(AppError::from)?;
        }
        let now = chrono::Utc::now().to_rfc3339();
        set_last_synced_at(&conn, &now)?;
    }

    Ok(count)
}
```

- [ ] **Step 5: Rust kompilieren**

```bash
cd src-tauri && cargo build 2>&1 | head -50
```

Erwartete Ausgabe: Keine Fehler (oder nur Warnings über unbenutzte Imports — diese werden in Task 12 behoben).

- [ ] **Step 6: Sync-Tests laufen lassen**

```bash
cd src-tauri && cargo test enqueue_adds_entry last_synced_at_roundtrip sync_state
```

Erwartete Ausgabe: Alle 4 Tests grün.

- [ ] **Commit**

```bash
git add src-tauri/src/core/
git commit -m "feat: Rust SyncWorker — enqueue, push, pull, connectivity loop"
```

---

## Task 12: main.rs — SyncState verwalten + Background-Task starten + Commands registrieren

**Files:**
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/.cargo/config.toml` (erstellen falls nicht vorhanden)

- [ ] **Step 1: `src-tauri/.cargo/config.toml` anpassen**

Öffne oder erstelle `src-tauri/.cargo/config.toml` und füge hinzu:

```toml
[env]
SUPABASE_URL = "https://dein-projekt.supabase.co"
SUPABASE_ANON_KEY = "dein-anon-key"
```

Ersetze die Werte mit denen aus Task 1.

- [ ] **Step 2: `src-tauri/src/main.rs` updaten**

Ersetze die gesamte `main.rs` mit folgendem Inhalt (alle bestehenden Commands bleiben erhalten):

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod email;
mod error;
mod db;
mod commands;
mod services;
mod core;

pub use error::AppError;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};
use email::db::EmailDb;
use db::pool::DbPool;
use core::auth::SyncState;

fn groq_key() -> &'static str {
    option_env!("GROQ_API_KEY").unwrap_or("")
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct Message {
    role: String,
    content: String,
}

#[tauri::command]
async fn focus_ai_chat(window: tauri::WebviewWindow, messages: Vec<Message>) -> Result<(), String> {
    let key = groq_key();
    if key.is_empty() {
        return Err("GROQ_API_KEY nicht konfiguriert.".to_string());
    }

    let client = reqwest::Client::new();
    let payload = serde_json::json!({
        "model": "llama-3.1-8b-instant",
        "messages": messages,
        "stream": true,
        "max_tokens": 2048,
        "temperature": 0.7
    });

    let response = client
        .post("https://api.groq.com/openai/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", key))
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Netzwerkfehler: {}", e))?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
            if let Some(msg) = json["error"]["message"].as_str() {
                return Err(msg.to_string());
            }
        }
        return Err(format!("API Fehler HTTP {}", status));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| format!("Stream-Fehler: {}", e))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].trim().to_string();
            buffer = buffer[pos + 1..].to_string();

            if let Some(data) = line.strip_prefix("data: ") {
                let data = data.trim();
                if data == "[DONE]" {
                    let _ = window.emit("ai-done", ());
                    return Ok(());
                }
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(content) = json["choices"][0]["delta"]["content"].as_str() {
                        if !content.is_empty() {
                            let _ = window.emit("ai-chunk", content.to_string());
                        }
                    }
                }
            }
        }
    }

    let _ = window.emit("ai-done", ());
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path()
                .app_data_dir()
                .expect("App-Data-Verzeichnis nicht gefunden");
            std::fs::create_dir_all(&data_dir)
                .expect("App-Data-Verzeichnis konnte nicht erstellt werden");

            let db_path = data_dir.join("focus.db");
            let db_pool = DbPool::new(&db_path)
                .expect("focus.db konnte nicht geöffnet werden");
            app.manage(db_pool.clone());

            let sync_state = SyncState::new();
            app.manage(sync_state.clone());

            let email_db_path = data_dir.join("emails.db");
            let conn = rusqlite::Connection::open(&email_db_path)
                .expect("emails.db konnte nicht geöffnet werden");
            email::db::init_schema(&conn)
                .expect("Datenbankschema konnte nicht initialisiert werden");
            app.manage(EmailDb(std::sync::Mutex::new(conn)));

            let window = app.get_webview_window("main").unwrap();
            window.set_title("Focus").unwrap();
            window.center().unwrap();

            // Sync-Background-Task starten
            let app_handle = app.handle().clone();
            tokio::spawn(async move {
                core::sync::connectivity::run_loop(app_handle, sync_state, db_pool).await;
            });

            #[cfg(target_os = "macos")]
            {
                use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
                apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None)
                    .expect("Unsupported platform!");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            focus_ai_chat,
            // Auth + Sync
            core::auth::set_auth_token,
            core::sync::get_sync_status,
            core::sync::sync_now,
            // Customers
            commands::customer::get_customers,
            commands::customer::upsert_customer,
            commands::customer::delete_customer,
            // Todos
            commands::todo::get_todos,
            commands::todo::upsert_todo,
            commands::todo::delete_todo,
            // Notes
            commands::note::get_notes,
            commands::note::upsert_note,
            commands::note::delete_note,
            // KPIs
            commands::kpi::get_kpis,
            commands::kpi::upsert_kpi,
            commands::kpi::delete_kpi,
            // Time
            commands::time_entry::get_time_entries,
            commands::time_entry::add_time_entry,
            commands::time_entry::delete_time_entry,
            // Chat
            commands::chat::get_chat_messages,
            commands::chat::add_chat_message,
            commands::chat::mark_chat_read,
            commands::chat::delete_chat_message,
            // Files
            commands::folder::cmd_get_folders,
            commands::folder::cmd_create_folder,
            commands::folder::cmd_delete_folder,
            commands::folder::cmd_get_files,
            commands::folder::cmd_add_file,
            commands::folder::cmd_delete_file,
            // CRM
            commands::crm::get_follow_ups,
            commands::crm::upsert_follow_up,
            commands::crm::delete_follow_up,
            // Company
            commands::company::get_company_settings,
            commands::company::update_company_settings,
            // Email
            email::commands::email_get_accounts,
            email::commands::email_test_connection,
            email::commands::email_add_account,
            email::commands::email_remove_account,
            email::commands::email_detect_provider,
            email::commands::email_sync,
            email::commands::email_list,
            email::commands::email_get_body,
            email::commands::email_mark_read,
            email::commands::email_assign_customer,
            email::commands::email_delete,
        ])
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten der Anwendung");
}
```

- [ ] **Step 3: Kompilieren**

```bash
cd src-tauri && cargo build 2>&1 | head -80
```

Erwartete Ausgabe: `Finished` ohne Fehler. Warnings über unbenutzte Variablen sind OK.

- [ ] **Step 4: App starten**

```bash
npm run tauri dev
```

Erwartete Darstellung: App startet, zeigt Login-Screen (weil kein Supabase-User eingeloggt).

- [ ] **Commit**

```bash
git add src-tauri/src/main.rs src-tauri/.cargo/config.toml
git commit -m "feat: main.rs — SyncState, Background Sync-Task, neue Commands registriert"
```

---

## Task 13: Frontend Token-Bridge + Connectivity-Event

**Files:**
- Create: `src/core/sync/useSyncBridge.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: `src/core/sync/useSyncBridge.ts` erstellen**

```typescript
import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspace.store'

export function useSyncBridge() {
  const setOnline = useWorkspaceStore(s => s.setOnline)
  const setPendingCount = useWorkspaceStore(s => s.setPendingCount)

  useEffect(() => {
    // 1. Auth-Token bei Änderung an Rust übergeben
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.access_token) {
          invoke('set_auth_token', { token: session.access_token }).catch(console.error)
        }
      }
    )

    // 2. Connectivity-Events empfangen
    const unlistenConnectivity = listen<boolean>(
      'cynera://connectivity-changed',
      (event) => setOnline(event.payload)
    )

    // 3. Pending-Count-Events empfangen
    const unlistenPending = listen<number>(
      'cynera://pending-count',
      (event) => setPendingCount(event.payload)
    )

    return () => {
      subscription.unsubscribe()
      unlistenConnectivity.then(fn => fn())
      unlistenPending.then(fn => fn())
    }
  }, [setOnline, setPendingCount])
}
```

- [ ] **Step 2: `useSyncBridge` in `App.tsx` einbinden**

Füge in `src/App.tsx` den Import und Aufruf hinzu:

```typescript
// Import hinzufügen (nach den anderen Imports):
import { useSyncBridge } from '@/core/sync/useSyncBridge'

// Im App()-Funktionskörper, nach den anderen useEffect-Aufrufen:
useSyncBridge()
```

- [ ] **Step 3: TypeScript-Check**

```bash
npm run typecheck
```

Erwartete Ausgabe: Kein neuer Fehler.

- [ ] **Step 4: Integration testen**

```bash
npm run tauri dev
```

1. App startet → Login-Screen erscheint
2. Login mit Test-Account (Task 1 Step 3) → WorkspacePicker erscheint
3. Ersten Workspace erstellen → Haupt-App erscheint
4. WorkspaceSwitcher zeigt Workspace-Name oben in der Sidebar
5. DevTools → Network: Supabase-Requests sichtbar

- [ ] **Commit**

```bash
git add src/core/sync/useSyncBridge.ts src/App.tsx
git commit -m "feat: Token-Bridge — Auth-Token an Rust + Connectivity/PendingCount Events"
```

---

## Task 14: Customers workspace-aware machen (Pattern für alle Module)

**Files:**
- Modify: `src-tauri/src/db/customer.rs`
- Modify: `src-tauri/src/commands/customer.rs`
- Modify: `src/services/customer.service.ts`
- Modify: `src/store/customers.store.ts`

- [ ] **Step 1: Failing-Test für workspace-gefilterte Customers schreiben**

Füge in `src-tauri/src/db/customer.rs` im `tests`-Block hinzu:

```rust
#[test]
fn get_all_filters_by_workspace_id() {
    let conn = setup();

    // Zwei Kunden in verschiedenen Workspaces anlegen
    conn.execute(
        "INSERT INTO customers (id, name, workspace_id, created_by, created_at, updated_at)
         VALUES ('c1', 'Workspace A', 'ws-a', 'u1', '2026-01-01', '2026-01-01')",
        [],
    ).unwrap();
    conn.execute(
        "INSERT INTO customers (id, name, workspace_id, created_by, created_at, updated_at)
         VALUES ('c2', 'Workspace B', 'ws-b', 'u1', '2026-01-01', '2026-01-01')",
        [],
    ).unwrap();

    let result = get_all(&conn, "ws-a").unwrap();
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].name, "Workspace A");
}

#[test]
fn upsert_sets_workspace_id() {
    let conn = setup();
    let payload = UpsertCustomerPayload {
        id: None,
        name: "Workspace-Test".to_string(),
        company: None, email: None, phone: None,
        status: None, priority: None, tags: None,
        workspace_id: "ws-test".to_string(),
        created_by: "u-test".to_string(),
    };
    let customer = upsert(&conn, payload).unwrap();
    assert_eq!(customer.workspace_id, "ws-test");
}
```

- [ ] **Step 2: Test ausführen — erwartet FAIL**

```bash
cd src-tauri && cargo test get_all_filters_by_workspace_id upsert_sets_workspace_id -- --nocapture
```

Erwartete Ausgabe: Compile-Fehler — `workspace_id` fehlt in `UpsertCustomerPayload` und `get_all` hat falsches Signatur.

- [ ] **Step 3: `src-tauri/src/db/customer.rs` updaten**

Ersetze die gesamte Datei:

```rust
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Customer {
    pub id: String,
    pub name: String,
    pub company: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub status: String,
    pub priority: String,
    pub tags: Vec<String>,
    pub is_private: bool,
    pub workspace_id: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertCustomerPayload {
    pub id: Option<String>,
    pub name: String,
    pub company: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub tags: Option<Vec<String>>,
    pub workspace_id: String,
    pub created_by: String,
}

pub fn get_all(conn: &Connection, workspace_id: &str) -> Result<Vec<Customer>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, company, email, phone, status, priority, tags, is_private, workspace_id, created_at, updated_at
         FROM customers
         WHERE is_private = 0 AND workspace_id = ?1
         ORDER BY name ASC"
    )?;

    let customers = stmt.query_map([workspace_id], |row| {
        let tags_json: String = row.get(7)?;
        Ok(Customer {
            id:           row.get(0)?,
            name:         row.get(1)?,
            company:      row.get(2)?,
            email:        row.get(3)?,
            phone:        row.get(4)?,
            status:       row.get(5)?,
            priority:     row.get(6)?,
            tags:         serde_json::from_str(&tags_json).unwrap_or_default(),
            is_private:   row.get::<_, i32>(8)? != 0,
            workspace_id: row.get(9)?,
            created_at:   row.get(10)?,
            updated_at:   row.get(11)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;

    Ok(customers)
}

pub fn upsert(conn: &Connection, payload: UpsertCustomerPayload) -> Result<Customer, AppError> {
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    let tags_json = serde_json::to_string(&payload.tags.unwrap_or_default())
        .map_err(|e| AppError::Validation(e.to_string()))?;

    conn.execute(
        "INSERT INTO customers (id, name, company, email, phone, status, priority, tags, workspace_id, created_by, pending_sync, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, ?11, ?11)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           company = excluded.company,
           email = excluded.email,
           phone = excluded.phone,
           status = excluded.status,
           priority = excluded.priority,
           tags = excluded.tags,
           pending_sync = 1,
           updated_at = excluded.updated_at",
        rusqlite::params![
            id,
            payload.name,
            payload.company,
            payload.email,
            payload.phone,
            payload.status.unwrap_or_else(|| "aktiv".to_string()),
            payload.priority.unwrap_or_else(|| "normal".to_string()),
            tags_json,
            payload.workspace_id,
            payload.created_by,
            now,
        ],
    )?;

    // Sync-Queue Eintrag erstellen
    let customer_json = serde_json::json!({
        "id": id,
        "name": payload.name,
        "workspace_id": payload.workspace_id,
        "updated_at": now,
    });
    crate::core::sync::enqueue(conn, "customers", &id, "INSERT", customer_json)?;

    let customer = conn.query_row(
        "SELECT id, name, company, email, phone, status, priority, tags, is_private, workspace_id, created_at, updated_at
         FROM customers WHERE id = ?1",
        [&id],
        |row| {
            let tags_json: String = row.get(7)?;
            Ok(Customer {
                id:           row.get(0)?,
                name:         row.get(1)?,
                company:      row.get(2)?,
                email:        row.get(3)?,
                phone:        row.get(4)?,
                status:       row.get(5)?,
                priority:     row.get(6)?,
                tags:         serde_json::from_str(&tags_json).unwrap_or_default(),
                is_private:   row.get::<_, i32>(8)? != 0,
                workspace_id: row.get(9)?,
                created_at:   row.get(10)?,
                updated_at:   row.get(11)?,
            })
        },
    )?;

    Ok(customer)
}

pub fn delete(conn: &Connection, id: &str, workspace_id: &str) -> Result<(), AppError> {
    crate::core::sync::enqueue(
        conn, "customers", id, "DELETE",
        serde_json::json!({"id": id, "workspace_id": workspace_id}),
    )?;
    let affected = conn.execute(
        "DELETE FROM customers WHERE id = ?1 AND is_private = 0 AND workspace_id = ?2",
        rusqlite::params![id, workspace_id],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("Customer {id} not found")));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{schema, migrations};

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();
        migrations::run(&conn).unwrap();
        conn
    }

    #[test]
    fn upsert_creates_new_customer() {
        let conn = setup();
        let payload = UpsertCustomerPayload {
            id: None,
            name: "Max Mustermann".to_string(),
            company: Some("Muster GmbH".to_string()),
            email: Some("max@muster.de".to_string()),
            phone: None,
            status: None,
            priority: None,
            tags: Some(vec!["vip".to_string()]),
            workspace_id: "ws-1".to_string(),
            created_by: "u-1".to_string(),
        };
        let customer = upsert(&conn, payload).unwrap();
        assert_eq!(customer.name, "Max Mustermann");
        assert_eq!(customer.workspace_id, "ws-1");
        assert!(!customer.is_private);
    }

    #[test]
    fn get_all_filters_by_workspace_id() {
        let conn = setup();
        conn.execute(
            "INSERT INTO customers (id, name, workspace_id, created_by, created_at, updated_at)
             VALUES ('c1', 'Workspace A', 'ws-a', 'u1', '2026-01-01', '2026-01-01')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO customers (id, name, workspace_id, created_by, created_at, updated_at)
             VALUES ('c2', 'Workspace B', 'ws-b', 'u1', '2026-01-01', '2026-01-01')",
            [],
        ).unwrap();
        let result = get_all(&conn, "ws-a").unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "Workspace A");
    }

    #[test]
    fn upsert_sets_workspace_id() {
        let conn = setup();
        let payload = UpsertCustomerPayload {
            id: None,
            name: "Workspace-Test".to_string(),
            company: None, email: None, phone: None,
            status: None, priority: None, tags: None,
            workspace_id: "ws-test".to_string(),
            created_by: "u-test".to_string(),
        };
        let customer = upsert(&conn, payload).unwrap();
        assert_eq!(customer.workspace_id, "ws-test");
    }

    #[test]
    fn delete_removes_customer_in_workspace() {
        let conn = setup();
        let payload = UpsertCustomerPayload {
            id: Some("del-test".to_string()),
            name: "Zu löschen".to_string(),
            company: None, email: None, phone: None,
            status: None, priority: None, tags: None,
            workspace_id: "ws-del".to_string(),
            created_by: "u-1".to_string(),
        };
        upsert(&conn, payload).unwrap();
        delete(&conn, "del-test", "ws-del").unwrap();
        let customers = get_all(&conn, "ws-del").unwrap();
        assert!(!customers.iter().any(|c| c.id == "del-test"));
    }
}
```

- [ ] **Step 4: `src-tauri/src/commands/customer.rs` updaten**

```rust
use tauri::State;
use crate::{AppError, db::{pool::DbPool, customer::{self, UpsertCustomerPayload}}};

#[tauri::command]
pub async fn get_customers(
    db: State<'_, DbPool>,
    workspace_id: String,
) -> Result<Vec<customer::Customer>, AppError> {
    let conn = db.conn();
    customer::get_all(&conn, &workspace_id)
}

#[tauri::command]
pub async fn upsert_customer(
    db: State<'_, DbPool>,
    payload: UpsertCustomerPayload,
) -> Result<customer::Customer, AppError> {
    let conn = db.conn();
    customer::upsert(&conn, payload)
}

#[tauri::command]
pub async fn delete_customer(
    db: State<'_, DbPool>,
    id: String,
    workspace_id: String,
) -> Result<(), AppError> {
    let conn = db.conn();
    customer::delete(&conn, &id, &workspace_id)
}
```

- [ ] **Step 5: `src/services/customer.service.ts` updaten**

```typescript
import { invoke } from '@tauri-apps/api/core'
import type { Customer, UpsertCustomerPayload } from '@/types/customer.types'

export const CustomerService = {
  getAll(workspaceId: string): Promise<Customer[]> {
    return invoke<Customer[]>('get_customers', { workspaceId })
  },

  upsert(payload: UpsertCustomerPayload & { workspaceId: string; createdBy: string }): Promise<Customer> {
    return invoke<Customer>('upsert_customer', { payload })
  },

  delete(id: string, workspaceId: string): Promise<void> {
    return invoke<void>('delete_customer', { id, workspaceId })
  },
}
```

- [ ] **Step 6: `src/store/customers.store.ts` updaten**

Importiere `useWorkspaceStore` und übergib `workspaceId` an alle Service-Calls:

```typescript
import { create } from 'zustand'
import { CustomerService } from '@/services/customer.service'
import { log } from '@/lib/logger'
import { useWorkspaceStore } from '@/store/workspace.store'
import type { Customer, UpsertCustomerPayload } from '@/types/customer.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface CustomersState {
  customers: Customer[]
  isLoading: boolean
  error: AppError | null
  init: () => Promise<void>
  upsert: (payload: UpsertCustomerPayload) => Promise<void>
  remove: (id: string) => Promise<void>
}

function upsertById(list: Customer[], updated: Customer): Customer[] {
  const idx = list.findIndex(c => c.id === updated.id)
  if (idx >= 0) {
    const next = [...list]; next[idx] = updated; return next
  }
  return [...list, updated]
}

export const useCustomersStore = create<CustomersState>()((set) => ({
  customers: [],
  isLoading: false,
  error: null,

  init: async () => {
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId
    if (!workspaceId) return
    set({ isLoading: true, error: null })
    try {
      const customers = await CustomerService.getAll(workspaceId)
      set({ customers, isLoading: false })
      log.info('Customers loaded', { count: customers.length, workspaceId })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load customers', { error })
    }
  },

  upsert: async (payload) => {
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId
    const user = (await import('@/store/auth.store')).useAuthStore.getState().user
    if (!workspaceId || !user) throw new Error('Kein aktiver Workspace oder User')
    try {
      const updated = await CustomerService.upsert({
        ...payload,
        workspaceId,
        createdBy: user.id,
      })
      set(s => ({ customers: upsertById(s.customers, updated) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to upsert customer', { error })
      throw err
    }
  },

  remove: async (id) => {
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId
    if (!workspaceId) throw new Error('Kein aktiver Workspace')
    try {
      await CustomerService.delete(id, workspaceId)
      set(s => ({ customers: s.customers.filter(c => c.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to delete customer', { id, error })
      throw err
    }
  },
}))
```

- [ ] **Step 7: `src/types/customer.types.ts` updaten**

Füge `workspaceId` zum Customer-Type hinzu:

```typescript
export interface Customer extends TimestampedEntity {
  id: string
  name: string
  company?: string
  email?: string
  phone?: string
  status: CustomerStatus
  priority: Priority
  tags: string[]
  isPrivate: boolean
  workspaceId: string  // NEU
}
```

- [ ] **Step 8: Alle Tests laufen lassen**

```bash
cd src-tauri && cargo test
```

Erwartete Ausgabe: Alle Tests grün (inkl. der neuen workspace-Tests).

```bash
npm run test:run
```

Erwartete Ausgabe: Alle TS-Tests grün.

- [ ] **Step 9: App starten und End-to-End testen**

```bash
npm run tauri dev
```

1. Login → WorkspacePicker → Workspace erstellen
2. Dashboard erscheint
3. In DevTools Console: Kein Fehler
4. Zu Clients navigieren — leere Liste für neuen Workspace
5. Neuen Client anlegen → erscheint in der Liste

- [ ] **Commit**

```bash
git add src-tauri/src/db/customer.rs src-tauri/src/commands/customer.rs src/services/customer.service.ts src/store/customers.store.ts src/types/customer.types.ts
git commit -m "feat: customers workspace-aware — get_all/upsert/delete mit workspace_id + sync_queue"
```

---

## Self-Review

**Spec-Abdeckung:**
- [x] Supabase Auth (Login, Session) → Tasks 2-5
- [x] Workspace-System (Erstellen, Auswählen, Switchen) → Tasks 6-8
- [x] SQLite Migration (workspace_id, pending_sync, sync_queue) → Task 9
- [x] Rust SyncState + set_auth_token → Task 10
- [x] Sync Engine (connectivity, push, pull) → Task 11
- [x] Background-Task in main.rs → Task 12
- [x] Token-Bridge (Frontend → Rust) → Task 13
- [x] Offline-Badge im WorkspaceSwitcher → Task 8 (pendingCount + isOnline-Anzeige)
- [x] Customers workspace-aware (Pattern für alle Module) → Task 14
- [ ] Rollen-Guard (Owner vs. Member): Nur in Supabase RLS, kein UI-Guard → akzeptiert für MVP
- [ ] Andere Module (todos, notes, etc.) workspace-aware machen → Sub-Projekt 2

**Typ-Konsistenz:**
- `workspace_id: String` in Rust ↔ `workspaceId: string` in TypeScript (camelCase via serde rename_all) ✓
- `SyncState` exportiert aus `core::auth` ✓  
- `enqueue()` in `core::sync::mod` importiert von `db/customer.rs` als `crate::core::sync::enqueue` ✓
- `DbPool.clone()` via `impl Clone` ✓

**Placeholder-Scan:** Keine TBD/TODO gefunden. Alle Steps enthalten Beispiel-Code.
