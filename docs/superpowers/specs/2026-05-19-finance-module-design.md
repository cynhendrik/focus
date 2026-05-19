# Finance Module — Design Spec
**Date:** 2026-05-19  
**Branch:** feature/v2-redesign  
**Status:** Approved

---

## 1. Scope

Vollständiges Finanz- und Rechnungssystem für Cynera Focus:
- Rechnungen (erstellen, freigeben, PDF)
- Angebote (erstellen, in Rechnung umwandeln)
- Invoice Suggestions (automatisch aus gewonnenen Deals)
- KPI-Übersicht (Umsatz, offene/überfällige Rechnungen, Top-Kunden)
- Admin-Rollenlogik
- CRM-Integration (Kunden-Detailseite, Dashboard)

**Nicht in Scope:** E-Mail-Versand von Rechnungen, Zahlungsempfang-Tracking via API, DATEV-Export.

---

## 2. Architektur

### 2.1 Neue Dateien

```
src-tauri/src/
  db/
    invoice.rs       — CRUD invoices + invoice_items + invoice_sequences
    offer.rs         — CRUD offers + offer_items + offer_sequences
  commands/
    invoice.rs       — Tauri-Commands für Invoice
    offer.rs         — Tauri-Commands für Offer

src/
  types/finance.types.ts
  services/finance.service.ts
  store/finance.store.ts
  routes/FinanceRoute.tsx          — ersetzt InvoicesRoute
  components/finance/
    InvoiceForm.tsx                — Slide-over Panel
    OfferForm.tsx                  — Slide-over Panel
    InvoicePDF.tsx                 — @react-pdf/renderer Template
    OfferPDF.tsx                   — @react-pdf/renderer Template
    FinanceKPIs.tsx                — KPI-Tab
    InvoiceSuggestions.tsx         — Vorschläge-Modal
    PositionsEditor.tsx            — Wiederverwendbar für Invoice + Offer
```

### 2.2 Modifizierte bestehende Dateien

| Datei | Änderung |
|-------|----------|
| `src-tauri/src/db/schema.rs` | 5 neue Tabellen hinzufügen |
| `src-tauri/src/db/migrations.rs` | Migration v12 |
| `src-tauri/src/commands/mod.rs` | invoice + offer Module einbinden |
| `src-tauri/src/commands/deal.rs` | Suggestion bei `stage = "won"` anlegen |
| `src-tauri/src-tauri/src/lib.rs` | Neue Commands registrieren |
| `src/components/layout/NavSidebar.tsx` | isAdmin-Gate für Finanzen |
| `src/routes/CustomerRoute.tsx` | Finance-Tab hinzufügen |
| `src/routes/DashboardRoute.tsx` | Finance-KPIs einbinden |
| `src/store/company.store.ts` | isAdmin-Getter |
| `src/types/company.types.ts` | user_role Feld |
| `src/App.tsx` | FinanceRoute statt InvoicesRoute |

---

## 3. Rollenkonzept

`company_settings.profile` (JSON) bekommt ein neues Feld:
```json
{ "user_role": "admin" | "employee" }
```

Default bei Erstinstallation: `"admin"` (kein bestehender Nutzer verliert Zugriff).

**`useCompanyStore`** exponiert:
```ts
isAdmin: boolean  // computed: profile.user_role !== 'employee'
```

**Sichtbarkeitsregeln:**
- `isAdmin = true`: Finanzen-Nav sichtbar, "Neue Rechnung" Button sichtbar, Freigabe-Buttons sichtbar
- `isAdmin = false`: Finanzen-Nav ausgeblendet, kein Zugriff auf FinanceRoute

**Settings-UI:** In SettingsRoute kann der Admin die eigene Rolle umschalten (Prototyp — in Multi-User-Ausbau durch Supabase metadata ersetzen).

---

## 4. Datenbankschema (Migration v12)

### 4.1 Neue Tabellen

