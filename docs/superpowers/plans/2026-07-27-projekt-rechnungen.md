# Projekt-Modul-Ausbau — Etappe 6: Rechnungen im Projekt-Kontext — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Echte Projekt↔Rechnung-Verknüpfung: ein neuer "Rechnungen"-Tab im Projekt-Detail, der die bestehende, reife Rechnungs-Infrastruktur (Erstellung, PDF, Mahnwesen, Status) unverändert wiederverwendet.

**Architecture:** `invoices.project_id` als optionale Spalte (additive Migration, analog zum bestehenden `deal_id`-Feld). Der bestehende `InvoiceForm.tsx` (bereits heute per `initialAccountId`-Prop entitäts-vorausfüllbar, siehe `CustomerRoute.tsx`) bekommt einen analogen `initialProjectId`-Prop. Die bestehende private `InvoiceRow`-Komponente aus `FinanzPane.tsx` wird in eine gemeinsame Datei extrahiert (beide Ansichten -- Kunde und Projekt -- brauchen dieselbe Zeilen-Darstellung + das neue Zuordnen-Dropdown).

**Tech Stack:** Rust/rusqlite (SQLite), Supabase/Postgres, React/TypeScript, Zustand.

## Global Constraints

- `project_id` ist überall optional (`Option<String>`/`string | null`) -- eine Rechnung ohne Projekt-Bezug bleibt ein gültiger, unveränderter Zustand.
- Kein Auto-Entwurf aus Phasen-/Gate-Mehrstunden, kein Retainer-Abrechnungs-Automatismus -- beides bewusst nicht Teil dieser Etappe (keine echte Datengrundlage bzw. deutlich größerer Scope).
- Bestehende Rechnungs-Erstellung, PDF-Generierung, Zahlungs-Erfassung, Mahnwesen bleiben funktional unverändert -- nur um die Möglichkeit erweitert, `project_id` mitzugeben bzw. nachträglich zu setzen.
- **Rust-Surgery-Warnung:** `src-tauri/src/db/invoice.rs`'s `create()`/`update()` bauen SQL mit **positionellen** Platzhaltern (`?1`, `?2`, …) -- beim Anhängen von `project_id` müssen ALLE nachfolgenden Params/Platzhalter exakt mitgezählt werden. `project_id` wird bewusst als **letzte** Spalte in `INVOICE_COLS`/`map_invoice` angehängt (nicht z.B. direkt nach `deal_id` einsortiert), um jede Index-Verschiebung bei den bereits bestehenden 22 Spalten zu vermeiden -- nur ein einziger neuer Index (22) kommt hinzu, alle bisherigen bleiben unverändert.
- Neue Fetch-Aufrufe (Rechnungsliste laden) gehen über `FinanceGateway` (dual-path lokal/cloud), nicht direkt über `FinanceService` (lokal-only) -- `FinanzPane.tsx`'s bestehender direkter `FinanceService`-Aufruf ist ein vorbestehendes, nicht Teil dieser Etappe zu behebendes Detail (siehe Kontext im Plan), aber neuer Code in dieser Etappe repliziert dieses Muster nicht.

---

### Task 1: SQLite-Migration v42 -- `invoices.project_id`-Spalte

**Files:**
- Modify: `src-tauri/src/db/migrations.rs`

**Interfaces:**
- Produces: Spalte `invoices.project_id TEXT, NULL`. Task 3 (Rust-Struct) konsumiert sie.

- [ ] **Step 1: `CURRENT_VERSION` erhöhen**

In `src-tauri/src/db/migrations.rs`, Zeile 4, `CURRENT_VERSION: u32 = 41;` zu `42` ändern.

- [ ] **Step 2: Migrations-Arm hinzufügen**

Nach dem `41 => { ... }`-Block (fügt `moodboard_items` zu `projects` hinzu), vor `_ => Ok(()),` einfügen:

```rust
        42 => {
            // Etappe 6 des Projekt-Ausbaus: optionale Projekt-Zuordnung fuer
            // Rechnungen. NULL bleibt ein gueltiger Zustand -- nicht jede
            // Rechnung ist an ein Projekt gekoppelt.
            if !column_exists(conn, "invoices", "project_id") {
                conn.execute_batch(
                    "ALTER TABLE invoices ADD COLUMN project_id TEXT;"
                )?;
            }
            Ok(())
        }
```

- [ ] **Step 3: Test schreiben**

Im `#[cfg(test)] mod tests`-Block, nach dem letzten bestehenden Migrations-Test (finde ihn per Suche nach `fn migration_41_`), vor der schließenden `}` des Moduls einfügen:

```rust
    #[test]
    fn migration_42_adds_invoices_project_id_column_nullable() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();

        for v in 1..=41u32 {
            apply(&conn, v).unwrap();
            set_version(&conn, v).unwrap();
        }
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
             VALUES ('a1','ws-1','u-1','Test','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO invoices (id, workspace_id, created_by, account_id, date, due_date, status, tax_mode, subtotal, tax_amount, total, bank_info, created_at, updated_at)
             VALUES ('inv-1','ws-1','u-1','a1','2026-01-01','2026-01-15','draft','standard',100,19,119,'{}','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            [],
        ).unwrap();

        run(&conn).unwrap();

        assert!(column_exists(&conn, "invoices", "project_id"));
        let project_id: Option<String> = conn.query_row(
            "SELECT project_id FROM invoices WHERE id = 'inv-1'", [], |r| r.get(0),
        ).unwrap();
        assert_eq!(project_id, None);

        run(&conn).unwrap(); // idempotent
    }
```

- [ ] **Step 4: Tests ausführen**

Run: `cd src-tauri && cargo test migration_42 -- --nocapture`
Expected: PASS.

Run: `cd src-tauri && cargo build 2>&1 | tail -20`
Expected: Build erfolgreich.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db/migrations.rs
git commit -m "feat(db): migration v42 -- invoices.project_id-Spalte"
```

---

### Task 2: Supabase-Migration 0032 -- `invoices.project_id`-Spalte

**Files:**
- Create: `supabase/migrations/0032_invoices_project_id.sql`

**Interfaces:**
- Produces: Spalte `invoices.project_id text, NULL` im Cloud-Schema.

- [ ] **Step 1: Migrations-Datei anlegen**

```sql
-- Cloud-Gegenstueck zu SQLite-Migration v42 (src-tauri/src/db/migrations.rs).
-- Muss wie 0001-0031 manuell ueber die Management-API auf das Supabase-Projekt
-- angewendet werden (siehe Kommentar in 0026_projects.sql).
--
-- Optionale Projekt-Zuordnung fuer Rechnungen, analog zum bestehenden deal_id-Feld.
-- NULL bleibt ein gueltiger Zustand -- nicht jede Rechnung ist an ein Projekt gekoppelt.

alter table public.invoices
  add column if not exists project_id text;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0032_invoices_project_id.sql
git commit -m "feat(db): Supabase-Migration 0032 -- invoices.project_id-Spalte"
```

(Hinweis für später: muss noch manuell über die Management-API angewendet werden. Kein Teil dieses Tasks.)

---

### Task 3: `Invoice.project_id`-Feld + `get_by_project`/`set_project`

**Files:**
- Modify: `src-tauri/src/db/invoice.rs`

**Interfaces:**
- Consumes: `invoices.project_id`-Spalte (Task 1).
- Produces: `Invoice.project_id: Option<String>`. `get_by_project(conn, project_id) -> Result<Vec<Invoice>, AppError>`. `set_project(conn, id, project_id: Option<String>) -> Result<Invoice, AppError>`. Task 4 (Tauri-Commands) ruft beide auf.

**Wichtig -- lies das genau, bevor du anfängst:** Diese Datei nutzt **positionelle** SQL-Platzhalter (`?1`, `?2`, …) in `create()` und `update()`. Du fügst `project_id` als **letzte** Spalte an (nach `updated_at`, NICHT nach `deal_id`) -- das bedeutet: in `INVOICE_COLS` und `map_invoice` wird nur ein neuer Eintrag am Ende angehängt (Index 22), alle bestehenden 22 Indizes (0-21) bleiben unverändert. In `create()`/`update()` bedeutet das: du fügst jeweils GENAU EINEN neuen Platzhalter am Ende der VALUES-Liste bzw. SET-Klausel hinzu und GENAU EINEN neuen Parameter am Ende des jeweiligen `rusqlite::params![...]`-Arrays -- die bereits bestehenden Platzhalter-Nummern (`?1` bis `?17` in `create()`, `?1` bis `?13` in `update()`) bleiben unverändert, nur die WHERE-Klausel in `update()` verschiebt sich um eine Nummer nach hinten (da ein neuer Parameter dazwischenkommt). Lies den kompletten aktuellen Code beider Funktionen, bevor du etwas änderst, und zähle die Platzhalter nach jeder Änderung nach.

- [ ] **Step 1: Feld zum Struct + Payload hinzufügen**

Im `Invoice`-Struct (aktuell Zeilen 7-30), nach `pub updated_at: String,` einfügen:

```rust
    pub project_id: Option<String>,
