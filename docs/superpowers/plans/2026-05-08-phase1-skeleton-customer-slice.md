# Focus App v2 — Phase 1: Skeleton + Customer Slice

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tauri 2-Skeleton mit vollständigem Kunden-Slice (SQLite → Rust → TypeScript Service → Zustand Store → React UI) als Blaupause für alle weiteren Domains.

**Architecture:** Vertical Slice First — der Kunden-Domain wird komplett durchgebaut von der DB bis zur UI. Routes lesen Stores. Komponenten kennen nur Props. `invoke()` nur in Services.

**Tech Stack:** Tauri 2, React 18, TypeScript 5, Tailwind CSS 3, Zustand 4, Rust (rusqlite, thiserror, tracing), Vitest 2, SQLite

---

## File Map

### Neue Dateien (erstellt in diesem Plan)

```
src/
  types/
    customer.types.ts        — Customer interface, Status/Priority enums
    error.types.ts           — AppError interface (matches Rust AppError)
    common.types.ts          — UpsertPayload helper, ID type
  services/
    customer.service.ts      — invoke() wrapper für Customer-Commands
  store/
    customers.store.ts       — Zustand slice: customers[], isLoading, error + actions
    ui.store.ts              — theme, selectedCustomerId, focusMode, hasSeenIntro
  lib/
    logger.ts                — dev/prod logging wrapper
  components/
    layout/
      AppShell.tsx           — Root wrapper: theme class, ErrorBoundary, layout grid
    customer/
      CustomerCard.tsx       — Einzelne Kunden-Karte in der Sidebar (props only)
  routes/
    CustomerRoute.tsx        — Screen wenn Kunde ausgewählt (Skeleton, Tabs folgen in Phase 2)
    OverviewRoute.tsx        — Screen wenn kein Kunde ausgewählt
tailwind.config.ts           — Design Tokens aus globals.css portiert
postcss.config.ts            — Tailwind + Autoprefixer

src-tauri/src/
  error.rs                   — AppError enum (thiserror + Serialize)
  db/
    mod.rs                   — Re-exports
    pool.rs                  — DbPool struct (Arc<Mutex<Connection>>)
    schema.rs                — CREATE TABLE statements (alle Domains)
    migrations.rs            — user_version PRAGMA + migration runner
    customer.rs              — DB-Queries: get_all, upsert, delete
  commands/
    mod.rs                   — Re-exports + register_commands()
    customer.rs              — Tauri commands: get_customers, upsert_customer, delete_customer
```

### Modifizierte Dateien

```
package.json                 — Tauri 2 JS API, Tailwind, TypeScript deps
vite.config.js → vite.config.ts
index.html                   — Kein Änderungsbedarf
src/main.jsx → src/main.tsx  — React 18 StrictMode mount
src/App.jsx → src/App.tsx    — Ersetzt durch neues Routing + AppShell
src/styles/globals.css       — @tailwind directives ergänzt
src-tauri/Cargo.toml         — Tauri 2, thiserror, tracing
src-tauri/tauri.conf.json    — v2 Format, productName: Focus, identifier: com.cynera.focus
src-tauri/src/main.rs        — DB init + neue command registration
src-tauri/src/email/commands.rs — emit_all → emit (Tauri 2 breaking change)
```

---

## Task 1: Tauri 2 Migration — Dependencies & Config

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `package.json`
- Modify: `src-tauri/src/email/commands.rs`

- [ ] **Step 1: Cargo.toml auf Tauri 2 updaten**

Ersetze den `[dependencies]`-Block in `src-tauri/Cargo.toml` komplett:

```toml
[package]
name = "focus"
version = "2.0.0"
description = "Focus — Business Management Desktop App"
authors = ["Cynera"]
edition = "2021"
rust-version = "1.77"

[lib]
name = "focus_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.31", features = ["bundled"] }
thiserror = "1"
tokio = { version = "1", features = ["full"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "fmt"] }
async-imap = "0.9"
native-tls = "0.2"
keyring = "2"
reqwest = { version = "0.11", features = ["json"] }
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1", features = ["v4"] }

[features]
custom-protocol = ["tauri/custom-protocol"]
```

- [ ] **Step 2: tauri.conf.json auf v2 Format updaten**

Ersetze den gesamten Inhalt von `src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Focus",
  "version": "2.0.0",
  "identifier": "com.cynera.focus",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "Focus",
        "width": 1280,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/Icon.ico",
      "icons/icon.icns"
    ]
  }
}
```

- [ ] **Step 3: package.json updaten**

Ersetze `dependencies` und `devDependencies` in `package.json`:

```json
{
  "name": "focus",
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "test": "vitest",
    "test:run": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@tauri-apps/api": "^2",
    "framer-motion": "^11.2.10",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-markdown": "^9.0.1",
    "recharts": "^3.8.1",
    "zustand": "^4.5.2"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2",
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.4.5",
    "vite": "^5.2.0",
    "vitest": "^2.1.9"
  }
}
```

- [ ] **Step 4: Tauri 2 breaking change in email/commands.rs fixen**

In `src-tauri/src/email/commands.rs` alle Vorkommen von `emit_all` durch `emit` ersetzen:

```bash
# Suche nach emit_all in Rust-Dateien
grep -rn "emit_all" src-tauri/src/
```

Für jede Fundstelle: `app_handle.emit_all("event-name", payload)` → `app_handle.emit("event-name", payload)`

- [ ] **Step 5: npm install + Cargo build prüfen**

```bash
npm install
cd src-tauri && cargo check 2>&1 | head -50
```

Erwartetes Ergebnis: Keine Fehler (nur ggf. Deprecation-Warnings sind OK).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/tauri.conf.json package.json src-tauri/src/email/commands.rs package-lock.json
git commit -m "chore: migrate to Tauri 2 — deps, config, emit_all fix"
```

---

## Task 2: TypeScript + Tailwind Setup

**Files:**
- Create: `tailwind.config.ts`
- Create: `postcss.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Modify: `vite.config.js` → `vite.config.ts`
- Modify: `src/styles/globals.css`

