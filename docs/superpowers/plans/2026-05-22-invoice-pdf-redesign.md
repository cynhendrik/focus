# Invoice PDF Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Logo-Upload, Datum+Einheit pro Position und Modern-B-Layout-Feintuning für InvoicePDF + OfferPDF.

**Architecture:** DB-Migration v13 fügt `item_date` und `unit` zu `invoice_items`/`offer_items` hinzu. Rust-Structs und TypeScript-Typen werden erweitert. `PositionsEditor.tsx` bekommt neue Felder. `SettingsRoute.tsx` bekommt Logo-Upload. `InvoicePDF.tsx` und `OfferPDF.tsx` rendern Logo und neue Spalten.

**Tech Stack:** Rust/SQLite (rusqlite), React, TypeScript, @react-pdf/renderer, Tauri v2

---

## Dateien-Übersicht

| Datei | Änderung |
|---|---|
| `src-tauri/src/db/migrations.rs` | v13 Branch + CURRENT_VERSION |
| `src-tauri/src/db/invoice.rs` | InvoiceItem + UpsertInvoiceItemPayload structs, map_item, fetch_items, replace_items |
| `src-tauri/src/db/offer.rs` | OfferItem + UpsertOfferItemPayload structs, map_item, fetch_items, replace_items |
| `src/types/finance.types.ts` | itemDate?, unit? zu 4 Interfaces |
| `src/types/company.types.ts` | logoBase64? zu CompanyProfile |
| `src/components/finance/PositionsEditor.tsx` | invoiceDate prop, Datum + Einheit Inputs |
| `src/routes/SettingsRoute.tsx` | Logo-Upload Sektion |
| `src/components/finance/InvoicePDF.tsx` | InitialsBadge, Logo, Datum+Einheit-Spalten, Zahlungsziel, Dateiname |
| `src/components/finance/OfferPDF.tsx` | InitialsBadge, Logo, Datum+Einheit-Spalten |

---

## Task 1: DB-Migration v13

**Files:**
- Modify: `src-tauri/src/db/migrations.rs`

- [ ] **Schritt 1: Test schreiben** — füge folgenden Test am Ende des `#[cfg(test)]`-Blocks in `migrations.rs` ein (vor der letzten `}`):

```rust
#[test]
fn migration_v13_adds_item_date_and_unit() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
    schema::create_tables(&conn).unwrap();
    migrations::run(&conn).unwrap();
    // item_date und unit in invoice_items
    conn.execute(
        "INSERT INTO invoice_items (id, invoice_id, title, quantity, unit_price, tax_rate, total, sort_order, item_date, unit)
         VALUES ('i1','dummy','Test',1,10,0,10,0,'2026-05-22','Stk.')",
        [],
    ).unwrap();
    let (d, u): (Option<String>, Option<String>) = conn.query_row(
        "SELECT item_date, unit FROM invoice_items WHERE id='i1'",
        [], |r| Ok((r.get(0)?, r.get(1)?)),
    ).unwrap();
    assert_eq!(d.as_deref(), Some("2026-05-22"));
    assert_eq!(u.as_deref(), Some("Stk."));
    // offer_items ebenfalls
    conn.execute(
        "INSERT INTO offer_items (id, offer_id, title, quantity, unit_price, tax_rate, total, sort_order, item_date, unit)
         VALUES ('o1','dummy','Test',1,10,0,10,0,'2026-05-22','Std.')",
        [],
    ).unwrap();
    let (d2, u2): (Option<String>, Option<String>) = conn.query_row(
        "SELECT item_date, unit FROM offer_items WHERE id='o1'",
        [], |r| Ok((r.get(0)?, r.get(1)?)),
    ).unwrap();
    assert_eq!(d2.as_deref(), Some("2026-05-22"));
    assert_eq!(u2.as_deref(), Some("Std."));
}
```

- [ ] **Schritt 2: Test laufen lassen — muss FEHL schlagen**

```powershell
cd src-tauri
cargo test migration_v13 -- --nocapture
```

Erwartet: FAIL (column `item_date` unknown)

- [ ] **Schritt 3: Migration implementieren**

In `src-tauri/src/db/migrations.rs`:

Zeile 4 ändern:
```rust
const CURRENT_VERSION: u32 = 13;
```

Den Block `_ => Ok(()),` (Zeile 373) **ersetzen** durch:

```rust
        13 => {
            conn.execute_batch(
                "ALTER TABLE invoice_items ADD COLUMN item_date TEXT;
                 ALTER TABLE invoice_items ADD COLUMN unit TEXT;
                 ALTER TABLE offer_items ADD COLUMN item_date TEXT;
                 ALTER TABLE offer_items ADD COLUMN unit TEXT;"
            )?;
            Ok(())
        }
        _ => Ok(()),
```