```

Im `UpsertInvoicePayload`-Struct (aktuell Zeilen 57-75), nach `pub deal_id: Option<String>,` einfügen (semantisch neben `deal_id` im Payload -- das Struct-Feld hat keine positionelle SQL-Bindung, hier ist die Reihenfolge frei):

```rust
    pub project_id: Option<String>,
```

- [ ] **Step 2: `INVOICE_COLS` + `map_invoice` erweitern**

`INVOICE_COLS`-Konstante (aktuell Zeilen 156-159) am Ende erweitern:

```rust
const INVOICE_COLS: &str =
    "id, workspace_id, created_by, account_id, deal_id, number, date, due_date, \
     status, tax_mode, subtotal, tax_amount, total, bank_info, notes, pdf_path, \
     is_suggestion, suggested_by, approved_by, pending_sync, created_at, updated_at, project_id";
```

`map_invoice` (aktuell Zeilen 113-138), nach `updated_at:   r.get(20)?,` einfügen (Zeilen-Nummerierung: `updated_at` ist aktuell Index 21, nicht 20 -- finde die tatsächliche letzte Zeile per Inhalt, nicht per Zeilennummer):

```rust
        project_id:   r.get(22)?,
```

- [ ] **Step 3: `create()` erweitern**

Aktuell (Zeilen 309-349):

```rust
pub fn create(conn: &Connection, payload: UpsertInvoicePayload) -> Result<InvoiceWithItems, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let status = payload.status.unwrap_or_else(|| "draft".into());
    let tax_mode = payload.tax_mode.unwrap_or_else(|| "standard".into());
    let bank_info = payload.bank_info.unwrap_or_else(|| "{}".into());
    let is_suggestion = payload.is_suggestion.unwrap_or(false);
    conn.execute(
        &format!("INSERT INTO invoices ({INVOICE_COLS})
         VALUES (?1,?2,?3,?4,?5,NULL,?6,?7,?8,?9,?10,?11,?12,?13,?14,NULL,?15,?16,NULL,1,?17,?17)"),
        rusqlite::params![
            id, payload.workspace_id, payload.created_by, payload.account_id, payload.deal_id,
            payload.date, payload.due_date, status, tax_mode,
            payload.subtotal, payload.tax_amount, payload.total, bank_info, payload.notes,
            is_suggestion as i32, payload.suggested_by, now,
        ],
    )?;
```

Ändern zu (nur die VALUES-Zeile und die letzte Zeile des `params!`-Arrays ändern sich -- alles andere in der Funktion bleibt exakt gleich):

```rust
pub fn create(conn: &Connection, payload: UpsertInvoicePayload) -> Result<InvoiceWithItems, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let status = payload.status.unwrap_or_else(|| "draft".into());
    let tax_mode = payload.tax_mode.unwrap_or_else(|| "standard".into());
    let bank_info = payload.bank_info.unwrap_or_else(|| "{}".into());
    let is_suggestion = payload.is_suggestion.unwrap_or(false);
    conn.execute(
        &format!("INSERT INTO invoices ({INVOICE_COLS})
         VALUES (?1,?2,?3,?4,?5,NULL,?6,?7,?8,?9,?10,?11,?12,?13,?14,NULL,?15,?16,NULL,1,?17,?17,?18)"),
        rusqlite::params![
            id, payload.workspace_id, payload.created_by, payload.account_id, payload.deal_id,
            payload.date, payload.due_date, status, tax_mode,
            payload.subtotal, payload.tax_amount, payload.total, bank_info, payload.notes,
            is_suggestion as i32, payload.suggested_by, now, payload.project_id,
        ],
    )?;
```

(Nur `?18` am Ende der VALUES-Zeile ergänzt, `payload.project_id` am Ende des `params!`-Arrays ergänzt. Alles danach in `create()` -- Rechnungsnummer-Vergabe, `replace_items`, finale `SELECT` -- bleibt unverändert, da diese Teile `INVOICE_COLS` über das bereits erweiterte `format!("SELECT {INVOICE_COLS} ...")` ohnehin korrekt mitziehen.)

- [ ] **Step 4: `update()` erweitern**

Aktuell (Zeilen 387-397):

```rust
    let n = conn.execute(
        "UPDATE invoices SET account_id=?1, deal_id=?2, date=?3, due_date=?4,
         tax_mode=?5, subtotal=?6, tax_amount=?7, total=?8, bank_info=?9,
         notes=?10, status=?11, pending_sync=1, updated_at=?12 WHERE id=?13",
        rusqlite::params![
            payload.account_id, payload.deal_id, payload.date, payload.due_date,
            payload.tax_mode.unwrap_or_else(|| "standard".into()),
            payload.subtotal, payload.tax_amount, payload.total, bank_info,
            payload.notes, new_status, now, id,
        ],
    )?;
```

Ändern zu:

```rust
    let n = conn.execute(
        "UPDATE invoices SET account_id=?1, deal_id=?2, date=?3, due_date=?4,
         tax_mode=?5, subtotal=?6, tax_amount=?7, total=?8, bank_info=?9,
         notes=?10, status=?11, pending_sync=1, updated_at=?12, project_id=?13 WHERE id=?14",
        rusqlite::params![
            payload.account_id, payload.deal_id, payload.date, payload.due_date,
            payload.tax_mode.unwrap_or_else(|| "standard".into()),
            payload.subtotal, payload.tax_amount, payload.total, bank_info,
            payload.notes, new_status, now, payload.project_id, id,
        ],
    )?;
```

(`project_id=?13` vor der WHERE-Klausel ergänzt, WHERE-Platzhalter von `?13` auf `?14` verschoben, `payload.project_id` VOR `id` im `params!`-Array ergänzt -- die Reihenfolge im Array muss exakt der Reihenfolge der `?N`-Platzhalter in der SQL-Zeichenkette entsprechen.)

- [ ] **Step 5: `get_by_project` + `set_project` hinzufügen**

Nach `get_by_account` (aktuell Zeilen 442-448), vor dem `#[cfg(test)]`-Block einfügen:

```rust
pub fn get_by_project(conn: &Connection, project_id: &str) -> Result<Vec<Invoice>, AppError> {
    let mut stmt = conn.prepare(
        &format!("SELECT {INVOICE_COLS} FROM invoices WHERE project_id=?1 ORDER BY created_at DESC")
    )?;
    let rows = stmt.query_map([project_id], map_invoice)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Setzt/entfernt die Projekt-Zuordnung einer bestehenden Rechnung. `None`
/// entfernt die Zuordnung (Rechnung bleibt gueltig, wie zuvor die Migration
/// es fuer alle Bestandsrechnungen tut). `Some(id)` erfordert ein existierendes
/// Projekt -- sonst AppError::NotFound (kein stiller Fehlgriff auf eine
/// nicht-existente Projekt-ID).
pub fn set_project(conn: &Connection, id: &str, project_id: Option<String>) -> Result<Invoice, AppError> {
    if let Some(ref pid) = project_id {
        let exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM projects WHERE id = ?1", [pid], |r| r.get(0),
        )?;
        if exists == 0 {
            return Err(AppError::NotFound(format!("Project {pid} not found")));
        }
    }
    let n = conn.execute(
        "UPDATE invoices SET project_id = ?1 WHERE id = ?2",
        rusqlite::params![project_id, id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("Invoice {id} not found")));
    }
    conn.query_row(
        &format!("SELECT {INVOICE_COLS} FROM invoices WHERE id = ?1"),
        [id], map_invoice,
    ).map_err(AppError::from)
}
```

- [ ] **Step 6: Bestehende Test-Fixtures um `project_id` ergänzen**

`sample_payload` (aktuell Zeilen 695-715) nach `deal_id: None,` ergänzen:

```rust
            project_id: None,
```

- [ ] **Step 7: Neue Tests schreiben**

Nach `invoice_number_exists_detects_duplicate` (aktuell Zeilen 684-693), vor `fn sample_payload` einfügen:

```rust
    #[test]
    fn create_stores_project_id_when_provided() {
        let conn = setup();
        conn.execute(
            "INSERT INTO projects (id, workspace_id, account_id, title, status, created_at, updated_at,
             retainer_monthly, retainer_hours, retainer_months)
             VALUES ('p1','ws-1','acc-1','Test-Projekt','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',0,0,NULL)",
            [],
        ).unwrap();
        let mut p = sample_payload(vec![]);
        p.project_id = Some("p1".into());
        let result = create(&conn, p).unwrap();
        assert_eq!(result.invoice.project_id, Some("p1".to_string()));
    }

    #[test]
    fn get_by_project_filters_correctly() {
        let conn = setup();
        conn.execute(
            "INSERT INTO projects (id, workspace_id, account_id, title, status, created_at, updated_at,
             retainer_monthly, retainer_hours, retainer_months)
             VALUES ('p1','ws-1','acc-1','Test-Projekt','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',0,0,NULL)",
            [],
        ).unwrap();
        let mut with_project = sample_payload(vec![]);
        with_project.project_id = Some("p1".into());
        create(&conn, with_project).unwrap();
        create(&conn, sample_payload(vec![])).unwrap(); // ohne Projekt
        let results = get_by_project(&conn, "p1").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].project_id, Some("p1".to_string()));
    }

    #[test]
    fn set_project_assigns_and_removes() {
        let conn = setup();
        conn.execute(
            "INSERT INTO projects (id, workspace_id, account_id, title, status, created_at, updated_at,
             retainer_monthly, retainer_hours, retainer_months)
             VALUES ('p1','ws-1','acc-1','Test-Projekt','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',0,0,NULL)",
            [],
        ).unwrap();
        let created = create(&conn, sample_payload(vec![])).unwrap();
        let assigned = set_project(&conn, &created.invoice.id, Some("p1".into())).unwrap();
        assert_eq!(assigned.project_id, Some("p1".to_string()));
        let removed = set_project(&conn, &created.invoice.id, None).unwrap();
        assert_eq!(removed.project_id, None);
    }

    #[test]
    fn set_project_rejects_unknown_project() {
        let conn = setup();
        let created = create(&conn, sample_payload(vec![])).unwrap();
        let result = set_project(&conn, &created.invoice.id, Some("missing-project".into()));
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn set_project_rejects_unknown_invoice() {
        let conn = setup();
        let result = set_project(&conn, "missing-invoice", None);
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }
```

- [ ] **Step 8: Tests ausführen**

Run: `cd src-tauri && cargo test db::invoice:: -- --nocapture`
Expected: PASS (bestehende Tests + 5 neue).

Run: `cd src-tauri && cargo test 2>&1 | tail -10`
Expected: volle Suite grün (Baseline 309 + 1 [Migration Task 1] + 5 = 315).

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/db/invoice.rs
git commit -m "feat(db): Invoice -- project_id-Feld + get_by_project/set_project"
```

---

### Task 4: Tauri-Commands `get_invoices_by_project`/`set_invoice_project`

**Files:**
- Modify: `src-tauri/src/commands/invoice.rs`
- Modify: `src-tauri/src/main.rs`

**Interfaces:**
- Consumes: `db::invoice::get_by_project`/`set_project` (Task 3).
- Produces: Tauri-Commands `get_invoices_by_project`, `set_invoice_project`. Task 8 (TS-Service) ruft beide auf.

- [ ] **Step 1: Commands hinzufügen**

Nach `get_invoices_by_account` (aktuell Zeilen 67-73), vor `get_finance_kpis` einfügen:

```rust
#[tauri::command]
pub fn get_invoices_by_project(
    db: State<'_, DbPool>,
    project_id: String,
) -> Result<Vec<Invoice>, AppError> {
    db::invoice::get_by_project(&db.conn(), &project_id)
}

#[tauri::command]
pub fn set_invoice_project(
    db: State<'_, DbPool>,
    id: String,
    project_id: Option<String>,
) -> Result<Invoice, AppError> {
    db::invoice::set_project(&db.conn(), &id, project_id)
}
```

- [ ] **Step 2: In `main.rs` registrieren**

Nach `commands::invoice::get_invoices_by_account,` (aktuell Zeile 407) einfügen:

```rust
            commands::invoice::get_invoices_by_project,
            commands::invoice::set_invoice_project,
```

- [ ] **Step 3: Build prüfen**

Run: `cd src-tauri && cargo build 2>&1 | tail -40`
Expected: Build erfolgreich.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/invoice.rs src-tauri/src/main.rs
git commit -m "feat(commands): get_invoices_by_project/set_invoice_project registriert"
```

---

### Task 5: TypeScript-Typen -- `Invoice.projectId`

**Files:**
- Modify: `src/types/finance.types.ts`

**Interfaces:**
- Produces: `Invoice.projectId?: string`, `UpsertInvoicePayload.projectId?: string`.

- [ ] **Step 1: Felder ergänzen**

In `src/types/finance.types.ts`, im `Invoice`-Interface (aktuell Zeilen 5-28), nach `dealId?: string` ergänzen:

```typescript
  projectId?: string
```

Im `UpsertInvoicePayload`-Interface (aktuell Zeilen 69-88), nach `dealId?: string` ergänzen:

```typescript
  projectId?: string
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i invoice`
Expected: keine Fehler (beide Felder sind optional, brechen keine bestehenden Aufrufer).

- [ ] **Step 3: Commit**

```bash
git add src/types/finance.types.ts
git commit -m "feat(types): Invoice.projectId + UpsertInvoicePayload.projectId"
```

---

### Task 6: Mapper -- `projectId` durchreichen

**Files:**
- Modify: `src/data/finance.mapper.ts`
- Modify: `src/data/finance.mapper.test.ts`

**Interfaces:**
- Consumes: `Invoice.projectId`, `UpsertInvoicePayload.projectId` (Task 5).
- Produces: `invoiceRowToInvoice` liefert `projectId`; `invoicePayloadToRow` schreibt `project_id`.

- [ ] **Step 1: Fehlschlagende Tests zuerst schreiben**

Lies `src/data/finance.mapper.test.ts` zuerst vollständig, um das bestehende Test-Muster für `invoiceRowToInvoice`/`invoicePayloadToRow` zu finden (Zeilen-Referenzen können abweichen). Ergänze im jeweiligen `describe`-Block:

```typescript
  it('mappt project_id zu projectId (invoiceRowToInvoice)', () => {
    const row = {
      id: 'inv1', workspace_id: 'ws1', created_by: 'u1', account_id: 'a1', deal_id: null,
      number: null, date: '2026-01-01', due_date: '2026-01-15', status: 'draft', tax_mode: 'standard',
      subtotal: 100, tax_amount: 19, total: 119, bank_info: '{}', notes: null, pdf_path: null,
      is_suggestion: 0, suggested_by: null, approved_by: null, pending_sync: 0,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      project_id: 'p1',
    }
    expect(invoiceRowToInvoice(row).projectId).toBe('p1')
  })

  it('faellt bei fehlendem project_id auf undefined zurueck (invoiceRowToInvoice)', () => {
    const row = {
      id: 'inv1', workspace_id: 'ws1', created_by: 'u1', account_id: 'a1', deal_id: null,
      number: null, date: '2026-01-01', due_date: '2026-01-15', status: 'draft', tax_mode: 'standard',
      subtotal: 100, tax_amount: 19, total: 119, bank_info: '{}', notes: null, pdf_path: null,
      is_suggestion: 0, suggested_by: null, approved_by: null, pending_sync: 0,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      project_id: null,
    }
    expect(invoiceRowToInvoice(row).projectId).toBeUndefined()
  })

  it('schreibt project_id aus projectId (invoicePayloadToRow)', () => {
    const payload = {
      workspaceId: 'ws1', createdBy: 'u1', accountId: 'a1', projectId: 'p1',
      date: '2026-01-01', dueDate: '2026-01-15', subtotal: 100, taxAmount: 19, total: 119, items: [],
    }
    const row = invoicePayloadToRow(payload, { id: 'inv1', now: '2026-01-01T00:00:00Z' })
    expect(row.project_id).toBe('p1')
  })

  it('schreibt project_id als null, wenn projectId fehlt (invoicePayloadToRow)', () => {
    const payload = {
      workspaceId: 'ws1', createdBy: 'u1', accountId: 'a1',
      date: '2026-01-01', dueDate: '2026-01-15', subtotal: 100, taxAmount: 19, total: 119, items: [],
    }
    const row = invoicePayloadToRow(payload, { id: 'inv1', now: '2026-01-01T00:00:00Z' })
    expect(row.project_id).toBeNull()
  })
```

Run: `npx vitest run src/data/finance.mapper.test.ts`
Expected: FAIL -- `projectId`/`project_id` werden noch nicht durchgereicht.

- [ ] **Step 2: Mapper erweitern**

In `src/data/finance.mapper.ts`, `invoiceRowToInvoice` (aktuell Zeilen 4-14), nach `dealId: r.deal_id ?? undefined,` ergänzen:

```typescript
    projectId: r.project_id ?? undefined,
```

`invoicePayloadToRow` (aktuell Zeilen 55-67), nach `deal_id: p.dealId ?? null,` ergänzen:

```typescript
    project_id: p.projectId ?? null,
```

- [ ] **Step 3: Test ausführen, Erfolg verifizieren**

Run: `npx vitest run src/data/finance.mapper.test.ts`
Expected: PASS (alle bisherigen Tests + 4 neue).

- [ ] **Step 4: Commit**

```bash
git add src/data/finance.mapper.ts src/data/finance.mapper.test.ts
git commit -m "feat(data): Finance-Mapper -- projectId durchreichen"
```

---

### Task 7: Gateway -- `getInvoicesByProject`/`setInvoiceProject`

**Files:**
- Modify: `src/data/finance.gateway.ts`

**Interfaces:**
- Consumes: `FinanceService.getInvoicesByProject`/`setInvoiceProject` (Task 8, wird gleich mit dem finalen Namen aufgerufen, existiert dort noch nicht -- analoges Cross-Task-Muster wie in Etappe 3/4/5).
- Produces: `FinanceGateway.getInvoicesByProject(projectId): Promise<Invoice[]>`, `FinanceGateway.setInvoiceProject(id, projectId: string | null): Promise<Invoice>`.

- [ ] **Step 1: Methoden hinzufügen**

Nach `getInvoicesByAccount` (aktuell Zeilen 43-49), vor `getOffers` einfügen:

```typescript
  async getInvoicesByProject(projectId: string): Promise<Invoice[]> {
    if (!shared()) return FinanceService.getInvoicesByProject(projectId)
    const { data, error } = await supabase.from('invoices').select('*')
      .eq('project_id', projectId).order('created_at', { ascending: false })
    if (error) fail(error)
    return (data ?? []).map(invoiceRowToInvoice)
  },
```

Nach `deleteInvoice` (aktuell Zeilen 163-167), vor `createOffer` einfügen:

```typescript
  async setInvoiceProject(id: string, projectId: string | null): Promise<Invoice> {
    if (!shared()) return FinanceService.setInvoiceProject(id, projectId)
    const { data, error } = await supabase.from('invoices')
      .update({ project_id: projectId }).eq('id', id).select('*').single()
    if (error) fail(error)
    return invoiceRowToInvoice(data)
  },
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i invoice`
Expected: Fehler nur noch in `finance.service.ts` (fehlende `getInvoicesByProject`/`setInvoiceProject`-Methoden) -- behoben in Task 8.

- [ ] **Step 3: Commit**

```bash
git add src/data/finance.gateway.ts
git commit -m "feat(data): FinanceGateway -- getInvoicesByProject/setInvoiceProject"
```

---

### Task 8: Service -- Invoke-Wrapper

**Files:**
- Modify: `src/services/finance.service.ts`

**Interfaces:**
- Consumes: `get_invoices_by_project`/`set_invoice_project` (Task 4).
- Produces: `FinanceService.getInvoicesByProject(projectId): Promise<Invoice[]>`, `FinanceService.setInvoiceProject(id, projectId): Promise<Invoice>`.

- [ ] **Step 1: Methoden hinzufügen**

In `src/services/finance.service.ts`, nach `getInvoicesByAccount` (aktuell Zeilen 35-37) einfügen:

```typescript
  getInvoicesByProject(projectId: string): Promise<Invoice[]> {
    return invoke('get_invoices_by_project', { projectId })
  },
```

Nach `deleteInvoice` (aktuell Zeilen 23-25) einfügen:

```typescript
  setInvoiceProject(id: string, projectId: string | null): Promise<Invoice> {
    return invoke('set_invoice_project', { id, projectId })
  },
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i invoice`
Expected: keine Fehler mehr in `finance.service.ts`/`finance.gateway.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/services/finance.service.ts
git commit -m "feat(services): FinanceService -- getInvoicesByProject/setInvoiceProject"
```

---

### Task 9: Store -- `setInvoiceProject`-Action

**Files:**
- Modify: `src/store/finance.store.ts`
- Modify: `src/store/finance.store.test.ts`

**Interfaces:**
- Consumes: `FinanceGateway.setInvoiceProject` (Task 7).
- Produces: `useFinanceStore().setInvoiceProject(id, projectId): Promise<void>`. Task 10 (`InvoiceRow`) ruft sie auf.

- [ ] **Step 1: Fehlschlagenden Test zuerst schreiben**

Lies `src/store/finance.store.test.ts` zuerst vollständig, um das bestehende Test-Muster für `updateInvoiceStatus` zu finden (Mock-Block, `withErrorToast`-Handling). Ergänze analog:

```typescript
  it('setInvoiceProject aktualisiert die Rechnung im Store', async () => {
    vi.mocked(FinanceGateway.setInvoiceProject).mockResolvedValue({ ...sampleInvoice, projectId: 'p1' })
    await useFinanceStore.getState().setInvoiceProject('inv1', 'p1')
    expect(useFinanceStore.getState().invoices.find(i => i.id === 'inv1')?.projectId).toBe('p1')
  })
```

(Passe `sampleInvoice`/Store-Vorab-Zustand an das tatsächliche bestehende Testmuster dieser Datei an -- lies zuerst, wie `updateInvoiceStatus`'s Test den Store vorbereitet, `beforeEach` etc., und folge exakt demselben Muster für Konsistenz.)

Den `vi.mock('@/data/finance.gateway', ...)`-Block (falls vorhanden) um `setInvoiceProject: vi.fn()` erweitern -- lies zuerst, ob diese Datei Gateway oder Service mockt, und folge dem bestehenden Muster.

Run: `npx vitest run src/store/finance.store.test.ts`
Expected: FAIL -- `setInvoiceProject` existiert noch nicht auf dem Store.

- [ ] **Step 2: Action implementieren**

`FinanceState`-Interface (aktuell Zeilen 66-... ), nach `updateInvoiceStatus: (id: string, status: InvoiceStatus) => Promise<void>` ergänzen:

```typescript
  setInvoiceProject: (id: string, projectId: string | null) => Promise<void>
```

Im Store-Objekt, nach `updateInvoiceStatus` (aktuell Zeilen 197-206) einfügen:

```typescript

  setInvoiceProject: (id, projectId) => withErrorToast('Projekt-Zuordnung konnte nicht gespeichert werden.', async () => {
    const updated = await FinanceGateway.setInvoiceProject(id, projectId)
    set(s => ({
      invoices: s.invoices.map(i => i.id === id ? updated : i),
    }))
  }),
```

- [ ] **Step 3: Test ausführen, Erfolg verifizieren**

Run: `npx vitest run src/store/finance.store.test.ts`
Expected: PASS (bestehende Tests + 1 neuer).

- [ ] **Step 4: Commit**

```bash
git add src/store/finance.store.ts src/store/finance.store.test.ts
git commit -m "feat(store): setInvoiceProject-Action"
```

---

### Task 10: `InvoiceRow` -- Extraktion in eine gemeinsame Datei + Zuordnen-Dropdown

**Files:**
- Create: `src/components/finance/InvoiceRow.tsx`
- Test: `src/components/finance/InvoiceRow.test.tsx`
- Modify: `src/components/customer/tabs/FinanzPane.tsx`

**Interfaces:**
- Consumes: `useFinanceStore().setInvoiceProject` (Task 9), `useProjectsStore` (bestehend).
- Produces: `InvoiceRow({ inv, payments, pdfBusy, projects, onPayment, onDownload }): JSX.Element` (exportiert, wiederverwendbar). `FinanzPane.tsx` nutzt die extrahierte Version statt der bisherigen privaten Funktion.

**Kontext:** `FinanzPane.tsx` hat aktuell eine private `InvoiceRow`-Funktion (Zeilen 68-118). Diese Etappe braucht dieselbe Zeilen-Darstellung auch im neuen Projekt-Tab (Task 12) -- daher wird sie in eine eigene Datei extrahiert und um ein Zuordnen-Dropdown erweitert (Projekt wählen aus den Projekten des Rechnungs-Kunden, oder "Kein Projekt").

- [ ] **Step 1: Fehlschlagende Tests zuerst schreiben**

Lies zuerst die aktuelle `InvoiceRow`-Funktion in `FinanzPane.tsx` vollständig (Zeilen 68-118 zum Zeitpunkt der Planerstellung -- können abweichen), um die exakte bestehende Darstellung (Status-Chip, Zahlung-Button, PDF-Button) zu übernehmen.

Neue Datei `src/components/finance/InvoiceRow.test.tsx`:

```typescript
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { InvoiceRow } from './InvoiceRow'
import type { Invoice, Payment } from '@/types/finance.types'
import type { Project } from '@/types/project.types'

afterEach(cleanup)

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv1', workspaceId: 'ws1', createdBy: 'u1', accountId: 'a1',
    date: '2026-01-01', dueDate: '2026-01-15', status: 'open', taxMode: 'standard',
    subtotal: 100, taxAmount: 19, total: 119, bankInfo: '{}',
    isSuggestion: false, pendingSync: false,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1', workspaceId: 'ws1', accountId: 'a1', title: 'Relaunch', description: null,
    status: 'active', currentPhaseId: null, createdAt: '2026-01-01', updatedAt: '2026-01-01',
    completedAt: null, retainerMonthly: 0, retainerHours: 0, retainerMonths: null,
    moodboardItems: [],
    ...overrides,
  }
}

function renderRow(overrides: Partial<Parameters<typeof InvoiceRow>[0]> = {}) {
  return render(
    <table><tbody>
      <InvoiceRow
        inv={invoice()} payments={[]} pdfBusy={null} projects={[project()]}
        onPayment={vi.fn()} onDownload={vi.fn()} onAssignProject={vi.fn()}
        {...overrides}
      />
    </tbody></table>,
  )
}

describe('InvoiceRow', () => {
  it('zeigt Rechnungsnummer, Betrag und Status', () => {
    renderRow({ inv: invoice({ number: 'R-2026-001' }) })
    expect(screen.getByText('R-2026-001')).toBeTruthy()
    expect(screen.getByText('Offen')).toBeTruthy()
  })

  it('zeigt "Kein Projekt" im Zuordnen-Dropdown, wenn keine Zuordnung besteht', () => {
    renderRow({ inv: invoice({ projectId: undefined }) })
    expect(screen.getByRole('combobox')).toHaveValue('')
  })

  it('zeigt das zugeordnete Projekt im Dropdown vorausgewaehlt', () => {
    renderRow({ inv: invoice({ projectId: 'p1' }) })
    expect(screen.getByRole('combobox')).toHaveValue('p1')
  })

  it('ruft onAssignProject beim Aendern der Auswahl auf', () => {
    const onAssignProject = vi.fn()
    renderRow({ inv: invoice({ projectId: undefined }), onAssignProject })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p1' } })
    expect(onAssignProject).toHaveBeenCalledWith('inv1', 'p1')
  })

  it('ruft onAssignProject mit null auf, wenn "Kein Projekt" gewaehlt wird', () => {
    const onAssignProject = vi.fn()
    renderRow({ inv: invoice({ projectId: 'p1' }), onAssignProject })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })
    expect(onAssignProject).toHaveBeenCalledWith('inv1', null)
  })
})
```

Run: `npx vitest run src/components/finance/InvoiceRow.test.tsx`
Expected: FAIL -- Modul existiert nicht.

- [ ] **Step 2: `InvoiceRow` extrahieren + erweitern**

Neue Datei `src/components/finance/InvoiceRow.tsx` -- übernimm die bestehende Darstellung 1:1 aus `FinanzPane.tsx`'s privater `InvoiceRow`-Funktion (Status-Chip via `displayInvoiceStatus`/`STATUS_TONE`/`STATUS_LABEL`, Zahlung-Button, PDF-Button), ergänzt um ein Zuordnen-Dropdown:

```typescript
import { useState } from 'react'
import { Banknote, Download } from 'lucide-react'
import { isOverdue, paidAmount, remaining, displayInvoiceStatus } from '@/lib/invoice-status'
import type { Invoice, Payment } from '@/types/finance.types'
import type { Project } from '@/types/project.types'

const STATUS_TONE: Record<string, string> = {
  draft: '', open: 'warn', paid: 'ok', overdue: 'bad', partly: 'info',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Entwurf', open: 'Offen', paid: 'Bezahlt', overdue: 'Überfällig', partly: 'Teilbezahlt',
}

function fmt(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}
function relDate(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function InvoiceRow({ inv, payments, pdfBusy, projects, onPayment, onDownload, onAssignProject }: {
  inv: Invoice
  payments: Payment[]
  pdfBusy: string | null
  projects: Project[]
  onPayment: (inv: Invoice) => void
  onDownload: (inv: Invoice) => void
  onAssignProject: (invoiceId: string, projectId: string | null) => void
}) {
  const [hover, setHover] = useState(false)
  const paid = paidAmount(payments, inv.id)
  const s = displayInvoiceStatus(inv, paid)
  return (
    <tr
      style={{
        borderBottom: '1px solid var(--border)',
        background: hover ? 'var(--surface-2)' : 'transparent',
        transition: 'background 100ms',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <td style={{ padding: '9px 14px' }}><span className="mono" style={{ fontSize: 11 }}>{inv.number ?? '—'}</span></td>
      <td style={{ padding: '9px 14px', color: 'var(--fg-dim)', fontSize: 12 }}>{relDate(inv.date)}</td>
      <td style={{ padding: '9px 14px', color: 'var(--fg-dim)', fontSize: 12 }}>{relDate(inv.dueDate)}</td>
      <td style={{ padding: '9px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(inv.total)}</td>
      <td style={{ padding: '9px 14px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span className="chip" data-tone={STATUS_TONE[s] ?? ''}>{STATUS_LABEL[s] ?? s}</span>
          {s === 'partly' && (
            <span style={{ fontSize: 10.5, color: 'var(--fg-dim)', fontVariantNumeric: 'tabular-nums' }}>
              {fmt(remaining(inv, paid))} offen
            </span>
          )}
        </span>
      </td>
      <td style={{ padding: '9px 14px' }}>
        <select
          value={inv.projectId ?? ''}
          onChange={e => onAssignProject(inv.id, e.target.value || null)}
          style={{ fontSize: 11.5, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg-muted)' }}
        >
          <option value="">Kein Projekt</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </td>
      <td style={{ padding: '9px 14px', textAlign: 'right' }}>
        <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
          {inv.status !== 'draft' && inv.status !== 'cancelled' && (
            <button onClick={() => onPayment(inv)} title="Zahlung erfassen"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg-muted)', cursor: 'pointer', fontSize: 11, transition: 'border-color 100ms, color 100ms' }}>
              <Banknote size={12} /> Zahlung
            </button>
          )}
          <button onClick={() => onDownload(inv)} disabled={pdfBusy === inv.id} title="Rechnung als PDF"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg-muted)', cursor: pdfBusy === inv.id ? 'wait' : 'pointer', fontSize: 11 }}>
            <Download size={12} /> {pdfBusy === inv.id ? '…' : 'PDF'}
          </button>
        </div>
      </td>
    </tr>
  )
}
```

`isOverdue` bleibt importiert, auch wenn in diesem Ausschnitt ungenutzt -- prüfe beim Übernehmen aus `FinanzPane.tsx`, ob es dort tatsächlich verwendet wird; falls nicht, NICHT mit-importieren (kein toter Import).

- [ ] **Step 3: `FinanzPane.tsx` auf die extrahierte Komponente umstellen**

Entferne die private `InvoiceRow`-Funktion aus `FinanzPane.tsx` vollständig. Importiere stattdessen:

```typescript
import { InvoiceRow } from '@/components/finance/InvoiceRow'
```

Am Aufrufpunkt (aktuell `<InvoiceRow key={inv.id} inv={inv} payments={payments} pdfBusy={pdfBusy} onPayment={setPaymentInvoice} onDownload={downloadInvoice} />`) ergänzen um `projects` und `onAssignProject`:

```typescript
                <InvoiceRow
                  key={inv.id} inv={inv} payments={payments} pdfBusy={pdfBusy}
                  projects={projectsForAccount} onPayment={setPaymentInvoice} onDownload={downloadInvoice}
                  onAssignProject={(id, projectId) => setInvoiceProject(id, projectId)}
                />
```

Ergänze in `FinanzPane`s Funktionskörper (nach den bestehenden Store-Selektoren):

```typescript
  const setInvoiceProject = useFinanceStore(s => s.setInvoiceProject)
  const allProjects = useProjectsStore(s => s.projects)
  const loadProjects = useProjectsStore(s => s.load)
  const projectsForAccount = useMemo(
    () => allProjects.filter(p => p.accountId === customerId),
    [allProjects, customerId],
  )
```

Und einen `useEffect`, der Projekte lädt, falls sie noch nicht geladen sind (analog zum bestehenden `useEffect` für Rechnungen/Angebote in derselben Datei):

```typescript
  useEffect(() => {
    if (workspaceId) loadProjects(workspaceId)
  }, [workspaceId, loadProjects])
```

(`workspaceId` ist in `FinanzPane.tsx` bereits vorhanden -- prüfe den tatsächlichen Variablennamen beim Lesen der Datei, falls er abweicht. `useProjectsStore` muss importiert werden: `import { useProjectsStore } from '@/store/projects.store'`.)

- [ ] **Step 4: Tests ausführen**

Run: `npx vitest run src/components/finance/InvoiceRow.test.tsx`
Expected: PASS (5 Tests).

Run: `npx vitest run 2>&1 | tail -20`
Expected: volle Suite grün -- insbesondere keine Regression in bestehenden `FinanzPane`-Tests, falls vorhanden (prüfe, ob `FinanzPane.test.tsx` existiert; falls ja, muss sie weiterhin grün sein, ggf. um die neuen Props/Selektoren angepasst).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck 2>&1 | grep -iE "invoice|finanzpane"`
Expected: keine Fehler.

- [ ] **Step 6: Commit**

```bash
git add src/components/finance/InvoiceRow.tsx src/components/finance/InvoiceRow.test.tsx src/components/customer/tabs/FinanzPane.tsx
git commit -m "refactor(finance): InvoiceRow -- extrahiert + Projekt-Zuordnen-Dropdown"
```

---

### Task 11: `InvoiceForm` -- `initialProjectId`-Prop

**Files:**
- Modify: `src/components/finance/InvoiceForm.tsx`

**Interfaces:**
- Produces: `InvoiceForm` akzeptiert einen neuen optionalen Prop `initialProjectId?: string`, vorausgefüllt beim Erstellen einer neuen Rechnung. Task 14 (`ProjectDetailRoute`) nutzt ihn.

**Wichtig:** Diese Datei ist eine reale, bereits produktiv genutzte Rechnungs-Erstellungs-/Bearbeitungs-Komponente (siehe `CustomerRoute.tsx`s bestehende Nutzung über `initialAccountId`). Ändere NUR die unten beschriebenen Stellen -- keine sonstigen Anpassungen an Bearbeitungs-/Validierungs-Logik, PDF-Vorschau o.ä.

- [ ] **Step 1: Prop ergänzen**

Im `Props`-Interface (aktuell Zeilen 19-24), nach `initialAccountId?: string` ergänzen:

```typescript
  initialProjectId?: string
```

Im Funktionskopf (aktuell Zeile 26) den neuen Prop destrukturieren:

```typescript
export function InvoiceForm({ initial, initialAccountId, initialProjectId, onClose, onSaved }: Props) {
```

- [ ] **Step 2: State + Payload erweitern**

Nach der bestehenden `accountId`-State-Zeile (aktuell Zeile 51: `const [accountId, setAccountId] = useState(initial?.invoice.accountId ?? initialAccountId ?? '')`) einfügen:

```typescript
  const [projectId] = useState(initial?.invoice.projectId ?? initialProjectId ?? undefined)
```

(Bewusst ohne Setter-Nutzung in der UI dieser Etappe -- die Zuordnung selbst passiert über das neue Dropdown in `InvoiceRow`, Task 10, nicht innerhalb dieses Formulars. `projectId` wird hier nur beim Erstellen/Bearbeiten mitgeschickt, damit eine aus dem Projekt-Tab heraus erstellte Rechnung sofort korrekt zugeordnet ist.)

In `handleSave`s `payload`-Objekt (aktuell Zeilen 151-161), nach `accountId,` ergänzen:

```typescript
        projectId,
```

- [ ] **Step 3: Typecheck + bestehende Tests**

Run: `npm run typecheck 2>&1 | grep -i invoiceform`
Expected: keine Fehler.

Run: `npx vitest run 2>&1 | tail -20`
Expected: volle Suite grün -- insbesondere keine Regression in `InvoiceForm.test.tsx`, falls vorhanden (prüfe zuerst, ob diese Datei existiert).

- [ ] **Step 4: Commit**

```bash
git add src/components/finance/InvoiceForm.tsx
git commit -m "feat(finance): InvoiceForm -- initialProjectId-Prop"
```

---

### Task 12: `ProjectInvoices` -- neue Komponente für den Projekt-Tab

**Files:**
- Create: `src/components/projects/ProjectInvoices.tsx`
- Test: `src/components/projects/ProjectInvoices.test.tsx`

**Interfaces:**
- Consumes: `InvoiceRow` (Task 10), `Invoice[]` (via Props, vom aufrufenden `ProjectDetailRoute` geladen).
- Produces: `ProjectInvoices({ project, invoices, payments, onAssignProject, onCreateInvoice }): JSX.Element`. Task 14 rendert diese Komponente im neuen Tab.

- [ ] **Step 1: Fehlschlagende Tests zuerst schreiben**

Neue Datei `src/components/projects/ProjectInvoices.test.tsx`:

```typescript
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ProjectInvoices } from './ProjectInvoices'
import type { Invoice } from '@/types/finance.types'
import type { Project } from '@/types/project.types'

afterEach(cleanup)

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1', workspaceId: 'ws1', accountId: 'a1', title: 'Relaunch', description: null,
    status: 'active', currentPhaseId: null, createdAt: '2026-01-01', updatedAt: '2026-01-01',
    completedAt: null, retainerMonthly: 0, retainerHours: 0, retainerMonths: null,
    moodboardItems: [],
    ...overrides,
  }
}

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv1', workspaceId: 'ws1', createdBy: 'u1', accountId: 'a1', projectId: 'p1',
    date: '2026-01-01', dueDate: '2026-01-15', status: 'open', taxMode: 'standard',
    subtotal: 100, taxAmount: 19, total: 119, bankInfo: '{}',
    isSuggestion: false, pendingSync: false,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function renderPane(overrides: Partial<Parameters<typeof ProjectInvoices>[0]> = {}) {
  return render(
    <ProjectInvoices
      project={project()} invoices={[]} payments={[]}
      onAssignProject={vi.fn()} onCreateInvoice={vi.fn()}
      {...overrides}
    />,
  )
}

describe('ProjectInvoices', () => {
  it('zeigt einen leeren Hinweis ohne Rechnungen', () => {
    renderPane()
    expect(screen.getByText('Keine Rechnungen')).toBeTruthy()
  })

  it('rendert eine Rechnungszeile pro Rechnung', () => {
    renderPane({ invoices: [invoice({ number: 'R-2026-001' })] })
    expect(screen.getByText('R-2026-001')).toBeTruthy()
  })

  it('berechnet die Summen-Kopfzeile korrekt (Bezahlt/Offen/Gestellt)', () => {
    renderPane({
      invoices: [
        invoice({ id: 'inv1', status: 'paid', total: 100 }),
        invoice({ id: 'inv2', status: 'open', total: 50 }),
        invoice({ id: 'inv3', status: 'draft', total: 30 }),
      ],
    })
    expect(screen.getByText('100,00 €')).toBeTruthy()
    expect(screen.getByText('50,00 €')).toBeTruthy()
    expect(screen.getByText('150,00 €')).toBeTruthy()
  })

  it('ruft onCreateInvoice beim Klick auf "Neue Rechnung" auf', () => {
    const onCreateInvoice = vi.fn()
    renderPane({ onCreateInvoice })
    fireEvent.click(screen.getByText('Neue Rechnung'))
    expect(onCreateInvoice).toHaveBeenCalled()
  })
})
```

Run: `npx vitest run src/components/projects/ProjectInvoices.test.tsx`
Expected: FAIL -- Modul existiert nicht.

- [ ] **Step 2: Komponente schreiben**

Neue Datei `src/components/projects/ProjectInvoices.tsx`:

```typescript
import { FileText, Plus } from 'lucide-react'
import { InvoiceRow } from '@/components/finance/InvoiceRow'
import type { Invoice, Payment } from '@/types/finance.types'
import type { Project } from '@/types/project.types'

function fmt(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}

export function ProjectInvoices({ project, invoices, payments, onAssignProject, onCreateInvoice }: {
  project: Project
  invoices: Invoice[]
  payments: Payment[]
  onAssignProject: (invoiceId: string, projectId: string | null) => void
  onCreateInvoice: () => void
}) {
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)
  const totalOpen = invoices.filter(i => i.status === 'open' || i.status === 'overdue').reduce((s, i) => s + i.total, 0)
  const totalBilled = invoices.filter(i => i.status !== 'draft').reduce((s, i) => s + i.total, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="pcard">
        <div className="pcard-h">
          <h3><FileText size={13} style={{ marginRight: 6 }} />Rechnungen · {project.title}</h3>
          <button className="pbtn" style={{ fontSize: 11.5 }} onClick={onCreateInvoice}>
            <Plus size={12} /> Neue Rechnung
          </button>
        </div>

        {invoices.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--fg-dim)', padding: '10px 0' }}>Keine Rechnungen</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                {['Nummer', 'Datum', 'Fällig', 'Betrag', 'Status', 'Projekt', ''].map(h => (
                  <th key={h} style={{ padding: '8px 14px', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-dim)', textAlign: h === 'Betrag' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <InvoiceRow
                  key={inv.id} inv={inv} payments={payments} pdfBusy={null}
                  projects={[project]} onPayment={() => {}} onDownload={() => {}}
                  onAssignProject={onAssignProject}
                />
              ))}
            </tbody>
          </table>
        )}

        <div className="pp-money" style={{ marginTop: 14 }}>
          <span>Bezahlt {fmt(totalPaid)}</span>
          <span>Offen {fmt(totalOpen)}</span>
          <b>Gestellt {fmt(totalBilled)}</b>
        </div>
      </div>
    </div>
  )
}
```

**Hinweis zu `onPayment`/`onDownload` als No-Ops:** Diese Etappe konzentriert sich auf die Projekt-Zuordnung, nicht auf eine erneute Implementierung der PDF-/Zahlungs-Erfassungs-Logik in dieser neuen Ansicht. Ein leeres `onPayment`/`onDownload` würde jedoch tote Buttons erzeugen -- das widerspricht dem Prinzip dieses Projekts, keine funktionslosen Buttons zu zeigen. Prüfe beim Implementieren, ob PDF-Download und Zahlungserfassung stattdessen aus `ProjectDetailRoute.tsx` (Task 14) heraus echt verdrahtet werden können (analog zu `FinanzPane.tsx`s `downloadInvoice`/`paymentInvoice`-State) -- falls ja, ergänze entsprechende Props hier UND in Task 14, statt No-Ops zu committen. Dokumentiere diese Entscheidung explizit im Report, falls du von den No-Ops abweichst.

- [ ] **Step 3: Test ausführen, Erfolg verifizieren**

Run: `npx vitest run src/components/projects/ProjectInvoices.test.tsx`
Expected: PASS (4 Tests, oder mehr falls Step 2s Hinweis zu echten `onPayment`/`onDownload`-Props geführt hat -- dann entsprechend mehr Testfälle).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: keine neuen Fehler (Datei wird noch nirgends importiert -- folgt in Task 14).

- [ ] **Step 5: Commit**

```bash
git add src/components/projects/ProjectInvoices.tsx src/components/projects/ProjectInvoices.test.tsx
git commit -m "feat(projects): ProjectInvoices -- Rechnungsliste + Summen fuer den Projekt-Tab"
```

---

### Task 13: `ui.store.ts` -- `ProjectTab` um `'rechnungen'` erweitern

**Files:**
- Modify: `src/store/ui.store.ts`

**Interfaces:**
- Produces: `ProjectTab = 'cockpit' | 'phasen' | 'moodboard' | 'rechnungen'`. Task 14 nutzt den neuen Tab-Wert.

- [ ] **Step 1: Typ erweitern**

`export type ProjectTab = 'cockpit' | 'phasen' | 'moodboard'` ändern zu:

```typescript
export type ProjectTab = 'cockpit' | 'phasen' | 'moodboard' | 'rechnungen'
```

Den Kommentar direkt darüber ("Rechnungen kommt erst als Tab dazu, wenn Etappe 6 tatsaechlich gebaut wird.") anpassen -- alle Tabs sind jetzt gebaut:

```typescript
/** Tabs im Projekt-Detail. */
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: keine neuen Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/store/ui.store.ts
git commit -m "feat(ui): ProjectTab -- Rechnungen-Tab ergaenzt"
```

---

### Task 14: `ProjectDetailRoute.tsx` -- Rechnungen-Tab verdrahten

**Files:**
- Modify: `src/routes/ProjectDetailRoute.tsx`

**Interfaces:**
- Consumes: `ProjectInvoices` (Task 12), `InvoiceForm` (Task 11), `FinanceGateway.getInvoicesByProject`/`setInvoiceProject` (Task 7), `useFinanceStore().setInvoiceProject`/`payments` (Task 9, bestehend).
- Produces: kompletter, funktionsfähiger Rechnungen-Tab.

- [ ] **Step 1: Imports + State ergänzen**

Nach `import { ProjectMoodboard } from '@/components/projects/ProjectMoodboard'` einfügen:

```typescript
import { ProjectInvoices } from '@/components/projects/ProjectInvoices'
import { InvoiceForm } from '@/components/finance/InvoiceForm'
import { FinanceGateway } from '@/data/finance.gateway'
import { useFinanceStore } from '@/store/finance.store'
import type { Invoice } from '@/types/finance.types'
```

Nach den bestehenden `useState`-Deklarationen im Komponentenkörper einfügen:

```typescript
  const [projectInvoices, setProjectInvoices] = useState<Invoice[]>([])
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
```

- [ ] **Step 2: Rechnungen laden**

Nach dem bestehenden `useEffect`, der Mitglieder lädt (`if (workspaceId && isShared) loadMembers(workspaceId)`), einen neuen `useEffect` einfügen:

```typescript
  useEffect(() => {
    if (!project) return
    FinanceGateway.getInvoicesByProject(project.id).then(setProjectInvoices)
  }, [project])