- [ ] **Step 1: tsconfig.json erstellen**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 2: tsconfig.node.json erstellen**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts", "tailwind.config.ts", "postcss.config.ts"]
}
```

- [ ] **Step 3: vite.config.ts erstellen** (ersetzt vite.config.js)

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
})
```

- [ ] **Step 4: vite.config.js löschen**

```bash
rm vite.config.js
```

- [ ] **Step 5: tailwind.config.ts erstellen**

```typescript
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#7C3AED',
          light: '#8B5CF6',
          dark: '#6D28D9',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
```

- [ ] **Step 6: postcss.config.ts erstellen**

```typescript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 7: @tailwind directives in globals.css ergänzen**

Füge am Anfang von `src/styles/globals.css` ein (vor allen bestehenden :root-Regeln):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 8: Typecheck prüfen**

```bash
npm run typecheck
```

Erwartetes Ergebnis: Fehler nur in `.jsx`-Dateien (die noch nicht migriert sind) — das ist OK für jetzt.

- [ ] **Step 9: Commit**

```bash
git add tailwind.config.ts postcss.config.ts tsconfig.json tsconfig.node.json vite.config.ts src/styles/globals.css
git rm vite.config.js
git commit -m "chore: add TypeScript + Tailwind CSS setup"
```

---

## Task 3: Neue Ordnerstruktur anlegen

**Files:**
- Create: Verzeichnisse + leere Index-Dateien

- [ ] **Step 1: Verzeichnisse erstellen**

```bash
mkdir -p src/types src/services src/store src/lib src/routes src/components/layout src/components/customer
mkdir -p src-tauri/src/db src-tauri/src/commands src-tauri/src/services
```

- [ ] **Step 2: Barrel-Dateien für src/types erstellen**

`src/types/index.ts`:
```typescript
export * from './customer.types'
export * from './error.types'
export * from './common.types'
```

- [ ] **Step 3: Barrel-Datei für src/services erstellen**

`src/services/index.ts`:
```typescript
export * from './customer.service'
```

- [ ] **Step 4: Barrel-Datei für src/store erstellen**

`src/store/index.ts`:
```typescript
export { useCustomersStore } from './customers.store'
export { useUiStore } from './ui.store'
```

- [ ] **Step 5: src-tauri mod-Dateien anlegen**

`src-tauri/src/db/mod.rs`:
```rust
pub mod pool;
pub mod schema;
pub mod migrations;
pub mod customer;
```

`src-tauri/src/commands/mod.rs`:
```rust
pub mod customer;

use tauri::Builder;

pub fn register<R: tauri::Runtime>(builder: Builder<R>) -> Builder<R> {
    builder.invoke_handler(tauri::generate_handler![
        customer::get_customers,
        customer::upsert_customer,
        customer::delete_customer,
    ])
}
```

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/services/index.ts src/store/index.ts src-tauri/src/db/mod.rs src-tauri/src/commands/mod.rs
git commit -m "chore: create new folder structure + barrel files"
```

---

## Task 4: Rust AppError

**Files:**
- Create: `src-tauri/src/error.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Failing test schreiben**

In `src-tauri/src/error.rs` (neue Datei):

```rust
use thiserror::Error;

#[derive(Debug, Error, serde::Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    #[error("DB error: {0}")]
    Db(String),
    #[error("IO error: {0}")]
    Io(String),
    #[error("IMAP error: {0}")]
    Imap(String),
    #[error("Auth error: {0}")]
    Auth(String),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Validation: {0}")]
    Validation(String),
    #[error("External API error: {0}")]
    ExternalApi(String),
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::Db(e.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_serializes_with_kind_tag() {
        let err = AppError::Db("connection failed".to_string());
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json["kind"], "Db");
        assert_eq!(json["message"], "DB error: connection failed");
    }

    #[test]
    fn rusqlite_error_converts_to_app_error() {
        let sqlite_err = rusqlite::Error::InvalidPath("test".into());
        let app_err: AppError = sqlite_err.into();
        assert!(matches!(app_err, AppError::Db(_)));
    }
}
```

- [ ] **Step 2: Test ausführen — erwartet FAIL (Datei existiert noch nicht in main.rs)**

```bash
cd src-tauri && cargo test error 2>&1 | tail -20
```

Erwartetes Ergebnis: Fehler, da `error` noch nicht in `main.rs` als Modul eingebunden.

- [ ] **Step 3: error.rs in main.rs einbinden**

Füge in `src-tauri/src/main.rs` ganz oben nach den bestehenden `mod`-Deklarationen ein:

```rust
mod error;
pub use error::AppError;
```

- [ ] **Step 4: Test ausführen — erwartet PASS**

```bash
cd src-tauri && cargo test error::tests 2>&1 | tail -10
```

Erwartetes Ergebnis:
```
test error::tests::error_serializes_with_kind_tag ... ok
test error::tests::rusqlite_error_converts_to_app_error ... ok
test result: ok. 2 passed
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/error.rs src-tauri/src/main.rs
git commit -m "feat(rust): centralized AppError with serde serialization"
```

---

## Task 5: SQLite DB Setup (Rust)

**Files:**
- Create: `src-tauri/src/db/pool.rs`
- Create: `src-tauri/src/db/schema.rs`
- Create: `src-tauri/src/db/migrations.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: DbPool erstellen**

`src-tauri/src/db/pool.rs`:

```rust
use std::path::Path;
use std::sync::{Arc, Mutex};
use rusqlite::Connection;
use crate::AppError;
use super::{migrations, schema};

pub struct DbPool {
    conn: Arc<Mutex<Connection>>,
}

impl DbPool {
    pub fn new(db_path: &Path) -> Result<Self, AppError> {
        let conn = Connection::open(db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        let pool = DbPool { conn: Arc::new(Mutex::new(conn)) };
        pool.init()?;
        Ok(pool)
    }

    fn init(&self) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        schema::create_tables(&conn)?;
        migrations::run(&conn)?;
        Ok(())
    }

    pub fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().unwrap()
    }
}
```

