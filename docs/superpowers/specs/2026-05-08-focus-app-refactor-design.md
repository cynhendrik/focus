# Focus App — Full Refactor Design Spec

**Date:** 2026-05-08  
**Branch:** feature/v2-redesign  
**Approach:** Hybrid (new skeleton + vertical-slice-first porting)

---

## 1. Ziel

Die bestehende Focus-App (Cynera System OS) wird von einem monolithischen React/JS-Prototypen in eine professionelle, release-fähige Desktop-Applikation transformiert. Die App soll verkaufbar sein, einen Installer haben, sauber wartbar und von einem anderen Team übernommen werden können.

---

## 2. Technischer Stack

| Bereich | Alt | Neu |
|---|---|---|
| Tauri | 1.6 | 2.x |
| Sprache Frontend | JavaScript JSX | TypeScript TSX |
| CSS | Custom CSS-Variablen | Tailwind CSS 3 |
| State | Monolith-Store (472 Zeilen) | Zustand Slices (1 Store = 1 Domain) |
| Persistenz | localStorage | SQLite via Rust (r2d2/rusqlite) |
| Tests | Vitest (minimal) | Vitest + Testing Library |
| Logging | keine | tracing (Rust) + lib/logger.ts (TS) |
| Error-Handling | ad-hoc | zentralisiert (AppError enum) |

---

## 3. Architektur-Prinzip

**Vertical Slice First:** Der Kunden-Slice wird als erstes vollständig durchgebaut (DB → Rust → Service → Store → Route → Komponenten). Dieser Slice ist die Blaupause für alle weiteren Domains.

**Datenfluss (unidirektional):**

```
SQLite
  ↑↓
Rust Service (business logic wo nötig)
  ↑↓
Rust Command (thin, serialisiert/deserialisiert)
  ↑↓
TypeScript Service (invoke() wrapper, error handling)
  ↑↓
Zustand Store Slice (state + actions)
  ↑↓
Route (liest Store, ruft Actions auf)
  ↑↓
Component (props only, kein direkter Store-Zugriff)
```

**Strikte Regeln:**
- `invoke()` nur in `src/services/` — nirgendwo sonst
- Komponenten kennen keine Stores — nur Props + Callbacks
- Routes verbinden Store und Komponenten
- Business-Logik in `src/lib/` (TypeScript) oder `src-tauri/src/services/` (Rust)

---

## 4. Ordnerstruktur

```
src/
├── components/
│   ├── ui/              # Buttons, Input, Modal, Toast, Avatar, Badge …
│   ├── layout/          # AppShell, TopBar, Sidebar
│   └── [feature]/       # CustomerCard, TodoItem, NoteEditor, KpiRow …
├── routes/              # Screens (verbinden Store + Komponenten)
│   ├── CustomerRoute.tsx
│   ├── CrmRoute.tsx
│   ├── MailRoute.tsx
│   ├── CompanyRoute.tsx
│   └── OverviewRoute.tsx
├── store/               # Zustand Slices
│   ├── customers.store.ts
│   ├── todos.store.ts
│   ├── notes.store.ts
│   ├── kpis.store.ts
│   ├── crm.store.ts
│   ├── mail.store.ts
│   ├── time.store.ts
│   ├── files.store.ts
│   ├── chat.store.ts
│   ├── company.store.ts
│   └── ui.store.ts
├── services/            # Tauri invoke() wrapper
│   ├── customer.service.ts
│   ├── todo.service.ts
│   ├── note.service.ts
│   ├── kpi.service.ts
│   ├── crm.service.ts
│   ├── mail.service.ts
│   ├── time.service.ts
│   ├── files.service.ts
│   ├── chat.service.ts
│   ├── company.service.ts
│   └── ai.service.ts
├── lib/                 # Pure utilities (kein Tauri, kein React)
│   ├── healthScore.ts
│   ├── crmIntelligence.ts
│   ├── timeAggregations.ts
│   ├── formatters.ts
│   └── logger.ts
└── types/               # Alle TypeScript Interfaces & Enums
    ├── customer.types.ts
    ├── todo.types.ts
    ├── note.types.ts
    ├── kpi.types.ts
    ├── crm.types.ts
    ├── mail.types.ts
    ├── time.types.ts
    ├── file.types.ts
    ├── chat.types.ts
    ├── company.types.ts
    ├── ui.types.ts
    └── error.types.ts

src-tauri/src/
├── main.rs
├── error.rs             # AppError enum (zentralisiert)
├── db/
│   ├── mod.rs
│   ├── pool.rs          # DbPool (Arc<Mutex<Connection>>)
│   ├── schema.rs        # CREATE TABLE statements
│   └── migrations.rs    # Versionierte Migrationen
├── commands/            # Thin Tauri commands
│   ├── mod.rs
│   ├── customer.rs
│   ├── todo.rs
│   ├── note.rs
│   ├── kpi.rs
│   ├── crm.rs
│   ├── mail.rs
│   ├── time.rs
│   ├── files.rs
│   ├── chat.rs
│   ├── company.rs
│   └── ai.rs
└── services/            # Rust Business-Logik
    ├── mail_sync.rs     # IMAP sync (komplex)
    ├── export.rs        # JSON/CSV export
    └── ai_stream.rs     # Groq streaming
```