```

- [ ] **Step 3: Store-Selektoren ergänzen**

Nach `const uploadMoodboardImage = useProjectsStore(s => s.uploadMoodboardImage)` einfügen:

```typescript
  const setInvoiceProject = useFinanceStore(s => s.setInvoiceProject)
  const payments = useFinanceStore(s => s.payments)
```

- [ ] **Step 4: Tabs-Array erweitern**

`const tabs = [...]` erweitern:

```typescript
  const tabs = [
    { id: 'cockpit', label: 'Cockpit', icon: Target },
    { id: 'phasen', label: 'Phasen', icon: Milestone, count: pendingGateCount > 0 ? pendingGateCount : undefined },
    { id: 'moodboard', label: 'Moodboard', icon: ImageIcon },
    { id: 'rechnungen', label: 'Rechnungen', icon: FileText },
  ]
```

(`FileText` aus `lucide-react` importieren, in derselben Import-Zeile wie `Target, Milestone`.)

`<TabBar>`'s `onChange`-Cast erweitern:

```typescript
      <TabBar tabs={tabs} activeId={activeTab} onChange={id => setActiveTab(id as 'cockpit' | 'phasen' | 'moodboard' | 'rechnungen')} />
```

- [ ] **Step 5: Render-Block + Modal hinzufügen**

Nach dem `{activeTab === 'moodboard' && (...)}`-Block einfügen:

```typescript
        {activeTab === 'rechnungen' && (
          <ProjectInvoices
            project={project} invoices={projectInvoices} payments={payments}
            onAssignProject={async (invoiceId, projectId) => {
              await setInvoiceProject(invoiceId, projectId)
              const refreshed = await FinanceGateway.getInvoicesByProject(project.id)
              setProjectInvoices(refreshed)
            }}
            onCreateInvoice={() => setShowInvoiceForm(true)}
          />
        )}