- [ ] **Step 2: Schema erstellen**

`src-tauri/src/db/schema.rs`:

```rust
use rusqlite::Connection;
use crate::AppError;

pub fn create_tables(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(r#"
        CREATE TABLE IF NOT EXISTS customers (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            company     TEXT,
            email       TEXT,
            phone       TEXT,
            status      TEXT NOT NULL DEFAULT 'aktiv',
            priority    TEXT NOT NULL DEFAULT 'normal',
            tags        TEXT NOT NULL DEFAULT '[]',
            notes_meta  TEXT NOT NULL DEFAULT '{}',
            is_private  INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS todos (
            id          TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            title       TEXT NOT NULL,
            status      TEXT NOT NULL DEFAULT 'open',
            priority    TEXT NOT NULL DEFAULT 'normal',
            due_date    TEXT,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS notes (
            id          TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            title       TEXT NOT NULL,
            content     TEXT NOT NULL DEFAULT '',
            pinned      INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS kpis (
            id          TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            label       TEXT NOT NULL,
            value       REAL,
            unit        TEXT,
            target      REAL,
            period      TEXT,
            updated_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS deadlines (
            id          TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            title       TEXT NOT NULL,
            due_date    TEXT NOT NULL,
            done        INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS crm_follow_ups (
            id          TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            title       TEXT NOT NULL,
            due_date    TEXT NOT NULL,
            status      TEXT NOT NULL DEFAULT 'offen',
            priority    TEXT NOT NULL DEFAULT 'normal',
            created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS health_scores (
            id          TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            score       REAL NOT NULL,
            factors     TEXT NOT NULL DEFAULT '{}',
            recorded_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS time_entries (
            id          TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            description TEXT NOT NULL,
            minutes     INTEGER NOT NULL,
            date        TEXT NOT NULL,
            created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS time_planning (
            id                 TEXT PRIMARY KEY DEFAULT 'singleton',
            global_week_hours  REAL NOT NULL DEFAULT 40,
            global_month_hours REAL NOT NULL DEFAULT 160,
            per_customer       TEXT NOT NULL DEFAULT '{}'
        );

        INSERT OR IGNORE INTO time_planning (id) VALUES ('singleton');

        CREATE TABLE IF NOT EXISTS folders (
            id          TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            name        TEXT NOT NULL,
            parent_id   TEXT REFERENCES folders(id),
            created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS files (
            id          TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            folder_id   TEXT REFERENCES folders(id),
            name        TEXT NOT NULL,
            path        TEXT NOT NULL,
            size        INTEGER,
            mime_type   TEXT,
            created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
            id          TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            content     TEXT NOT NULL,
            sender      TEXT NOT NULL,
            read        INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS email_accounts (
            id             TEXT PRIMARY KEY,
            email          TEXT NOT NULL,
            display_name   TEXT,
            imap_host      TEXT NOT NULL,
            imap_port      INTEGER NOT NULL,
            last_synced_at TEXT,
            status         TEXT NOT NULL DEFAULT 'active'
        );

        CREATE TABLE IF NOT EXISTS emails (
            id          TEXT PRIMARY KEY,
            account_id  TEXT NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
            message_id  TEXT,
            from_addr   TEXT,
            to_addr     TEXT,
            subject     TEXT,
            preview     TEXT,
            body        TEXT,
            received_at TEXT,
            read        INTEGER NOT NULL DEFAULT 0,
            customer_id TEXT REFERENCES customers(id),
            tags        TEXT NOT NULL DEFAULT '[]'
        );

        CREATE TABLE IF NOT EXISTS company_settings (
            id         TEXT PRIMARY KEY DEFAULT 'singleton',
            profile    TEXT NOT NULL DEFAULT '{}',
            modules    TEXT NOT NULL DEFAULT '{}',
            crm_config TEXT NOT NULL DEFAULT '{}',
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS app_state (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    "#)?;
    Ok(())
}
```

- [ ] **Step 3: Migrations-System erstellen**

`src-tauri/src/db/migrations.rs`:

```rust
use rusqlite::Connection;
use crate::AppError;

const CURRENT_VERSION: u32 = 1;

pub fn run(conn: &Connection) -> Result<(), AppError> {
    let version = get_version(conn)?;
    for v in (version + 1)..=CURRENT_VERSION {
        apply(conn, v)?;
        set_version(conn, v)?;
    }
    Ok(())
}

fn get_version(conn: &Connection) -> Result<u32, AppError> {
    let v: u32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))
        .unwrap_or(0);
    Ok(v)
}

fn set_version(conn: &Connection, version: u32) -> Result<(), AppError> {
    conn.execute_batch(&format!("PRAGMA user_version = {version}"))
        .map_err(AppError::from)
}

fn apply(conn: &Connection, version: u32) -> Result<(), AppError> {
    match version {
        1 => {
            // Version 1: seed Privat-Kunde
            let now = chrono::Utc::now().to_rfc3339();
            conn.execute(
                "INSERT OR IGNORE INTO customers (id, name, is_private, created_at, updated_at)
                 VALUES ('__cynera_privat__', 'Privat', 1, ?1, ?2)",
                rusqlite::params![now, now],
            )?;
            Ok(())
        }
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn in_memory_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        super::super::schema::create_tables(&conn).unwrap();
        conn
    }

    #[test]
    fn migration_runs_idempotently() {
        let conn = in_memory_db();
        run(&conn).unwrap();
        run(&conn).unwrap(); // zweimal laufen lassen — kein Fehler
        let version = get_version(&conn).unwrap();
        assert_eq!(version, 1);
    }

    #[test]
    fn privat_kunde_wird_geseedet() {
        let conn = in_memory_db();
        run(&conn).unwrap();
        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM customers WHERE id = '__cynera_privat__'",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(count, 1);
    }
}
```