- [ ] **Schritt 4: Alle Tests laufen lassen — müssen GRÜN sein**

```powershell
cargo test -p cynera -- --nocapture 2>&1 | tail -20
```

Erwartet: `test result: ok. N passed; 0 failed`

- [ ] **Schritt 5: Commit**

```powershell
cd ..
git add src-tauri/src/db/migrations.rs
git commit -m "feat(db): migration v13 — item_date + unit in invoice_items + offer_items"
```

---

## Task 2: Rust `invoice.rs` — Structs + SQL

**Files:**
- Modify: `src-tauri/src/db/invoice.rs`

- [ ] **Schritt 1: Test schreiben** — füge folgenden Test im `#[cfg(test)]`-Block (vor der letzten `}`) ein:

```rust
#[test]
fn item_date_and_unit_round_trip() {
    let conn = setup();
    let payload = UpsertInvoicePayload {
        id: None,
        workspace_id: "ws-1".into(),
        created_by: "u-1".into(),
        account_id: "acc-1".into(),
        deal_id: None,
        date: "2026-05-22".into(),
        due_date: "2026-05-29".into(),
        status: None,
        tax_mode: Some("kleinunternehmer".into()),
        subtotal: 120.0,
        tax_amount: 0.0,
        total: 120.0,
        bank_info: None,
        notes: None,
        is_suggestion: None,
        suggested_by: None,
        items: vec![UpsertInvoiceItemPayload {
            id: None,
            title: "Visitenkarten".into(),
            description: None,
            quantity: 1.0,
            unit_price: 120.0,
            tax_rate: 0.0,
            total: 120.0,
            sort_order: 0,
            item_date: Some("2026-05-21".into()),
            unit: Some("Stk.".into()),
        }],
    };
    let result = create(&conn, payload).unwrap();
    assert_eq!(result.items[0].item_date.as_deref(), Some("2026-05-21"));
    assert_eq!(result.items[0].unit.as_deref(), Some("Stk."));
    // round-trip via get_by_id
    let fetched = get_by_id(&conn, &result.invoice.id).unwrap();
    assert_eq!(fetched.items[0].item_date.as_deref(), Some("2026-05-21"));
    assert_eq!(fetched.items[0].unit.as_deref(), Some("Stk."));
}
```

- [ ] **Schritt 2: Test laufen lassen — muss FEHL schlagen**

```powershell
cd src-tauri
cargo test item_date_and_unit_round_trip -- --nocapture
```

Erwartet: FAIL (field `item_date` not found in struct)

- [ ] **Schritt 3: `InvoiceItem` struct erweitern**

Zeilen 33–44 in `src-tauri/src/db/invoice.rs` — **nach** `sort_order` die zwei neuen Felder einfügen:

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceItem {
    pub id: String,
    pub invoice_id: String,
    pub title: String,
    pub description: Option<String>,
    pub quantity: f64,
    pub unit_price: f64,
    pub tax_rate: f64,
    pub total: f64,
    pub sort_order: i64,
    pub item_date: Option<String>,
    pub unit: Option<String>,
}
```

- [ ] **Schritt 4: `UpsertInvoiceItemPayload` struct erweitern**

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertInvoiceItemPayload {
    pub id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub quantity: f64,
    pub unit_price: f64,
    pub tax_rate: f64,
    pub total: f64,
    pub sort_order: i64,
    pub item_date: Option<String>,
    pub unit: Option<String>,
}
```

- [ ] **Schritt 5: `map_item()` erweitern**

Die Funktion `map_item` (aktuell Zeile 136–148) anpassen:

```rust
fn map_item(r: &rusqlite::Row<'_>) -> rusqlite::Result<InvoiceItem> {
    Ok(InvoiceItem {
        id:          r.get(0)?,
        invoice_id:  r.get(1)?,
        title:       r.get(2)?,
        description: r.get(3)?,
        quantity:    r.get(4)?,
        unit_price:  r.get(5)?,
        tax_rate:    r.get(6)?,
        total:       r.get(7)?,
        sort_order:  r.get(8)?,
        item_date:   r.get(9)?,
        unit:        r.get(10)?,
    })
}
```

- [ ] **Schritt 6: `fetch_items()` SELECT erweitern**

```rust
fn fetch_items(conn: &Connection, invoice_id: &str) -> Result<Vec<InvoiceItem>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, invoice_id, title, description, quantity, unit_price, tax_rate, total, sort_order, item_date, unit
         FROM invoice_items WHERE invoice_id = ?1 ORDER BY sort_order"
    )?;
    let rows = stmt.query_map([invoice_id], map_item)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}
```