---

## 5. SQLite-Schema

### Migrations-System
`user_version` PRAGMA steuert automatische Migrationen beim App-Start.

### Tabellen

```sql
-- Kunden
CREATE TABLE customers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  company     TEXT,
  email       TEXT,
  phone       TEXT,
  status      TEXT DEFAULT 'aktiv',
  priority    TEXT DEFAULT 'normal',
  tags        TEXT DEFAULT '[]',
  notes_meta  TEXT DEFAULT '{}',
  is_private  INTEGER DEFAULT 0,  -- 1 = Privat-Bereich (id: '__cynera_privat__')
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Todos
CREATE TABLE todos (
  id          TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  status      TEXT DEFAULT 'open',
  priority    TEXT DEFAULT 'normal',
  due_date    TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Notes
CREATE TABLE notes (
  id          TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  content     TEXT DEFAULT '',
  pinned      INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- KPIs
CREATE TABLE kpis (
  id          TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  value       REAL,
  unit        TEXT,
  target      REAL,
  period      TEXT,
  updated_at  TEXT NOT NULL
);

-- CRM Follow-Ups
CREATE TABLE crm_follow_ups (
  id          TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  due_date    TEXT NOT NULL,
  status      TEXT DEFAULT 'offen',
  priority    TEXT DEFAULT 'normal',
  created_at  TEXT NOT NULL
);

-- Deadlines (Kunden-Fristen, separat von Todos)
CREATE TABLE deadlines (
  id          TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  due_date    TEXT NOT NULL,
  done        INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL
);

-- Health Scores
CREATE TABLE health_scores (
  id          TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  score       REAL NOT NULL,
  factors     TEXT DEFAULT '{}',
  recorded_at TEXT NOT NULL
);

-- Zeit
CREATE TABLE time_entries (
  id          TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  minutes     INTEGER NOT NULL,
  date        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE time_planning (
  id                 TEXT PRIMARY KEY DEFAULT 'singleton',
  global_week_hours  REAL DEFAULT 40,
  global_month_hours REAL DEFAULT 160,
  per_customer       TEXT DEFAULT '{}'
);

-- Ablage
CREATE TABLE folders (
  id          TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  parent_id   TEXT REFERENCES folders(id),
  created_at  TEXT NOT NULL
);

CREATE TABLE files (
  id          TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  folder_id   TEXT REFERENCES folders(id),
  name        TEXT NOT NULL,
  path        TEXT NOT NULL,
  size        INTEGER,
  mime_type   TEXT,
  created_at  TEXT NOT NULL
);

-- Chat
CREATE TABLE chat_messages (
  id          TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  sender      TEXT NOT NULL,
  read        INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL
);

-- Email (bestehende Struktur beibehalten)
CREATE TABLE email_accounts (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  display_name  TEXT,
  imap_host     TEXT NOT NULL,
  imap_port     INTEGER NOT NULL,
  last_synced_at TEXT,
  status        TEXT DEFAULT 'active'
);

CREATE TABLE emails (
  id          TEXT PRIMARY KEY,
  account_id  TEXT REFERENCES email_accounts(id) ON DELETE CASCADE,
  message_id  TEXT,
  from_addr   TEXT,
  to_addr     TEXT,
  subject     TEXT,
  preview     TEXT,
  body        TEXT,
  received_at TEXT,
  read        INTEGER DEFAULT 0,
  customer_id TEXT REFERENCES customers(id),
  tags        TEXT DEFAULT '[]'
);

-- Company / Settings
CREATE TABLE company_settings (
  id         TEXT PRIMARY KEY DEFAULT 'singleton',
  profile    TEXT DEFAULT '{}',
  modules    TEXT DEFAULT '{}',
  crm_config TEXT DEFAULT '{}',
  updated_at TEXT NOT NULL
);

-- Persistierter UI-State (ersetzt localStorage)
CREATE TABLE app_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Keys: 'theme', 'focusAiApiKey', 'hasSeenIntro', 'selectedCustomerId'
```