- [ ] **Step 4: Tests ausführen**

```bash
cd src-tauri && cargo test migrations::tests 2>&1 | tail -15
```

Erwartetes Ergebnis:
```
test db::migrations::tests::migration_runs_idempotently ... ok
test db::migrations::tests::privat_kunde_wird_geseedet ... ok
test result: ok. 2 passed
```

- [ ] **Step 5: DbPool in main.rs einbinden**

Ergänze in `src-tauri/src/main.rs`:

```rust
mod db;
use db::pool::DbPool;

// In der main() Funktion, vor app.run():
let app_data_dir = app.path().app_data_dir()
    .expect("App data directory not found");
std::fs::create_dir_all(&app_data_dir).expect("Cannot create app data dir");
let db_path = app_data_dir.join("focus.db");
let db_pool = DbPool::new(&db_path).expect("Cannot open database");
app.manage(db_pool);
```

- [ ] **Step 6: Compile prüfen**

```bash
cd src-tauri && cargo check 2>&1 | grep -E "^error" | head -20
```

Erwartetes Ergebnis: Keine Fehler.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/db/ src-tauri/src/main.rs
git commit -m "feat(rust): SQLite DB pool + full schema + migrations"
```

---

## Task 6: Rust Customer DB Layer

**Files:**
- Create: `src-tauri/src/db/customer.rs`

- [ ] **Step 1: Failing tests schreiben**

`src-tauri/src/db/customer.rs`:

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
}

pub fn get_all(conn: &Connection) -> Result<Vec<Customer>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, company, email, phone, status, priority, tags, is_private, created_at, updated_at
         FROM customers WHERE is_private = 0 ORDER BY name ASC"
    )?;

    let customers = stmt.query_map([], |row| {
        let tags_json: String = row.get(7)?;
        Ok(Customer {
            id: row.get(0)?,
            name: row.get(1)?,
            company: row.get(2)?,
            email: row.get(3)?,
            phone: row.get(4)?,
            status: row.get(5)?,
            priority: row.get(6)?,
            tags: serde_json::from_str(&tags_json).unwrap_or_default(),
            is_private: row.get::<_, i32>(8)? != 0,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
        })
    })?
    .collect::<Result<Vec<_>, _>>()?;

    Ok(customers)
}

pub fn upsert(conn: &Connection, payload: UpsertCustomerPayload) -> Result<Customer, AppError> {
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    let tags_json = serde_json::to_string(&payload.tags.unwrap_or_default())
        .map_err(|e| AppError::Validation(e.to_string()))?;

    conn.execute(
        "INSERT INTO customers (id, name, company, email, phone, status, priority, tags, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           company = excluded.company,
           email = excluded.email,
           phone = excluded.phone,
           status = excluded.status,
           priority = excluded.priority,
           tags = excluded.tags,
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
            now,
        ],
    )?;

    let customer = conn.query_row(
        "SELECT id, name, company, email, phone, status, priority, tags, is_private, created_at, updated_at
         FROM customers WHERE id = ?1",
        [&id],
        |row| {
            let tags_json: String = row.get(7)?;
            Ok(Customer {
                id: row.get(0)?,
                name: row.get(1)?,
                company: row.get(2)?,
                email: row.get(3)?,
                phone: row.get(4)?,
                status: row.get(5)?,
                priority: row.get(6)?,
                tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                is_private: row.get::<_, i32>(8)? != 0,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        },
    )?;

    Ok(customer)
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
    let affected = conn.execute("DELETE FROM customers WHERE id = ?1 AND is_private = 0", [id])?;
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
        };
        let customer = upsert(&conn, payload).unwrap();
        assert_eq!(customer.name, "Max Mustermann");
        assert_eq!(customer.company, Some("Muster GmbH".to_string()));
        assert_eq!(customer.status, "aktiv");
        assert!(customer.tags.contains(&"vip".to_string()));
        assert!(!customer.is_private);
    }

    #[test]
    fn upsert_updates_existing_customer() {
        let conn = setup();
        let payload = UpsertCustomerPayload {
            id: Some("test-id".to_string()),
            name: "Original".to_string(),
            company: None, email: None, phone: None,
            status: None, priority: None, tags: None,
        };
        upsert(&conn, payload).unwrap();

        let update = UpsertCustomerPayload {
            id: Some("test-id".to_string()),
            name: "Updated".to_string(),
            company: None, email: None, phone: None,
            status: None, priority: None, tags: None,
        };
        let updated = upsert(&conn, update).unwrap();
        assert_eq!(updated.name, "Updated");
        assert_eq!(updated.id, "test-id");
    }

    #[test]
    fn get_all_excludes_private_customer() {
        let conn = setup();
        let customers = get_all(&conn).unwrap();
        assert!(!customers.iter().any(|c| c.id == "__cynera_privat__"));
    }

    #[test]
    fn delete_removes_customer() {
        let conn = setup();
        let payload = UpsertCustomerPayload {
            id: Some("del-test".to_string()),
            name: "Zu löschen".to_string(),
            company: None, email: None, phone: None,
            status: None, priority: None, tags: None,
        };
        upsert(&conn, payload).unwrap();
        delete(&conn, "del-test").unwrap();
        let customers = get_all(&conn).unwrap();
        assert!(!customers.iter().any(|c| c.id == "del-test"));
    }

    #[test]
    fn delete_private_customer_fails() {
        let conn = setup();
        let result = delete(&conn, "__cynera_privat__");
        assert!(result.is_err());
    }
}
```

- [ ] **Step 2: Tests ausführen — erwartet PASS**

```bash
cd src-tauri && cargo test db::customer::tests 2>&1 | tail -20
```