- [ ] **Schritt 7: `replace_items()` INSERT erweitern**

```rust
fn replace_items(conn: &Connection, invoice_id: &str, items: &[UpsertInvoiceItemPayload]) -> Result<(), AppError> {
    conn.execute("DELETE FROM invoice_items WHERE invoice_id = ?1", [invoice_id])?;
    for item in items {
        let id = item.id.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        conn.execute(
            "INSERT INTO invoice_items (id, invoice_id, title, description, quantity, unit_price, tax_rate, total, sort_order, item_date, unit)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            rusqlite::params![
                id, invoice_id, item.title, item.description,
                item.quantity, item.unit_price, item.tax_rate, item.total, item.sort_order,
                item.item_date, item.unit,
            ],
        )?;
    }
    Ok(())
}
```

- [ ] **Schritt 8: Alle Tests — müssen GRÜN sein**

```powershell
cargo test -p cynera -- --nocapture 2>&1 | tail -20
```

Erwartet: `test result: ok. N passed; 0 failed`

- [ ] **Schritt 9: Commit**

```powershell
cd ..
git add src-tauri/src/db/invoice.rs
git commit -m "feat(invoice): item_date + unit in InvoiceItem struct + SQL"
```

---

## Task 3: Rust `offer.rs` — Structs + SQL

**Files:**
- Modify: `src-tauri/src/db/offer.rs`

- [ ] **Schritt 1: Test schreiben** — füge am Ende des `#[cfg(test)]`-Blocks in `offer.rs` ein:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{schema, migrations};

    fn setup() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        schema::create_tables(&conn).unwrap();
        migrations::run(&conn).unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
             VALUES ('acc-1','ws-1','u-1','Test GmbH',?1,?1)",
            [&now],
        ).unwrap();
        conn
    }

    #[test]
    fn offer_item_date_and_unit_round_trip() {
        let conn = setup();
        let payload = UpsertOfferPayload {
            id: None,
            workspace_id: "ws-1".into(),
            created_by: "u-1".into(),
            account_id: "acc-1".into(),
            title: "Angebot Test".into(),
            status: None,
            valid_until: "2026-06-22".into(),
            tax_mode: Some("kleinunternehmer".into()),
            subtotal: 200.0,
            tax_amount: 0.0,
            total: 200.0,
            notes: None,
            items: vec![UpsertOfferItemPayload {
                id: None,
                title: "Beratung".into(),
                description: None,
                quantity: 2.0,
                unit_price: 100.0,
                tax_rate: 0.0,
                total: 200.0,
                sort_order: 0,
                item_date: Some("2026-05-22".into()),
                unit: Some("Std.".into()),
            }],
        };
        let result = create(&conn, payload).unwrap();
        assert_eq!(result.items[0].item_date.as_deref(), Some("2026-05-22"));
        assert_eq!(result.items[0].unit.as_deref(), Some("Std."));
    }
}
```

> Hinweis: Falls `offer.rs` bereits einen `#[cfg(test)]`-Block hat, füge nur den einzelnen Test-Fn ein.

- [ ] **Schritt 2: Test laufen lassen — muss FEHL schlagen**

```powershell
cd src-tauri
cargo test offer_item_date -- --nocapture
```

Erwartet: FAIL (field `item_date` not found)

- [ ] **Schritt 3: `OfferItem` struct erweitern**

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OfferItem {
    pub id: String,
    pub offer_id: String,
    pub title: String,
    pub description: Option<String>,
    pub quantity: f64,
    pub unit_price: f64,
    pub tax_rate: f64,
    pub total: f64,
    pub sort_order: i64,
    pub item_date: Option<String>,
    pub unit: Option<String>,
}
```

- [ ] **Schritt 4: `UpsertOfferItemPayload` struct erweitern**

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertOfferItemPayload {
    pub id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub quantity: f64,
    pub unit_price: f64,
    pub tax_rate: f64,
    pub total: f64,
    pub sort_order: i64,
    pub item_date: Option<String>,
    pub unit: Option<String>,
}
```

- [ ] **Schritt 5: `map_item()` erweitern**

```rust
fn map_item(r: &rusqlite::Row<'_>) -> rusqlite::Result<OfferItem> {
    Ok(OfferItem {
        id:          r.get(0)?,
        offer_id:    r.get(1)?,
        title:       r.get(2)?,
        description: r.get(3)?,
        quantity:    r.get(4)?,
        unit_price:  r.get(5)?,
        tax_rate:    r.get(6)?,
        total:       r.get(7)?,
        sort_order:  r.get(8)?,
        item_date:   r.get(9)?,
        unit:        r.get(10)?,
    })
}
```