```sql
CREATE TABLE IF NOT EXISTS invoice_sequences (
    workspace_id TEXT PRIMARY KEY,
    next_number  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS offer_sequences (
    workspace_id TEXT PRIMARY KEY,
    next_number  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS invoices (
    id              TEXT PRIMARY KEY,
    workspace_id    TEXT NOT NULL DEFAULT '',
    created_by      TEXT NOT NULL DEFAULT '',
    account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    deal_id         TEXT REFERENCES deals(id) ON DELETE SET NULL,
    number          TEXT,                           -- NULL bis Freigabe
    date            TEXT NOT NULL,
    due_date        TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft',  -- draft|open|paid|overdue
    tax_mode        TEXT NOT NULL DEFAULT 'standard', -- standard|reduced|reverse_charge|kleinunternehmer
    subtotal        REAL NOT NULL DEFAULT 0,
    tax_amount      REAL NOT NULL DEFAULT 0,
    total           REAL NOT NULL DEFAULT 0,
    bank_info       TEXT NOT NULL DEFAULT '{}',     -- JSON {iban, bic, bank_name}
    notes           TEXT,
    pdf_path        TEXT,
    is_suggestion   INTEGER NOT NULL DEFAULT 0,
    suggested_by    TEXT,
    approved_by     TEXT,
    pending_sync    INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invoices_workspace
    ON invoices(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_account
    ON invoices(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS invoice_items (
    id          TEXT PRIMARY KEY,
    invoice_id  TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT,
    quantity    REAL NOT NULL DEFAULT 1,
    unit_price  REAL NOT NULL DEFAULT 0,
    tax_rate    REAL NOT NULL DEFAULT 19,
    total       REAL NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS offers (
    id                   TEXT PRIMARY KEY,
    workspace_id         TEXT NOT NULL DEFAULT '',
    created_by           TEXT NOT NULL DEFAULT '',
    account_id           TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    number               TEXT,
    title                TEXT NOT NULL,
    status               TEXT NOT NULL DEFAULT 'draft', -- draft|sent|accepted|rejected
    valid_until          TEXT NOT NULL,
    tax_mode             TEXT NOT NULL DEFAULT 'standard',
    subtotal             REAL NOT NULL DEFAULT 0,
    tax_amount           REAL NOT NULL DEFAULT 0,
    total                REAL NOT NULL DEFAULT 0,
    notes                TEXT,
    pdf_path             TEXT,
    converted_invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
    pending_sync         INTEGER NOT NULL DEFAULT 0,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_offers_workspace
    ON offers(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_offers_account
    ON offers(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS offer_items (
    id          TEXT PRIMARY KEY,
    offer_id    TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT,
    quantity    REAL NOT NULL DEFAULT 1,
    unit_price  REAL NOT NULL DEFAULT 0,
    tax_rate    REAL NOT NULL DEFAULT 19,
    total       REAL NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0
);
```

### 4.2 Steuermodi

| tax_mode | Bedeutung | MwSt-Ausweis |
|----------|-----------|--------------|
| `standard` | 19% MwSt | Ja |
| `reduced` | 7% MwSt | Ja |
| `reverse_charge` | §13b UStG | Nein (Hinweis) |
| `kleinunternehmer` | §19 UStG | Nein (Hinweis) |

Jede Position hat ein eigenes `tax_rate`-Feld (0, 7, 19). Bei `reverse_charge` und `kleinunternehmer` wird `tax_amount = 0` erzwungen.

### 4.3 Rechnungsnummer-Generierung

```rust
// Atomares Increment in DB-Transaktion
fn next_invoice_number(conn: &Connection, workspace_id: &str, year: i32) -> String {
    // INSERT OR IGNORE + UPDATE next_number
    // Gibt zurück: "INV-2026-042"
}
// Analog für Angebote: "ANG-2026-015"
```

Nummer wird erst bei Freigabe (`approve_suggestion`) bzw. Erstellung durch Admin vergeben.

---

## 5. Rust-Module

### 5.1 `db/invoice.rs`

```rust
pub struct Invoice { /* alle Felder */ }
pub struct InvoiceItem { /* alle Felder */ }
pub struct InvoiceWithItems { pub invoice: Invoice, pub items: Vec<InvoiceItem> }
pub struct UpsertInvoicePayload { /* ohne id für create, mit id für update */ }

pub fn create(conn, payload) -> Result<InvoiceWithItems>
pub fn update(conn, id, payload) -> Result<InvoiceWithItems>
pub fn get_by_id(conn, id) -> Result<InvoiceWithItems>
pub fn get_by_workspace(conn, workspace_id, filter) -> Result<Vec<Invoice>>
pub fn get_by_account(conn, account_id) -> Result<Vec<Invoice>>
pub fn approve_suggestion(conn, id, approved_by, workspace_id) -> Result<Invoice>
pub fn update_status(conn, id, status) -> Result<Invoice>
pub fn delete(conn, id) -> Result<()>
pub fn create_suggestion_from_deal(conn, deal) -> Result<Invoice>
pub fn get_finance_kpis(conn, workspace_id) -> Result<FinanceKpis>
```