```

Nach dem schließenden `</div>` des `paddingTop: 24`-Wrappers, vor dem Ende der Komponente einfügen:

```typescript
      {showInvoiceForm && (
        <InvoiceForm
          initialAccountId={project.accountId}
          initialProjectId={project.id}
          onClose={() => setShowInvoiceForm(false)}
          onSaved={async () => {
            setShowInvoiceForm(false)
            const refreshed = await FinanceGateway.getInvoicesByProject(project.id)
            setProjectInvoices(refreshed)
          }}
        />
      )}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: keine Fehler.

- [ ] **Step 7: Volle Test-Suite**

Run: `cd src-tauri && cargo test 2>&1 | tail -10`
Expected: Baseline 309 + 1 (Migration Task 1) + 5 (Task 3) = 315 bestanden, 0 fehlgeschlagen.

Run: `npx vitest run 2>&1 | tail -15`
Expected: Baseline 997 + 4 (Mapper) + 1 (Store) + 5 (InvoiceRow) + 4 (ProjectInvoices) = 1011 bestanden, 0 fehlgeschlagen -- exakte Zahl im Report festhalten.

- [ ] **Step 8: Manuell im Dev-Build prüfen**

Im laufenden `npm run tauri dev`: ein Projekt öffnen, Rechnungen-Tab. Prüfen:
- Leere Liste zeigt Hinweistext, Summen-Kopfzeile bei 0.
- "Neue Rechnung" öffnet das bestehende Rechnungs-Formular mit vorausgefülltem Kunden.
- Nach dem Speichern erscheint die neue Rechnung in der Liste dieses Projekts.
- Im Kunden-Detail (Finanzen-Tab) erscheint dieselbe Rechnung mit korrekt vorausgewähltem Projekt im Zuordnen-Dropdown.
- Zuordnen-Dropdown funktioniert in beide Richtungen (Projekt setzen, "Kein Projekt" wählen) -- Änderung spiegelt sich in beiden Ansichten nach Neuladen.
- PDF-Download/Mahnwesen (falls in Task 12 echt verdrahtet, nicht als No-Op) funktionieren wie gewohnt.