- [ ] **Schritt 6: `fetch_items()` SELECT erweitern**

```rust
fn fetch_items(conn: &Connection, offer_id: &str) -> Result<Vec<OfferItem>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, offer_id, title, description, quantity, unit_price, tax_rate, total, sort_order, item_date, unit
         FROM offer_items WHERE offer_id = ?1 ORDER BY sort_order"
    )?;
    let rows = stmt.query_map([offer_id], map_item)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}
```

- [ ] **Schritt 7: `replace_items()` INSERT erweitern**

```rust
fn replace_items(conn: &Connection, offer_id: &str, items: &[UpsertOfferItemPayload]) -> Result<(), AppError> {
    conn.execute("DELETE FROM offer_items WHERE offer_id = ?1", [offer_id])?;
    for item in items {
        let id = item.id.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        conn.execute(
            "INSERT INTO offer_items (id, offer_id, title, description, quantity, unit_price, tax_rate, total, sort_order, item_date, unit)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            rusqlite::params![
                id, offer_id, item.title, item.description,
                item.quantity, item.unit_price, item.tax_rate, item.total, item.sort_order,
                item.item_date, item.unit,
            ],
        )?;
    }
    Ok(())
}
```

- [ ] **Schritt 8: Alle Tests**

```powershell
cargo test -p cynera -- --nocapture 2>&1 | tail -20
```

Erwartet: `test result: ok. N passed; 0 failed`

- [ ] **Schritt 9: Commit**

```powershell
cd ..
git add src-tauri/src/db/offer.rs
git commit -m "feat(offer): item_date + unit in OfferItem struct + SQL"
```

---

## Task 4: TypeScript-Typen

**Files:**
- Modify: `src/types/finance.types.ts`
- Modify: `src/types/company.types.ts`

- [ ] **Schritt 1: `finance.types.ts` — `InvoiceItem` erweitern**

Nach `sortOrder: number` in `InvoiceItem` einfügen:
```ts
  itemDate?: string
  unit?: string
```

- [ ] **Schritt 2: `finance.types.ts` — `UpsertInvoiceItemPayload` erweitern**

Nach `sortOrder: number` in `UpsertInvoiceItemPayload` einfügen:
```ts
  itemDate?: string
  unit?: string
```

- [ ] **Schritt 3: `finance.types.ts` — `OfferItem` erweitern**

Nach `sortOrder: number` in `OfferItem` einfügen:
```ts
  itemDate?: string
  unit?: string
```

- [ ] **Schritt 4: `finance.types.ts` — `UpsertOfferItemPayload` erweitern**

Nach `sortOrder: number` in `UpsertOfferItemPayload` einfügen:
```ts
  itemDate?: string
  unit?: string
```

- [ ] **Schritt 5: `company.types.ts` — `CompanyProfile` erweitern**

Nach `leistungszeitpunkt?: 'rechnungsdatum' | 'monatsende'` einfügen:
```ts
  logoBase64?: string
```

- [ ] **Schritt 6: TypeScript-Compilation prüfen**

```powershell
cd C:\Users\hendr\Documents\DEV\cyneradev
npx tsc --noEmit
```

Erwartet: keine Fehler (oder nur bekannte, pre-existing Fehler)

- [ ] **Schritt 7: Commit**

```powershell
git add src/types/finance.types.ts src/types/company.types.ts
git commit -m "feat(types): itemDate + unit in item payloads, logoBase64 in CompanyProfile"
```

---

## Task 5: `PositionsEditor.tsx` — Datum + Einheit

**Files:**
- Modify: `src/components/finance/PositionsEditor.tsx`

- [ ] **Schritt 1: `invoiceDate` Prop hinzufügen**

Interface `Props` ersetzen:
```ts
interface Props {
  items: UpsertInvoiceItemPayload[]
  onChange: (items: UpsertInvoiceItemPayload[]) => void
  taxMode: string
  invoiceDate?: string   // ISO "2026-05-22" — Vorauswahl für neue Positionen
}
```

Komponenten-Signatur:
```ts
export function PositionsEditor({ items, onChange, taxMode, invoiceDate }: Props) {
```

- [ ] **Schritt 2: `addRow()` erweitern**

```ts
const addRow = () => {
  onChange([
    ...items,
    {
      title: '', description: undefined,
      quantity: 1, unitPrice: 0,
      taxRate: noTax ? 0 : 19, total: 0,
      sortOrder: items.length,
      itemDate: invoiceDate,
      unit: undefined,
    },
  ])
}
```

- [ ] **Schritt 3: Grid-Header erweitern**

