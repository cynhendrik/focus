# Cynera Focus v2 — Sub-Projekt 1: Workspace + User System
**Date:** 2026-05-14
**Status:** Approved
**Branch:** feature/v2-redesign

---

## Vision

Cynera Focus wird von einer Single-User Desktop-App zu einer Multi-User, Multi-Workspace Plattform ausgebaut. Ein Team teilt eine Supabase-Datenbank (Postgres), die Desktop-App arbeitet offline-first mit einem lokalen SQLite-Cache und einer Pending-Queue, die bei Reconnect gesynct wird.

Dieses Sub-Projekt legt das Fundament für alle weiteren Module (Dashboard, Clients, Tasks, Finances, Calendar, Email).

---

## Architektur-Überblick

```
┌─────────────────────────────────────────────────────┐
│                  Tauri Desktop App                   │
│                                                      │
│  ┌──────────────┐      ┌────────────────────────┐   │
│  │  React UI    │◄────►│  Supabase JS SDK       │   │
│  │  (Zustand)   │      │  (Auth + Realtime)     │   │
│  └──────┬───────┘      └────────────┬───────────┘   │
│         │                           │                │
│  ┌──────▼───────┐            ┌──────▼───────┐       │
│  │  Tauri       │            │  Supabase    │       │
│  │  Commands    │            │  (Postgres   │       │
│  │  (Rust)      │            │   + RLS)     │       │
│  └──────┬───────┘            └──────────────┘       │
│         │                                            │
│  ┌──────▼───────┐                                   │
│  │  SQLite      │  ← lokaler Cache + Pending Queue  │
│  │  (local)     │                                   │
│  └──────────────┘                                   │
└─────────────────────────────────────────────────────┘
```

**Datenpfad Online:**
1. UI schreibt → Tauri Command → SQLite (sofort) + Supabase (async)
2. Supabase Realtime → UI-Update bei anderen Nutzern

**Datenpfad Offline:**
1. UI schreibt → Tauri Command → SQLite mit `pending_sync = true`
2. Reconnect-Event → Rust Sync Worker flush pending → Supabase

**Conflict Resolution:** Last-Write-Wins basierend auf `updated_at` Timestamp. Kein CRDT für MVP — ausreichend für Teams bis ~10 Nutzer.

---

## Datenbankschema

### Supabase (Postgres) — Source of Truth

```sql
-- Supabase Auth verwaltet auth.users intern.
-- Wir ergänzen ein Nutzerprofil:

profiles
  id          uuid  PK  (= auth.users.id)
  full_name   text
  avatar_url  text
  created_at  timestamptz

workspaces
  id          uuid  PK  DEFAULT gen_random_uuid()
  name        text  NOT NULL
  logo_url    text
  created_by  uuid  NOT NULL  FK → profiles.id
  created_at  timestamptz DEFAULT now()

workspace_members
  workspace_id  uuid  NOT NULL  FK → workspaces.id
  user_id       uuid  NOT NULL  FK → profiles.id
  role          text  NOT NULL  CHECK (role IN ('owner', 'member'))
  joined_at     timestamptz DEFAULT now()
  PRIMARY KEY (workspace_id, user_id)
```

Alle weiteren Tabellen (clients, tasks, invoices, calendar_events, emails) erhalten:
```sql
workspace_id  uuid  NOT NULL  FK → workspaces.id
created_by    uuid  NOT NULL  FK → profiles.id
```

### RLS-Policies (gilt für alle Tabellen)

Diese Policies werden für jede Datentabelle einzeln angelegt (clients, tasks, invoices, calendar_events, emails):

```sql
-- Lesen: nur eigene Workspace-Mitglieder
CREATE POLICY "workspace_read" ON clients  -- analog für jede Tabelle
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Schreiben: nur Workspace-Mitglieder
CREATE POLICY "workspace_write" ON clients  -- analog für jede Tabelle
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );
```

### Lokales SQLite — Cache + Pending Queue

Alle bestehenden Tabellen erhalten 3 neue Spalten via Migration:
```sql
workspace_id   TEXT  NOT NULL  DEFAULT ''
created_by     TEXT  NOT NULL  DEFAULT ''
pending_sync   INTEGER DEFAULT 0  -- 1 = noch nicht gesynct
```

Neue Tabelle für Sync-Queue:
```sql
CREATE TABLE sync_queue (
  id          TEXT PRIMARY KEY,
  table_name  TEXT NOT NULL,
  record_id   TEXT NOT NULL,
  operation   TEXT NOT NULL  CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  payload     TEXT NOT NULL,  -- JSON
  created_at  TEXT NOT NULL
);

CREATE TABLE sync_meta (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
-- Enthält: last_sync_at, active_workspace_id, active_user_id
```

---

## Auth Flow

```
App Start
    │
    ▼
Supabase Session vorhanden? (Token in Tauri secure storage)
    │
    ├── NEIN → LoginScreen (Email + Passwort)
    │              │
    │              ▼
    │          supabase.auth.signInWithPassword()
    │              │
    │              ▼
    │          JWT in Tauri secure storage speichern
    │
    └── JA  → Session geladen + Token-Refresh (automatisch via SDK)
                   │
                   ▼
              workspace_members für user_id laden
                   │
                   ├── 0 Workspaces → "Workspace erstellen"-Dialog
                   ├── 1 Workspace  → direkt rein, SQLite hydratisieren
                   └── N Workspaces → Workspace-Picker anzeigen
```

**Session-Speicherung:** JWT wird in Tauri's `tauri-plugin-store` (encrypted) abgelegt, nicht im Browser localStorage.

---

## Workspace Switcher UI