- [ ] **Step 9: Commit**

```bash
git add src/routes/ProjectDetailRoute.tsx
git commit -m "feat(projects): ProjectDetailRoute -- Rechnungen-Tab verdrahtet"
```

---

## Self-Review

**Spec-Abdeckung** (gegen `docs/superpowers/specs/2026-07-27-projekt-rechnungen-design.md` geprüft):
- `invoices.project_id` optional, additive Migration → Task 1, 2, 3. ✓
- Neuer Rechnungen-Tab, spiegelt `FinanzPane.tsx` → Task 12, 14. ✓
- "Neue Rechnung" mit vorausgefülltem Kunde + Projekt → Task 11 (`initialProjectId`), Task 14. ✓
- Nachträgliche Zuordnung bestehender Rechnungen, von beiden Seiten aus → Task 10 (Dropdown in `InvoiceRow`, genutzt von `FinanzPane` UND `ProjectInvoices`). ✓
- Kein Auto-Entwurf aus Mehrstunden, kein Retainer-Automatismus → in keinem Task enthalten. ✓
- Keine Änderung an bestehender Erstellung/PDF/Mahnwesen selbst → Task 11 ändert nur eine Zeile State + eine Payload-Zeile in `InvoiceForm`, alles andere unverändert. ✓
- Testing-Abschnitt der Spec (Rust-Unit-Tests, Mapper-Tests, Komponenten-Test) → Task 3, 6, 10, 12. ✓