Erwartetes Ergebnis:
```
test db::customer::tests::delete_private_customer_fails ... ok
test db::customer::tests::delete_removes_customer ... ok
test db::customer::tests::get_all_excludes_private_customer ... ok
test db::customer::tests::upsert_creates_new_customer ... ok
test db::customer::tests::upsert_updates_existing_customer ... ok
test result: ok. 5 passed
```

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/db/customer.rs
git commit -m "feat(rust): customer DB layer — get_all, upsert, delete with tests"
```

---

## Task 7: Rust Customer Commands

**Files:**
- Create: `src-tauri/src/commands/customer.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: commands/customer.rs erstellen**

```rust
use tauri::State;
use crate::{AppError, db::{pool::DbPool, customer::{self, Customer, UpsertCustomerPayload}}};

#[tauri::command]
pub async fn get_customers(db: State<'_, DbPool>) -> Result<Vec<Customer>, AppError> {
    let conn = db.conn();
    customer::get_all(&conn)
}

#[tauri::command]
pub async fn upsert_customer(
    db: State<'_, DbPool>,
    payload: UpsertCustomerPayload,
) -> Result<Customer, AppError> {
    let conn = db.conn();
    customer::upsert(&conn, payload)
}

#[tauri::command]
pub async fn delete_customer(
    db: State<'_, DbPool>,
    id: String,
) -> Result<(), AppError> {
    let conn = db.conn();
    customer::delete(&conn, &id)
}
```

- [ ] **Step 2: Commands in main.rs registrieren**

In `src-tauri/src/main.rs`, den bestehenden `invoke_handler` finden und um die neuen Commands ergänzen:

```rust
mod commands;

// Im Builder:
.invoke_handler(tauri::generate_handler![
    commands::customer::get_customers,
    commands::customer::upsert_customer,
    commands::customer::delete_customer,
    // bestehende Email + AI Commands hier behalten:
    // email::commands::email_get_accounts,
    // ...
])
```

- [ ] **Step 3: Compile prüfen**

```bash
cd src-tauri && cargo check 2>&1 | grep -E "^error" | head -20
```

Erwartetes Ergebnis: Keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/customer.rs src-tauri/src/main.rs
git commit -m "feat(rust): customer Tauri commands — get, upsert, delete"
```

---

## Task 8: TypeScript Types

**Files:**
- Create: `src/types/error.types.ts`
- Create: `src/types/common.types.ts`
- Create: `src/types/customer.types.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: error.types.ts erstellen**

```typescript
export type ErrorKind =
  | 'Db'
  | 'Io'
  | 'Imap'
  | 'Auth'
  | 'NotFound'
  | 'Validation'
  | 'ExternalApi'

export interface AppError {
  kind: ErrorKind
  message: string
}

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    'message' in value
  )
}

export function formatError(error: unknown): string {
  if (isAppError(error)) return `${error.kind}: ${error.message}`
  if (error instanceof Error) return error.message
  return String(error)
}
```

- [ ] **Step 2: common.types.ts erstellen**

```typescript
export type ID = string

export interface TimestampedEntity {
  createdAt: string
  updatedAt: string
}

export interface AsyncState<T> {
  data: T
  isLoading: boolean
  error: AppError | null
}

import type { AppError } from './error.types'
```

- [ ] **Step 3: customer.types.ts erstellen**

```typescript
import type { TimestampedEntity } from './common.types'

export type CustomerStatus = 'lead' | 'aktiv' | 'inaktiv' | 'lost'
export type Priority = 'low' | 'normal' | 'high'

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

- [ ] **Step 4: Typecheck ausführen**

```bash
npm run typecheck 2>&1 | grep -v "\.jsx" | grep "error TS" | head -20
```

Erwartetes Ergebnis: Keine Fehler in den neuen `.ts`-Dateien.

- [ ] **Step 5: Commit**

```bash
git add src/types/
git commit -m "feat(types): Customer, AppError, common TypeScript types"
```

---

## Task 9: Logger

**Files:**
- Create: `src/lib/logger.ts`

- [ ] **Step 1: logger.ts erstellen**

```typescript
const isDev = import.meta.env.DEV

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

interface LogContext {
  [key: string]: unknown
}

function format(level: LogLevel, message: string, ctx?: LogContext): string {
  const timestamp = new Date().toISOString()
  const ctxStr = ctx ? ` ${JSON.stringify(ctx)}` : ''
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${ctxStr}`
}

export const log = {
  info(message: string, ctx?: LogContext): void {
    if (isDev) console.info(format('info', message, ctx))
  },
  warn(message: string, ctx?: LogContext): void {
    console.warn(format('warn', message, ctx))
  },
  error(message: string, ctx?: LogContext): void {
    console.error(format('error', message, ctx))
  },
  debug(message: string, ctx?: LogContext): void {
    if (isDev) console.debug(format('debug', message, ctx))
  },
}
```

- [ ] **Step 2: Unit test für logger**

`src/lib/logger.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { log } from './logger'

describe('logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('log.warn calls console.warn with formatted message', () => {
    log.warn('test warning', { code: 42 })
    expect(console.warn).toHaveBeenCalledOnce()
    const call = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(call).toContain('[WARN]')
    expect(call).toContain('test warning')
    expect(call).toContain('"code":42')
  })

  it('log.error calls console.error', () => {
    log.error('something broke')
    expect(console.error).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 3: Test ausführen**

```bash
npm run test:run -- src/lib/logger.test.ts
```

Erwartetes Ergebnis:
```
✓ log.warn calls console.warn with formatted message
✓ log.error calls console.error
Tests  2 passed
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/logger.ts src/lib/logger.test.ts
git commit -m "feat(lib): logger utility with dev/prod modes"
```

---

## Task 10: Customer Service

**Files:**
- Create: `src/services/customer.service.ts`
- Create: `src/services/customer.service.test.ts`

- [ ] **Step 1: Failing test schreiben**

`src/services/customer.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'
import { CustomerService } from './customer.service'
import type { Customer, UpsertCustomerPayload } from '@/types/customer.types'

const mockCustomer: Customer = {
  id: '1',
  name: 'Test GmbH',
  status: 'aktiv',
  priority: 'normal',
  tags: [],
  isPrivate: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

describe('CustomerService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getAll calls get_customers command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([mockCustomer])
    const result = await CustomerService.getAll()
    expect(invoke).toHaveBeenCalledWith('get_customers')
    expect(result).toEqual([mockCustomer])
  })

  it('upsert calls upsert_customer with payload', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(mockCustomer)
    const payload: UpsertCustomerPayload = { name: 'Test GmbH' }
    const result = await CustomerService.upsert(payload)
    expect(invoke).toHaveBeenCalledWith('upsert_customer', { payload })
    expect(result).toEqual(mockCustomer)
  })

  it('delete calls delete_customer with id', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined)
    await CustomerService.delete('1')
    expect(invoke).toHaveBeenCalledWith('delete_customer', { id: '1' })
  })
})
```

- [ ] **Step 2: Test ausführen — erwartet FAIL**

```bash
npm run test:run -- src/services/customer.service.test.ts
```

Erwartetes Ergebnis: `Cannot find module './customer.service'`

- [ ] **Step 3: customer.service.ts implementieren**

`src/services/customer.service.ts`:

```typescript
import { invoke } from '@tauri-apps/api/core'
import type { Customer, UpsertCustomerPayload } from '@/types/customer.types'