Den bestehenden Header-`div` (die 6-Spalten-Grid-Zeile) ersetzen durch:
```tsx
<div style={{
  display: 'grid',
  gridTemplateColumns: '1fr 64px 80px 64px 80px 28px',
  gap: 4,
  padding: '0 0 4px',
  fontSize: 11,
  color: 'var(--fg-dim)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  fontFamily: 'var(--font-mono)',
}}>
  <span>Bezeichnung · Datum · Einheit</span>
  <span style={{ textAlign: 'right' }}>Menge</span>
  <span style={{ textAlign: 'right' }}>Preis</span>
  <span style={{ textAlign: 'right' }}>MwSt%</span>
  <span style={{ textAlign: 'right' }}>Gesamt</span>
  <span />
</div>
```

- [ ] **Schritt 4: Positions-Rows erweitern**

Den `.map((item, idx) => ...)` Block ersetzen:
```tsx
{items.map((item, idx) => (
  <div key={idx} style={{
    display: 'grid',
    gridTemplateColumns: '1fr 64px 80px 64px 80px 28px',
    gap: 4,
    alignItems: 'start',
  }}>
    {/* Spalte 1: Titel + Datum + Einheit gestapelt */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <input
        value={item.title}
        onChange={e => update(idx, { title: e.target.value })}
        placeholder="Bezeichnung"
        style={inputStyle}
      />
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          type="date"
          value={item.itemDate ?? ''}
          onChange={e => update(idx, { itemDate: e.target.value || undefined })}
          style={{ ...inputStyle, flex: 1, fontSize: 11, padding: '3px 6px' }}
        />
        <input
          list="cynera-units"
          value={item.unit ?? ''}
          onChange={e => update(idx, { unit: e.target.value || undefined })}
          placeholder="Einheit"
          style={{ ...inputStyle, width: 80, fontSize: 11, padding: '3px 6px' }}
        />
        <datalist id="cynera-units">
          <option value="Stk." />
          <option value="Std." />
          <option value="Tag" />
          <option value="Monat" />
          <option value="Pauschal" />
        </datalist>
      </div>
    </div>
    {/* Spalten 2–6: unverändert */}
    <input
      type="number"
      value={item.quantity}
      min={0}
      step={0.5}
      onChange={e => update(idx, { quantity: parseFloat(e.target.value) || 0 })}
      style={{ ...inputStyle, textAlign: 'right' }}
    />
    <input
      type="number"
      value={item.unitPrice}
      min={0}
      step={0.01}
      onChange={e => update(idx, { unitPrice: parseFloat(e.target.value) || 0 })}
      style={{ ...inputStyle, textAlign: 'right' }}
    />
    <input
      type="number"
      value={noTax ? 0 : item.taxRate}
      min={0}
      max={100}
      disabled={noTax}
      onChange={e => update(idx, { taxRate: parseFloat(e.target.value) || 0 })}
      style={{ ...inputStyle, textAlign: 'right', opacity: noTax ? 0.4 : 1 }}
    />
    <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13, paddingTop: 6 }}>
      {item.total.toFixed(2)} €
    </span>
    <button onClick={() => removeRow(idx)} style={{ ...iconBtnStyle, paddingTop: 6 }} title="Entfernen">
      <Trash2 size={13} />
    </button>
  </div>
))}
```

- [ ] **Schritt 5: `InvoiceForm.tsx` und `OfferForm.tsx` — `invoiceDate` Prop weitergeben**

Öffne `src/components/finance/InvoiceForm.tsx`. Finde alle `<PositionsEditor`-Aufrufe und ergänze `invoiceDate={form.date}` (wobei `form.date` das aktuelle Rechnungsdatum im Form-State ist).

Öffne `src/components/finance/OfferForm.tsx`. Mache dasselbe mit dem gültigen Datum-Feld des Angebots.

> Hinweis: Wenn `invoiceDate` nicht im lokalen State vorhanden ist, prüfe wie das Datum im Form gespeichert wird und leite es entsprechend weiter.

- [ ] **Schritt 6: TypeScript-Compilation prüfen**

```powershell
npx tsc --noEmit
```

Erwartet: keine neuen Fehler

- [ ] **Schritt 7: Commit**

```powershell
git add src/components/finance/PositionsEditor.tsx src/components/finance/InvoiceForm.tsx src/components/finance/OfferForm.tsx
git commit -m "feat(ui): Datum + Einheit pro Position in PositionsEditor"
```

---

## Task 6: Logo-Upload in `SettingsRoute.tsx`

**Files:**
- Modify: `src/routes/SettingsRoute.tsx`

- [ ] **Schritt 1: `useRef` importieren**