---

## 6. Rust-Backend

### Error-Handling (zentralisiert)

```rust
#[derive(Debug, thiserror::Error, serde::Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    #[error("DB error: {0}")]      Db(String),
    #[error("IO error: {0}")]      Io(String),
    #[error("IMAP error: {0}")]    Imap(String),
    #[error("Auth error: {0}")]    Auth(String),
    #[error("Not found: {0}")]     NotFound(String),
    #[error("Validation: {0}")]    Validation(String),
    #[error("External API: {0}")] ExternalApi(String),
}
```

Frontend empfängt strukturierte Fehler: `{ kind: "Db", message: "..." }`.

### Logging

- Rust: `tracing` + `tracing-subscriber`
- Logs: `{app_data_dir}/focus/logs/focus.log`
- Level: `FOCUS_LOG=debug` (dev), `info` (prod)
- TypeScript: `src/lib/logger.ts` wraps console.* in dev, Tauri log-Plugin in prod

### Services-Aufteilung (Rust vs. TypeScript)

| Operation | Rust | TypeScript |
|---|---|---|
| Email-Sync (IMAP) | ✅ | — |
| Export JSON/CSV | ✅ | — |
| FOCUS AI Streaming | ✅ | — |
| Keychain | ✅ | — |
| Health-Score-Berechnung | — | ✅ |
| CRM-Intelligence | — | ✅ |
| Zeit-Aggregationen | — | ✅ |

---

## 7. TypeScript-Types (Muster)

```typescript
// customer.types.ts
export type CustomerStatus = 'lead' | 'aktiv' | 'inaktiv' | 'lost'
export type Priority = 'low' | 'normal' | 'high'

export interface Customer {
  id: string
  name: string
  company?: string
  email?: string
  phone?: string
  status: CustomerStatus
  priority: Priority
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface UpsertCustomerPayload {
  id?: string
  name: string
  company?: string
  email?: string
  phone?: string
  status?: CustomerStatus
  priority?: Priority
  tags?: string[]
}
```

---

## 8. Zustand-Slices (Muster)

```typescript
// customers.store.ts
interface CustomersState {
  customers: Customer[]
  isLoading: boolean
  error: AppError | null
  init: () => Promise<void>
  upsert: (payload: UpsertCustomerPayload) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useCustomersStore = create<CustomersState>()((set) => ({
  customers: [],
  isLoading: false,
  error: null,
  init: async () => {
    set({ isLoading: true })
    const result = await CustomerService.getAll()
    set({ customers: result, isLoading: false })
  },
  upsert: async (payload) => {
    const updated = await CustomerService.upsert(payload)
    set(s => ({ customers: upsertById(s.customers, updated) }))
  },
  remove: async (id) => {
    await CustomerService.delete(id)
    set(s => ({ customers: s.customers.filter(c => c.id !== id) }))
  },
}))
```