export const CustomerService = {
  getAll(): Promise<Customer[]> {
    return invoke<Customer[]>('get_customers')
  },

  upsert(payload: UpsertCustomerPayload): Promise<Customer> {
    return invoke<Customer>('upsert_customer', { payload })
  },

  delete(id: string): Promise<void> {
    return invoke<void>('delete_customer', { id })
  },
}
```

- [ ] **Step 4: Test ausführen — erwartet PASS**

```bash
npm run test:run -- src/services/customer.service.test.ts
```

Erwartetes Ergebnis:
```
✓ getAll calls get_customers command
✓ upsert calls upsert_customer with payload
✓ delete calls delete_customer with id
Tests  3 passed
```

- [ ] **Step 5: Commit**

```bash
git add src/services/customer.service.ts src/services/customer.service.test.ts
git commit -m "feat(service): CustomerService — invoke() wrappers with tests"
```

---

## Task 11: Customer Store

**Files:**
- Create: `src/store/customers.store.ts`
- Create: `src/store/customers.store.test.ts`

- [ ] **Step 1: Failing test schreiben**

`src/store/customers.store.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/customer.service', () => ({
  CustomerService: {
    getAll: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  },
}))

import { CustomerService } from '@/services/customer.service'
import type { Customer } from '@/types/customer.types'