Zeile 1 erweitern:
```ts
import { useEffect, useRef, useState } from 'react'
```

- [ ] **Schritt 2: File-Input-Ref und Logo-Handler in der Komponente**

Direkt nach `const [saved, setSaved] = useState(false)` einfügen:
```ts
const logoInputRef = useRef<HTMLInputElement>(null)

const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file) return
  if (file.size > 300 * 1024) {
    alert('Logo ist zu groß (max. 300 KB). Bitte ein kleineres Bild wählen.')
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    setForm(p => ({ ...p, logoBase64: reader.result as string }))
  }
  reader.readAsDataURL(file)
}

const handleLogoRemove = () => {
  setForm(p => ({ ...p, logoBase64: undefined }))
  if (logoInputRef.current) logoInputRef.current.value = ''
}
```

- [ ] **Schritt 3: Logo-Sektion im JSX einfügen**

Direkt **vor** dem `{/* Save button */}`-Block einfügen:
```tsx
{/* ── Firmenlogo ─────────────────────────────────────────────────────── */}
<div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
  <SectionHeader title="Firmenlogo" hint="Erscheint oben rechts auf Rechnungen und Angeboten (PNG/JPG/SVG, max. 300 KB)" />
  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
    {/* Vorschau */}
    <div style={{
      width: 48, height: 48, borderRadius: 8,
      border: '1px solid var(--border)',
      background: 'var(--surface-2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', flexShrink: 0,
    }}>
      {form.logoBase64
        ? <img src={form.logoBase64} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg-dim)' }}>
            {(form.name ?? 'U').slice(0, 1).toUpperCase()}
          </span>
      }
    </div>
    {/* Buttons */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button
        className="btn-ghost"
        onClick={() => logoInputRef.current?.click()}
        style={{ fontSize: 12, padding: '5px 12px' }}
      >
        Logo hochladen
      </button>
      {form.logoBase64 && (
        <button
          onClick={handleLogoRemove}
          style={{ fontSize: 11, color: 'var(--fg-dim)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
        >
          Entfernen
        </button>
      )}
    </div>
  </div>
  <input
    ref={logoInputRef}
    type="file"
    accept="image/png,image/jpeg,image/svg+xml"
    onChange={handleLogoUpload}
    style={{ display: 'none' }}
  />
</div>
```

- [ ] **Schritt 4: TypeScript-Compilation prüfen**

```powershell
npx tsc --noEmit
```

Erwartet: keine neuen Fehler

- [ ] **Schritt 5: Commit**

```powershell
git add src/routes/SettingsRoute.tsx
git commit -m "feat(settings): Logo-Upload in Firmen-Einstellungen"
```

---

## Task 7: `InvoicePDF.tsx` — Logo, neue Spalten, Layout, Dateiname

**Files:**
- Modify: `src/components/finance/InvoicePDF.tsx`

- [ ] **Schritt 1: `Image` zu den Imports hinzufügen**

Zeile 2 ersetzen:
```ts
import {
  Document, Page, Text, View, StyleSheet, pdf, Image,
} from '@react-pdf/renderer'
```

- [ ] **Schritt 2: `InitialsBadge`-Komponente einfügen**

Direkt nach der `fmt`-Funktion (nach Zeile 22) einfügen:
```tsx
function InitialsBadge({ name }: { name?: string }) {
  const initials = (name ?? 'U')
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 16, fontFamily: 'Helvetica-Bold' }}>{initials}</Text>
    </View>
  )
}
```

- [ ] **Schritt 3: Stylesheet erweitern**

Im `StyleSheet.create({...})` (Beginn ab Zeile 26) die bestehenden Styles erhalten und folgende **ergänzen bzw. überschreiben**:

```ts
// Trennlinie stärker
rule:        { height: 1.5, backgroundColor: '#e0e0e0', marginBottom: 14 },
// Neue Tabellenspalten
colDesc:     { flex: 3 },
colDate:     { width: 58, textAlign: 'right' },
colQty:      { width: 38, textAlign: 'right' },
colUnit:     { width: 46, textAlign: 'right' },
colPrice:    { width: 60, textAlign: 'right' },
colTax:      { width: 38, textAlign: 'right' },
colTotal:    { width: 60, textAlign: 'right' },
```

> Hinweis: Die alten `colDesc` und `colNum` können bleiben oder entfernt werden — sie werden in den nächsten Schritten nicht mehr verwendet.

- [ ] **Schritt 4: `daysBetween`-Hilfsfunktion einfügen**

Direkt nach `fmtDate` in `InvoicePDFDoc` einfügen:
```ts
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
```

- [ ] **Schritt 5: Logo im Header rendern**