### 5.2 `db/offer.rs`

```rust
pub fn create(conn, payload) -> Result<OfferWithItems>
pub fn update(conn, id, payload) -> Result<OfferWithItems>
pub fn get_by_id(conn, id) -> Result<OfferWithItems>
pub fn get_by_workspace(conn, workspace_id) -> Result<Vec<Offer>>
pub fn get_by_account(conn, account_id) -> Result<Vec<Offer>>
pub fn convert_to_invoice(conn, offer_id, workspace_id, created_by) -> Result<InvoiceWithItems>
pub fn update_status(conn, id, status) -> Result<Offer>
pub fn delete(conn, id) -> Result<()>
```

### 5.3 `FinanceKpis`-Struct

```rust
pub struct FinanceKpis {
    pub month_revenue: f64,      // Summe paid invoices current month
    pub year_revenue: f64,       // Summe paid invoices current year
    pub open_count: i64,
    pub open_total: f64,
    pub overdue_count: i64,
    pub overdue_total: f64,
    pub suggestion_count: i64,
    pub top_clients: Vec<ClientRevenue>,  // [(account_id, name, total)]
}
```

---

## 6. Tauri Commands

### `commands/invoice.rs`
```rust
get_invoices(workspace_id, status_filter?) -> Vec<Invoice>
get_invoice(id) -> InvoiceWithItems
create_invoice(payload) -> InvoiceWithItems
update_invoice(id, payload) -> InvoiceWithItems
delete_invoice(id) -> ()
approve_invoice_suggestion(id, approved_by) -> Invoice
update_invoice_status(id, status) -> Invoice
get_invoice_suggestions(workspace_id) -> Vec<InvoiceWithItems>
get_invoices_by_account(account_id) -> Vec<Invoice>
get_finance_kpis(workspace_id) -> FinanceKpis
```

### `commands/offer.rs`
```rust
get_offers(workspace_id) -> Vec<Offer>
get_offer(id) -> OfferWithItems
create_offer(payload) -> OfferWithItems
update_offer(id, payload) -> OfferWithItems
delete_offer(id) -> ()
update_offer_status(id, status) -> Offer
convert_offer_to_invoice(offer_id, workspace_id, created_by) -> InvoiceWithItems
get_offers_by_account(account_id) -> Vec<Offer>
```

---

## 7. Frontend-Struktur

### 7.1 `finance.types.ts`
```ts
type InvoiceStatus = 'draft' | 'open' | 'paid' | 'overdue'
type OfferStatus = 'draft' | 'sent' | 'accepted' | 'rejected'
type TaxMode = 'standard' | 'reduced' | 'reverse_charge' | 'kleinunternehmer'

interface Invoice { id, workspaceId, accountId, dealId?, number?, date, dueDate,
  status: InvoiceStatus, taxMode: TaxMode, subtotal, taxAmount, total,
  bankInfo, notes?, isSuggestion, approvedBy?, createdAt, updatedAt }
interface InvoiceItem { id, invoiceId, title, description?, quantity, unitPrice, taxRate, total, sortOrder }
interface InvoiceWithItems { invoice: Invoice, items: InvoiceItem[] }
interface Offer { id, workspaceId, accountId, number?, title, status: OfferStatus,
  validUntil, taxMode, subtotal, taxAmount, total, convertedInvoiceId?, createdAt, updatedAt }
interface FinanceKpis { monthRevenue, yearRevenue, openCount, openTotal,
  overdueCount, overdueTotal, suggestionCount, topClients }
```

### 7.2 `finance.store.ts`
```ts
// Zustand store
invoices: Invoice[]
offers: Offer[]
kpis: FinanceKpis | null
selectedInvoice: InvoiceWithItems | null
selectedOffer: OfferWithItems | null
activeTab: 'invoices' | 'offers' | 'kpis'
invoiceFilter: InvoiceStatus | 'all' | 'suggestions'
// actions: loadAll, createInvoice, approvesuggestion, createOffer, convertOffer, ...
```

### 7.3 `FinanceRoute.tsx` — Tab-Struktur
- **Tab Rechnungen:** Filter-Chips + Tabelle + "Neue Rechnung" Button + "Vorschläge [N]" Button
- **Tab Angebote:** Filter-Chips + Tabelle + "Neues Angebot" Button
- **Tab KPIs:** `<FinanceKPIs />` Komponente