const mockCustomer: Customer = {
  id: 'c1',
  name: 'ACME AG',
  status: 'aktiv',
  priority: 'normal',
  tags: [],
  isPrivate: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

describe('useCustomersStore', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { useCustomersStore } = await import('./customers.store')
    useCustomersStore.setState({ customers: [], isLoading: false, error: null })
  })

  it('init loads customers from service', async () => {
    vi.mocked(CustomerService.getAll).mockResolvedValueOnce([mockCustomer])
    const { useCustomersStore } = await import('./customers.store')
    await useCustomersStore.getState().init()
    expect(useCustomersStore.getState().customers).toEqual([mockCustomer])
    expect(useCustomersStore.getState().isLoading).toBe(false)
  })

  it('upsert adds new customer to list', async () => {
    vi.mocked(CustomerService.upsert).mockResolvedValueOnce(mockCustomer)
    const { useCustomersStore } = await import('./customers.store')
    await useCustomersStore.getState().upsert({ name: 'ACME AG' })
    expect(useCustomersStore.getState().customers).toHaveLength(1)
  })

  it('remove deletes customer from list', async () => {
    vi.mocked(CustomerService.delete).mockResolvedValueOnce(undefined)
    const { useCustomersStore } = await import('./customers.store')
    useCustomersStore.setState({ customers: [mockCustomer], isLoading: false, error: null })
    await useCustomersStore.getState().remove('c1')
    expect(useCustomersStore.getState().customers).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Test ausführen — erwartet FAIL**

```bash
npm run test:run -- src/store/customers.store.test.ts
```

Erwartetes Ergebnis: `Cannot find module './customers.store'`

- [ ] **Step 3: customers.store.ts implementieren**

`src/store/customers.store.ts`:

```typescript
import { create } from 'zustand'
import { CustomerService } from '@/services/customer.service'
import { log } from '@/lib/logger'
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
    const next = [...list]
    next[idx] = updated
    return next
  }
  return [...list, updated]
}

export const useCustomersStore = create<CustomersState>()((set) => ({
  customers: [],
  isLoading: false,
  error: null,

  init: async () => {
    set({ isLoading: true, error: null })
    try {
      const customers = await CustomerService.getAll()
      set({ customers, isLoading: false })
      log.info('Customers loaded', { count: customers.length })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load customers', { error })
    }
  },

  upsert: async (payload) => {
    try {
      const updated = await CustomerService.upsert(payload)
      set(s => ({ customers: upsertById(s.customers, updated) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to upsert customer', { error })
      throw err
    }
  },

  remove: async (id) => {
    try {
      await CustomerService.delete(id)
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

- [ ] **Step 4: Test ausführen — erwartet PASS**

```bash
npm run test:run -- src/store/customers.store.test.ts
```

Erwartetes Ergebnis:
```
✓ init loads customers from service
✓ upsert adds new customer to list
✓ remove deletes customer from list
Tests  3 passed
```

- [ ] **Step 5: Commit**

```bash
git add src/store/customers.store.ts src/store/customers.store.test.ts
git commit -m "feat(store): useCustomersStore — init, upsert, remove with tests"
```

---

## Task 12: UI Store

**Files:**
- Create: `src/store/ui.store.ts`

- [ ] **Step 1: ui.store.ts erstellen**

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark'

interface UiState {
  theme: Theme
  selectedCustomerId: string | null
  focusMode: boolean
  hasSeenIntro: boolean
  toggleTheme: () => void
  setSelectedCustomer: (id: string | null) => void
  toggleFocusMode: () => void
  markIntroSeen: () => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'dark',
      selectedCustomerId: null,
      focusMode: false,
      hasSeenIntro: false,

      toggleTheme: () =>
        set(s => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

      setSelectedCustomer: (id) =>
        set({ selectedCustomerId: id }),

      toggleFocusMode: () =>
        set(s => ({ focusMode: !s.focusMode })),

      markIntroSeen: () =>
        set({ hasSeenIntro: true }),
    }),
    {
      name: 'focus-ui-v2',
      partialize: (s) => ({
        theme: s.theme,
        selectedCustomerId: s.selectedCustomerId,
        hasSeenIntro: s.hasSeenIntro,
      }),
    }
  )
)
```

- [ ] **Step 2: store/index.ts updaten**

```typescript
export { useCustomersStore } from './customers.store'
export { useUiStore } from './ui.store'
```

- [ ] **Step 3: Commit**

```bash
git add src/store/ui.store.ts src/store/index.ts
git commit -m "feat(store): useUiStore — theme, selectedCustomer, focusMode (persisted)"
```

---

## Task 13: AppShell

**Files:**
- Create: `src/components/layout/AppShell.tsx`
- Create: `src/main.tsx`
- Modify: `src/App.jsx` → `src/App.tsx`

- [ ] **Step 1: AppShell.tsx erstellen**

`src/components/layout/AppShell.tsx`:

```tsx
import { useEffect, type ReactNode } from 'react'
import { useUiStore } from '@/store/ui.store'

interface Props {
  children: ReactNode
}

export function AppShell({ children }: Props) {
  const theme = useUiStore(s => s.theme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      {children}
    </div>
  )
}
```

- [ ] **Step 2: App.jsx umbenennen** (verhindert Vite-Konflikt mit dem neuen App.tsx)

```bash
mv src/App.jsx src/App.legacy.jsx
```

- [ ] **Step 3: Stubs für noch nicht existierende Komponenten erstellen**

Diese Stubs werden in Tasks 14 und 15 durch die echten Implementierungen ersetzt.

`src/components/layout/Sidebar.tsx` (Stub):
```tsx
export function Sidebar() {
  return <aside className="w-64 border-r border-[var(--border)]" />
}
```

`src/routes/CustomerRoute.tsx` (Stub):
```tsx
interface Props { customerId: string }
export function CustomerRoute({ customerId }: Props) {
  return <div className="p-6 text-[var(--text2)]">Kunde: {customerId}</div>
}
```

`src/routes/OverviewRoute.tsx` (Stub):
```tsx
export function OverviewRoute() {
  return <div className="p-6 text-[var(--text2)]">Kein Kunde ausgewählt</div>
}
```

- [ ] **Step 4: main.tsx erstellen** (ersetzt main.jsx)

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 5: App.tsx erstellen**

```tsx
import { useEffect } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { Sidebar } from '@/components/layout/Sidebar'
import { CustomerRoute } from '@/routes/CustomerRoute'
import { OverviewRoute } from '@/routes/OverviewRoute'

export default function App() {
  const init = useCustomersStore(s => s.init)
  const selectedCustomerId = useUiStore(s => s.selectedCustomerId)

  useEffect(() => {
    init()
  }, [init])

  return (
    <AppShell>
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          {selectedCustomerId ? (
            <CustomerRoute customerId={selectedCustomerId} />
          ) : (
            <OverviewRoute />
          )}
        </main>
      </div>
    </AppShell>
  )
}
```

- [ ] **Step 6: index.html auf main.tsx zeigen lassen**

In `index.html`, prüfe den script-Tag:
```html
<script type="module" src="/src/main.tsx"></script>
```

Falls er auf `main.jsx` zeigt, auf `main.tsx` ändern.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/AppShell.tsx src/components/layout/Sidebar.tsx src/routes/CustomerRoute.tsx src/routes/OverviewRoute.tsx src/main.tsx src/App.tsx index.html
git rm src/main.jsx
git mv src/App.jsx src/App.legacy.jsx
git commit -m "feat(ui): AppShell + main.tsx + component stubs — theme, layout, store init"
```

---

## Task 14: Sidebar + CustomerCard (ersetzt Stubs aus Task 13)

**Files:**
- Create: `src/components/customer/CustomerCard.tsx`
- Modify: `src/components/layout/Sidebar.tsx` (Stub → echte Implementierung)

- [ ] **Step 1: CustomerCard.tsx erstellen**

`src/components/customer/CustomerCard.tsx`:

```tsx
import type { Customer } from '@/types/customer.types'

interface Props {
  customer: Customer
  isSelected: boolean
  onClick: (id: string) => void
}

const STATUS_COLORS: Record<string, string> = {
  lead: 'bg-blue-500',
  aktiv: 'bg-green-500',
  inaktiv: 'bg-gray-400',
  lost: 'bg-red-400',
}

export function CustomerCard({ customer, isSelected, onClick }: Props) {
  const initials = customer.name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <button
      onClick={() => onClick(customer.id)}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors
        ${isSelected
          ? 'bg-primary text-white'
          : 'hover:bg-[var(--bg1)] text-[var(--text)]'
        }`}
    >
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{customer.name}</p>
        {customer.company && (
          <p className="text-xs text-[var(--text2)] truncate">{customer.company}</p>
        )}
      </div>
      <span className={`flex-shrink-0 w-2 h-2 rounded-full ${STATUS_COLORS[customer.status] ?? 'bg-gray-400'}`} />
    </button>
  )
}
```

- [ ] **Step 2: Sidebar.tsx erstellen**

`src/components/layout/Sidebar.tsx`:

```tsx
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { CustomerCard } from '@/components/customer/CustomerCard'

export function Sidebar() {
  const customers = useCustomersStore(s => s.customers)
  const isLoading = useCustomersStore(s => s.isLoading)
  const selectedId = useUiStore(s => s.selectedCustomerId)
  const setSelected = useUiStore(s => s.setSelectedCustomer)

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col border-r border-[var(--border)] bg-[var(--bg)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <h2 className="text-sm font-semibold text-[var(--text2)] uppercase tracking-wider">
          Kunden
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="px-3 py-2 text-sm text-[var(--text2)]">Lädt…</div>
        ) : customers.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-[var(--text2)]">
            Noch keine Kunden
          </div>
        ) : (
          customers.map(customer => (
            <CustomerCard
              key={customer.id}
              customer={customer}
              isSelected={selectedId === customer.id}
              onClick={setSelected}
            />
          ))
        )}
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/customer/CustomerCard.tsx src/components/layout/Sidebar.tsx
git commit -m "feat(ui): CustomerCard + Sidebar — reads from Zustand store"
```

---

## Task 15: Routes + End-to-End Verifikation

**Files:**
- Create: `src/routes/CustomerRoute.tsx`
- Create: `src/routes/OverviewRoute.tsx`

- [ ] **Step 1: OverviewRoute.tsx erstellen**

`src/routes/OverviewRoute.tsx`:

```tsx
export function OverviewRoute() {
  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-[var(--text)]">Focus</h1>
        <p className="mt-2 text-[var(--text2)]">Wähle einen Kunden aus der Sidebar</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: CustomerRoute.tsx erstellen**

`src/routes/CustomerRoute.tsx`:

```tsx
import { useCustomersStore } from '@/store/customers.store'

interface Props {
  customerId: string
}

export function CustomerRoute({ customerId }: Props) {
  const customer = useCustomersStore(
    s => s.customers.find(c => c.id === customerId)
  )

  if (!customer) {
    return (
      <div className="p-6 text-[var(--text2)]">Kunde nicht gefunden</div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-[var(--text)]">{customer.name}</h1>
      {customer.company && (
        <p className="text-[var(--text2)]">{customer.company}</p>
      )}
      <div className="mt-2 flex gap-2">
        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg1)] text-[var(--text2)]">
          {customer.status}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg1)] text-[var(--text2)]">
          {customer.priority}
        </span>
      </div>
      {/* Tabs werden in Phase 2 ergänzt */}
    </div>
  )
}
```

- [ ] **Step 3: Alle Tests ausführen**

```bash
npm run test:run
```

Erwartetes Ergebnis:
```
✓ src/lib/logger.test.ts (2 tests)
✓ src/services/customer.service.test.ts (3 tests)
✓ src/store/customers.store.test.ts (3 tests)
Tests  8 passed
```

- [ ] **Step 4: Typecheck ausführen**

```bash
npm run typecheck 2>&1 | grep "error TS" | grep -v "\.jsx" | head -20
```

Erwartetes Ergebnis: Keine TypeScript-Fehler in `.ts/.tsx`-Dateien.

- [ ] **Step 5: Tauri Dev starten und manuell testen**

```bash
npm run tauri dev
```

Prüfe:
- [ ] App startet ohne Absturz
- [ ] Sidebar zeigt "Noch keine Kunden" (SQLite startet leer)
- [ ] OverviewRoute zeigt "Wähle einen Kunden"
- [ ] Theme (dark) wird korrekt angewandt

- [ ] **Step 6: Testdaten einfügen via Rust-Test**

Führe einen gezielten Integrationstest aus, der direkt in die DB schreibt und prüft:

```bash
cd src-tauri && cargo test -- --test-output immediate 2>&1 | tail -20
```

Zusätzlich: einen temporären "Test-Kunden anlegen"-Button in `OverviewRoute.tsx` einbauen, nur für die manuelle Verifikation:

```tsx
import { useCustomersStore } from '@/store/customers.store'