Position: oben links in der NavSidebar, ersetzt den aktuellen Header-Bereich.

```
┌──────────────────────────┐
│  [Logo] Agentur Müller ▾ │  ← Klick öffnet Dropdown
│                     ⚡ 3 │  ← pending sync count (nur wenn > 0)
└──────────────────────────┘
         │
         ▼ (Dropdown)
┌──────────────────────────┐
│ ✓  Agentur Müller        │  ← aktiver Workspace
│    Projekt Alpha         │
│    Freelance             │
│ ──────────────────────── │
│ +  Neuer Workspace       │
│    Workspace verwalten   │
└──────────────────────────┘
```

**Workspace-Wechsel löst aus:**
1. `active_workspace_id` im Zustand-Store setzen
2. SQLite-Cache für neuen Workspace laden (alle Tabellen mit `workspace_id = ?`)
3. Alle Stores (clients, tasks, etc.) neu hydratisieren
4. Supabase Realtime-Subscription wechseln

---

## Rollen & Rechte (MVP)

| Aktion | Owner | Member |
|---|---|---|
| Workspace-Einstellungen bearbeiten | ✓ | ✗ |
| Mitglieder einladen / entfernen | ✓ | ✗ |
| Clients, Tasks, Invoices bearbeiten | ✓ | ✓ |
| Assigned Tasks + eigene Tasks sehen | ✓ | ✓ |
| Workspace löschen | ✓ | ✗ |

Rechte werden doppelt durchgesetzt: Supabase RLS (Backend) + Frontend-Guard (UI-Elemente ausblenden/sperren).

---

## Sync Engine (Rust)

### SyncWorker

```
src-tauri/src/core/
  sync/
    mod.rs          — SyncWorker struct + public API
    connectivity.rs — HEAD-Request-Loop, Tauri Event emitter
    push.rs         — sync_queue → Supabase REST
    pull.rs         — Supabase → lokales SQLite
```

### Sync-Ablauf beim Reconnect

```
1. sync_queue auslesen (ORDER BY created_at ASC)
2. Für jeden Eintrag:
   a. POST/PATCH/DELETE → Supabase REST API
   b. 2xx: sync_queue Eintrag löschen, pending_sync = 0 setzen
   c. 409 Konflikt: remote updated_at > local → remote gewinnt
      → lokalen Record überschreiben, sync_queue löschen
3. Pull: alle Records mit updated_at > last_sync_at von Supabase laden
4. last_sync_at in sync_meta speichern
```

### Connectivity Detection

```rust
// Prüft alle 10s mit HEAD-Request auf Supabase Health-Endpoint
// Emittiert Tauri-Event: "cynera://connectivity-changed" { online: bool }
// Frontend lauscht → Offline-Badge im Workspace-Switcher
```

### JWT-Übergabe an den Rust-Layer

Der Supabase JS SDK verwaltet den JWT im Frontend. Damit der Rust-SyncWorker Supabase REST-Calls authentifizieren kann, übergibt das Frontend das Token via Tauri Command bei jeder Auth-State-Änderung:

```rust
#[tauri::command]
pub fn set_auth_token(token: String, state: tauri::State<SyncWorkerState>) {
    state.lock().unwrap().set_token(token);
}
```

Das Frontend ruft `invoke("set_auth_token", { token: session.access_token })` bei `onAuthStateChange` auf. Der SyncWorker hält das Token im Memory und nutzt es als `Authorization: Bearer <token>` Header für alle Supabase REST-Calls.

### Tauri Commands

```rust
#[tauri::command] sync_now(workspace_id: String) -> Result<SyncStatus>
#[tauri::command] get_sync_status() -> Result<SyncStatus>
#[tauri::command] set_auth_token(token: String) -> Result<()>

pub struct SyncStatus {
    pending_count: u32,
    last_synced_at: String,
    is_online: bool,
}
```

---

## Neue Ordnerstruktur

```
src-tauri/src/
  core/                     ← NEU
    auth/
      mod.rs                — Token-Verwaltung, Session-Check
    workspace/
      mod.rs                — Workspace laden, wechseln
    sync/
      mod.rs
      connectivity.rs
      push.rs
      pull.rs
  db/
    migrations/             — neue Migration: workspace_id, pending_sync, sync_queue
    schema.rs               — aktualisiert

src/
  core/                     ← NEU
    auth/
      useAuth.ts            — Supabase Auth Hook
      LoginScreen.tsx       — Login UI
    workspace/
      useWorkspace.ts       — aktiver Workspace, Switcher-State
      WorkspaceSwitcher.tsx — Dropdown-Komponente
      WorkspacePicker.tsx   — Auswahl beim Start
  store/
    auth.store.ts           — user, session, loading
    workspace.store.ts      — workspaces[], activeWorkspace
```

---

## Abhängigkeiten (neu)

```
Frontend:
  @supabase/supabase-js     — Supabase JS SDK
  tauri-plugin-store        — Secure Token Storage

Rust (Cargo.toml):
  reqwest                   — HTTP für Sync Push/Pull
  tokio                     — Async Runtime (bereits vorhanden via Tauri)
```

---

## Was nicht in Scope ist (dieses Sub-Projekt)

- Vollständige Implementierung aller Module (Clients, Tasks, Finances, etc.) — folgt in Sub-Projekt 2+
- E-Mail-Einladungen (Supabase Magic Link reicht für MVP, echter Invite-Flow später)
- Granulare Berechtigungen pro Modul (owner/member reicht für MVP)
- Realtime-Kollaboration (Cursor-Sharing, Live-Edits) — nur Daten-Sync
- Audit Log / Activity History auf Server-Ebene