---

## 9. Komponenten-Hierarchie

```
AppShell                        # Tauri window, Theme, Error Boundary
├── TopBar                      # Search, TimeEntry, FocusToggle, PrivatButton
├── Sidebar                     # CustomerList
└── MainArea
    ├── CustomerRoute           # Wenn Kunde ausgewählt
    │   ├── CustomerHeader      # Name, Status, Tabs
    │   └── [ActiveTab]
    │       ├── WorkflowPane    # Todos + Notes
    │       ├── DashboardPane   # KPIs + HealthScore
    │       ├── AblagePane      # Folders + Files
    │       ├── KommunikationPane
    │       ├── HistoriePane
    │       ├── ZeitPane
    │       └── SocialPane
    ├── CrmRoute                # GlobalCRM
    ├── MailRoute               # GlobalMailClient
    ├── CompanyRoute            # MeinUnternehmen
    └── OverviewRoute           # Kein Kunde ausgewählt
```

**Regel:** Routes lesen Stores. Komponenten kennen nur Props + Callbacks.

---

## 10. Branding & Build

```json
// tauri.conf.json
{
  "productName": "Focus",
  "version": "2.0.0",
  "bundle": {
    "identifier": "com.cynera.focus",
    "targets": ["nsis", "msi", "dmg", "appimage"]
  },
  "windows": [{
    "title": "Focus",
    "width": 1280,
    "height": 800,
    "minWidth": 900,
    "minHeight": 600
  }]
}
```

- **Version:** 2.0.0 (Signalisiert Neubeginn)
- **Installer:** NSIS (Windows), DMG (macOS), AppImage (Linux)
- **Auto-Updater:** Tauri updater plugin vorbereitet (Endpunkt TBD)
- **Icons:** Bestehende Icons bleiben, können später ersetzt werden

---

## 11. Migrations-Plan (Datenverlust vermeiden)

Da die App aktuell localStorage nutzt, braucht die erste Version einen **einmaligen Import-Wizard:**

1. Beim ersten Start der neuen App: Erkennung ob `cynera-os-v4` in localStorage existiert
2. Wenn ja: Import-Dialog anbieten (Daten aus localStorage in SQLite migrieren)
3. Nach erfolgreichem Import: localStorage-Key löschen
4. Beim normalen Start: direkt SQLite laden

---

## 12. Implementierungs-Reihenfolge

### Phase 1 — Skeleton + Template-Slice (Kunden)
1. Tauri 2 Upgrade + neue Ordnerstruktur
2. Tailwind einrichten + Design-Tokens aus globals.css portieren
3. SQLite-Schema + Migrations-System in Rust
4. AppError + Logging (Rust + TypeScript)
5. Kunden-Slice komplett: DB → Command → Service → Store → Route → Komponenten
6. App läuft mit Kunden aus SQLite

### Phase 2 — Core-Domains
7. Todos, Notes, KPIs (Template replizieren)
8. Zeit-Tracking
9. Ablage (Folders + Files)
10. Kommunikation (Chat)

### Phase 3 — Business-Features
11. CRM (Follow-Ups, Scoring)
12. Health Score (TypeScript lib)
13. Company Settings

### Phase 4 — Externe Features
14. Mail-Client (IMAP bleibt in Rust, UI neu)
15. FOCUS AI (Groq streaming bleibt)
16. Instagram (Social)
17. Focus Mode

### Phase 5 — Release
18. localStorage-Migration-Wizard
19. Command Palette
20. Error Boundaries
21. Installer konfigurieren
22. Auto-Updater Endpoint vorbereiten