export function OverviewRoute() {
  const upsert = useCustomersStore(s => s.upsert)

  const addTestCustomer = () => upsert({
    name: 'Muster GmbH',
    company: 'Muster AG',
    status: 'aktiv',
    priority: 'high',
    tags: ['vip'],
  })

  return (
    <div className="flex-1 flex flex-col items-center justify-center h-full gap-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-[var(--text)]">Focus</h1>
        <p className="mt-2 text-[var(--text2)]">Wähle einen Kunden aus der Sidebar</p>
      </div>
      <button
        onClick={addTestCustomer}
        className="px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark transition-colors"
      >
        Test-Kunde anlegen
      </button>
    </div>
  )
}
```

Prüfe: Nach Klick erscheint der Kunde sofort in der Sidebar (kein Reload nötig — Zustand-Update ist synchron).

> Hinweis: Den Button in Task 15 des nächsten Plans (Phase 2) wieder entfernen.

- [ ] **Step 7: Finaler Commit**

```bash
git add src/routes/CustomerRoute.tsx src/routes/OverviewRoute.tsx
git commit -m "feat(routes): CustomerRoute + OverviewRoute — Phase 1 skeleton complete"
```

---

## Abschluss

Phase 1 ist abgeschlossen wenn:
- [ ] Alle 8 Tests laufen grün
- [ ] Kein TypeScript-Fehler in `.ts/.tsx`-Dateien
- [ ] `cargo test` läuft grün (11 Rust-Tests)
- [ ] App startet in `tauri dev`
- [ ] Kunden lassen sich über die Konsole anlegen und erscheinen in der Sidebar

**Nächster Schritt:** Phase 2 — Core-Domains (Todos, Notes, KPIs, Zeit, Ablage, Chat) — nutzt den Customer-Slice als Blaupause. Pro Domain: gleiches Muster (DB → Command → Service → Store → Komponente).