Den bestehenden Header-`<View style={s.header}>` Block ersetzen:
```tsx
<View style={s.header}>
  <View>
    <Text style={s.company}>{profile.name ?? 'Mein Unternehmen'}</Text>
    {profile.address && <Text style={s.companyMeta}>{profile.address}</Text>}
    {profile.email   && <Text style={s.companyMeta}>{profile.email}{profile.phone ? ` · ${profile.phone}` : ''}</Text>}
    {profile.website && <Text style={s.companyMeta}>{profile.website}</Text>}
    {(profile as { steuernummer?: string }).steuernummer && (
      <Text style={s.companyMeta}>StNr.: {(profile as { steuernummer?: string }).steuernummer}</Text>
    )}
  </View>
  <View style={{ alignItems: 'flex-end', gap: 6 }}>
    {profile.logoBase64
      ? <Image src={profile.logoBase64} style={{ width: 48, height: 48, objectFit: 'contain' }} />
      : <InitialsBadge name={profile.name} />
    }
    <Text style={s.docTitle}>RECHNUNG</Text>
    <Text style={s.docNumber}>{invoice.number ?? 'Entwurf'}</Text>
  </View>
</View>
```

- [ ] **Schritt 6: Zahlungsziel im Metablock ergänzen**

Das `.map(m => ...)` Array im `<View style={s.twoCol}>` Block (aktuell 4 Einträge: Rechnungsdatum, Leistungsdatum, Fällig am, Rechnungsnr.) **erweitern**:
```tsx
{ label: 'Zahlungsziel',    value: `${daysBetween(invoice.date, invoice.dueDate)} Tage` },
{ label: 'Rechnungsdatum',  value: fmtDate(invoice.date) },
{ label: 'Leistungsdatum',  value: fmtDate(leistungsdatum) },
{ label: 'Fällig am',       value: fmtDate(invoice.dueDate) },
{ label: 'Rechnungsnr.',    value: invoice.number ?? '—' },
```

- [ ] **Schritt 7: Tabellen-Header ersetzen**

Den `<View style={s.tableHeader}>` Block ersetzen:
```tsx
<View style={s.tableHeader}>
  <Text style={s.colDesc}>Bezeichnung</Text>
  <Text style={s.colDate}>Datum</Text>
  <Text style={s.colQty}>Menge</Text>
  <Text style={s.colUnit}>Einheit</Text>
  <Text style={s.colPrice}>Einzelpreis</Text>
  {!noTax && <Text style={s.colTax}>MwSt</Text>}
  <Text style={s.colTotal}>Betrag</Text>
</View>
```

- [ ] **Schritt 8: Tabellen-Rows ersetzen**

Den `{items.map((item, i) => ...)}` Block ersetzen:
```tsx
{items.map((item, i) => (
  <View key={i} style={s.row}>
    <View style={s.colDesc}>
      <Text>{item.title}</Text>
      {item.description && (
        <Text style={{ fontSize: 8, color: '#888', marginTop: 1 }}>{item.description}</Text>
      )}
    </View>
    <Text style={s.colDate}>{fmtDate(item.itemDate ?? invoice.date)}</Text>
    <Text style={s.colQty}>{item.quantity}</Text>
    <Text style={s.colUnit}>{item.unit ?? ''}</Text>
    <Text style={s.colPrice}>{item.unitPrice.toFixed(2)} €</Text>
    {!noTax && <Text style={s.colTax}>{item.taxRate}%</Text>}
    <Text style={s.colTotal}>{item.total.toFixed(2)} €</Text>
  </View>
))}
```

- [ ] **Schritt 9: Download-Dateiname anpassen**

In `downloadInvoicePDF` (aktuell Zeile 238):
```ts
const fmtAmt = (n: number) =>
  new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' EUR'
const safeClient = account.name.replace(/[/\\:*?"<>|]/g, '_').slice(0, 40)
const filename = `RECHNUNG ${data.invoice.number ?? 'Entwurf'} - ${safeClient} - ${fmtAmt(data.invoice.total)}.pdf`
```

- [ ] **Schritt 10: TypeScript-Compilation prüfen**

```powershell
npx tsc --noEmit
```

Erwartet: keine neuen Fehler

- [ ] **Schritt 11: Commit**

```powershell
git add src/components/finance/InvoicePDF.tsx
git commit -m "feat(pdf): Logo, Datum+Einheit-Spalten, Zahlungsziel, Dateiname in InvoicePDF"
```

---

## Task 8: `OfferPDF.tsx` — Logo + neue Spalten

**Files:**
- Modify: `src/components/finance/OfferPDF.tsx`

- [ ] **Schritt 1: `Image` importieren**