**Platzhalter-Scan:** keine TBD/TODO gefunden. Ein bewusster Entscheidungspunkt ist explizit markiert (Task 12s Hinweis zu `onPayment`/`onDownload`-No-Ops vs. echter Verdrahtung) -- das ist keine Lücke, sondern eine für den Implementierer offen gelassene, aber klar gerahmte Design-Entscheidung mit Begründung.

**Typ-Konsistenz geprüft:**
- `Invoice.projectId?: string` (Task 5) ↔ `invoiceRowToInvoice`/`invoicePayloadToRow` (Task 6) ↔ `InvoiceRow`/`ProjectInvoices`/`InvoiceForm`s Nutzung (Task 10-12) -- konsistent `string | undefined` im Frontend, `Option<String>` in Rust, `string | null` an der Gateway/Command-Grenze (JSON-Serialisierung von `undefined` vs. `null` beachtet: Rust-Commands erwarten `Option<String>`, was `null` oder ein String akzeptiert -- TypeScript reicht `projectId ?? null` an den lokalen Pfad, `projectId ?? undefined` im Domänentyp).
- `getInvoicesByProject`/`setInvoiceProject`-Signaturen identisch durch Rust-Command (Task 4) → Service (Task 8) → Gateway (Task 7) → Store (Task 9) → Aufrufer in `InvoiceRow`/`ProjectDetailRoute` (Task 10, 14).
- `INVOICE_COLS`/`map_invoice`-Index-Ausrichtung (Task 3) explizit als Anhängen-am-Ende-Muster dokumentiert, um jede Verschiebung bestehender Indizes auszuschließen.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-27-projekt-rechnungen.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