### 7.4 `InvoiceForm.tsx` / `OfferForm.tsx`
Slide-over Panel (rechte Seite, 560px breit):
- Kundenwahl: Searchable Dropdown (accounts aus `useAccountsStore`)
- `<PositionsEditor />`: Zeilen mit Titel, Menge, Einzelpreis, MwSt%, Summe
- Steuermodus-Auswahl (beeinflusst alle Positionen)
- Bankverbindung (aus company_settings vorausgefüllt)
- Live-Summenberechnung (Netto / MwSt / Brutto)
- Speichern als Entwurf | Freigeben (Admin)

### 7.5 `InvoicePDF.tsx` / `OfferPDF.tsx`
`@react-pdf/renderer` Komponente:
- Unternehmensheader (aus company_settings.profile)
- Empfänger-Adresse (aus account)
- Positionen-Tabelle mit Summen
- Steuerhinweis je nach tax_mode
- Bankverbindung
- Fußzeile mit Rechnungsnummer + Datum

PDF wird als Blob generiert und via `window.URL.createObjectURL` direkt heruntergeladen (Browser-Download-Dialog). Das Feld `pdf_path` bleibt in Phase 1 leer — zukünftiger Ausbau kann PDFs im App-Datenverzeichnis cachen.

---

## 8. Deal → Rechnungsvorschlag Automation

**Trigger:** `commands/deal.rs::update_deal_stage()` wenn `stage == "won"`

**Ablauf (Rust):**
```rust
if stage == "won" {
    let deal = db::deal::get_by_id(&conn, &id)?;
    let _ = db::invoice::create_suggestion_from_deal(&conn, &deal);
    // Fehler werden geloggt aber nicht propagiert (Fire-and-forget)
}
```

**Vorausgefüllte Felder:**
- `account_id` = deal.account_id
- `date` = heute
- `due_date` = heute + 14 Tage
- `status` = "draft", `is_suggestion` = 1
- `number` = NULL (erst nach Freigabe)
- Items: 1 Position mit `title = deal.title`, `unit_price = deal.value ?? 0`, `quantity = 1`

**Freigabe-Flow (Frontend):**
1. Badge "Vorschläge [2]" in Finance-Tab
2. Admin öffnet `<InvoiceSuggestions />` Modal
3. Kann jeden Vorschlag inline bearbeiten
4. "Freigeben" → `approve_invoice_suggestion(id, userId)` → Nummer wird generiert, `status = "open"`, `is_suggestion = 0`

---

## 9. CRM-Integration

### 9.1 CustomerRoute — Finance Tab
Neuer Tab "Finanzen" (neben Aktivitäten, Informationen):
- Kunden-Umsatz-Summary: Gesamtumsatz, Offen, Überfällig
- Tabelle: Rechnungen dieses Kunden (kompakt)
- Tabelle: Angebote dieses Kunden (kompakt)

### 9.2 DashboardRoute
Bestehende `StatCard` "Outstanding €" wird mit `kpis.openTotal` befüllt.
Neue `StatCard` "Monatsumsatz" mit `kpis.monthRevenue`.

---

## 10. Implementierungsphasen

### Phase 1 — Data Layer + Core UI
1. DB schema.rs + migration v12
2. `db/invoice.rs` + `db/offer.rs`
3. `commands/invoice.rs` + `commands/offer.rs`
4. Commands in lib.rs registrieren
5. `finance.types.ts` + `finance.service.ts` + `finance.store.ts`
6. `FinanceRoute.tsx` (Rechnungen-Tab + Angebote-Tab, ohne PDF)
7. `InvoiceForm.tsx` + `OfferForm.tsx` + `PositionsEditor.tsx`
8. Rollenlogik: company.store isAdmin + NavSidebar-Gate

### Phase 2 — PDF + Deal Automation
1. `InvoicePDF.tsx` + `OfferPDF.tsx` (@react-pdf/renderer)
2. Download-Button in Invoice/Offer Row
3. `InvoiceSuggestions.tsx` Modal
4. `commands/deal.rs` — Suggestion bei "won" anlegen
5. Badge in FinanceRoute + NavSidebar

### Phase 3 — KPIs + Integrationen
1. `get_finance_kpis` Rust-Command
2. `FinanceKPIs.tsx` Tab
3. CustomerRoute Finance-Tab
4. DashboardRoute Finance-KPIs
5. Settings-UI: user_role umschalten
6. Offer → Invoice 1-Klick-Conversion

---

## 11. Abhängigkeiten

- `@react-pdf/renderer` (npm package, neu)
- Keine neuen Rust-Crates (uuid, chrono, rusqlite, serde bereits vorhanden)