```ts
import { Document, Page, Text, View, StyleSheet, pdf, Image } from '@react-pdf/renderer'
```

- [ ] **Schritt 2: `InitialsBadge` einfügen**

Direkt nach der `fmt`-Funktion:
```tsx
function InitialsBadge({ name }: { name?: string }) {
  const initials = (name ?? 'U')
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 15, fontFamily: 'Helvetica-Bold' }}>{initials}</Text>
    </View>
  )
}
```

- [ ] **Schritt 3: Stylesheet-Spalten ergänzen**

Im `StyleSheet.create({...})` hinzufügen:
```ts
colDate:  { width: 58, textAlign: 'right' },
colQty:   { width: 38, textAlign: 'right' },
colUnit:  { width: 46, textAlign: 'right' },
colPrice: { width: 60, textAlign: 'right' },
colTax:   { width: 38, textAlign: 'right' },
colTotal: { width: 60, textAlign: 'right' },
```

- [ ] **Schritt 4: Logo im Header**

Den Header-Block in `OfferPDFDoc` (den `<View style={s.header}>`) ersetzen:
```tsx
<View style={s.header}>
  <View>
    <Text style={s.company}>{profile.name ?? 'Mein Unternehmen'}</Text>
    <Text style={s.companyMeta}>{profile.address ?? ''}</Text>
    <Text style={s.companyMeta}>{profile.email ?? ''}{profile.phone ? ` · ${profile.phone}` : ''}</Text>
    {profile.taxId && <Text style={s.companyMeta}>USt-IdNr.: {profile.taxId}</Text>}
  </View>
  <View style={{ alignItems: 'flex-end', gap: 6 }}>
    {profile.logoBase64
      ? <Image src={profile.logoBase64} style={{ width: 44, height: 44, objectFit: 'contain' }} />
      : <InitialsBadge name={profile.name} />
    }
    <Text style={s.docTitle}>ANGEBOT</Text>
    <Text style={s.docNumber}>{offer.number ?? '—'}</Text>
  </View>
</View>
```

- [ ] **Schritt 5: `fmtDate` Helper einfügen**

Direkt nach `const noTax = ...` in `OfferPDFDoc`:
```ts
const fmtDate = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}` }
```

- [ ] **Schritt 6: Tabellen-Header ersetzen**

```tsx
<View style={s.tableHeader}>
  <Text style={s.colTitle}>Bezeichnung</Text>
  <Text style={s.colDate}>Datum</Text>
  <Text style={s.colQty}>Menge</Text>
  <Text style={s.colUnit}>Einheit</Text>
  <Text style={s.colPrice}>Einzel €</Text>
  {!noTax && <Text style={s.colTax}>MwSt%</Text>}
  <Text style={s.colTotal}>Gesamt €</Text>
</View>
```

- [ ] **Schritt 7: Tabellen-Rows ersetzen**

```tsx
{items.map((item, i) => (
  <View key={i} style={s.row}>
    <Text style={s.colTitle}>{item.title}</Text>
    <Text style={s.colDate}>{fmtDate(item.itemDate ?? offer.validUntil)}</Text>
    <Text style={s.colQty}>{item.quantity}</Text>
    <Text style={s.colUnit}>{item.unit ?? ''}</Text>
    <Text style={s.colPrice}>{item.unitPrice.toFixed(2)}</Text>
    {!noTax && <Text style={s.colTax}>{item.taxRate}%</Text>}
    <Text style={s.colTotal}>{item.total.toFixed(2)}</Text>
  </View>
))}
```

- [ ] **Schritt 8: TypeScript-Compilation prüfen**

```powershell
npx tsc --noEmit
```

Erwartet: keine neuen Fehler

- [ ] **Schritt 9: Commit**

```powershell
git add src/components/finance/OfferPDF.tsx
git commit -m "feat(pdf): Logo + Datum+Einheit-Spalten in OfferPDF"
```

---

## Abschluss-Verifikation

- [ ] App starten: `npm run tauri dev`
- [ ] In Einstellungen → Logo hochladen → Speichern → App neu öffnen → Logo noch vorhanden ✓
- [ ] Neue Rechnung erstellen → Position mit Datum und Einheit füllen → Speichern ✓
- [ ] PDF herunterladen → Layout prüfen: Logo oben rechts, Datum+Einheit-Spalten, Zahlungsziel im Metablock, korrekter Dateiname ✓
- [ ] Angebot erstellen → PDF herunterladen → Logo + Spalten prüfen ✓
- [ ] Bestehende Rechnungen ohne item_date/unit → PDF öffnet ohne Fehler (Fallback auf invoice.date / leere Einheit) ✓
