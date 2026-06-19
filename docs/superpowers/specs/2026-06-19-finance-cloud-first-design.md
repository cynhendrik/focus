# Finanzen Cloud-first — Design Spec

**Datum:** 2026-06-19
**Status:** Design — zur Review
**Kontext:** Cultera Focus, Cloud-first-Programm (Domäne 1 nach dem `accounts`-Pilot). Referenz-Muster: `docs/superpowers/specs/2026-06-18-shared-workspace-accounts-pilot-design.md`.

## Problem / Ausgangslage

Die Finanz-Domäne läuft heute rein lokal (SQLite via Tauri `invoke`, `FinanceService`). Für Cloud-first muss sie — wie `accounts` — im geteilten/Cloud-Workspace **direkt gegen Supabase** lesen/schreiben, realtime, mit Mehrnutzer-tauglicher Berechtigung.

**Befund aus dem Supabase-Abgleich (2026-06-19):**
- Tabellen existieren in Supabase bereits (von der Vorgänger-App): `invoices`, `invoice_items`, `offers`, `offer_items`, `invoice_sequences`, `offer_sequences` (alle `rls=true`).
- **`payments` fehlt** in Supabase → muss angelegt werden.
- Realtime ist auf keiner Finanz-Tabelle aktiv → einschalten.
- Die existierenden Schemas stammen aus der anderen App → **Spalten gegen den Desktop-Code verifizieren** (wie bei `accounts` geschehen), bevor wir bauen.

## Ziel

Im Cloud-Workspace laufen Rechnungen, Angebote, Zahlungen und KPIs über Supabase + Realtime. **Berechtigung (entschieden 2026-06-19): „Finanzen komplett aus, nur Entwurf anlegen" für Mitarbeiter** — Owner sieht/macht alles, Mitarbeiter sieht keinen Finanzbereich/keine Zahlen, kann nur Entwürfe anlegen.

### Umfang
`invoices` + `invoice_items`, `offers` + `offer_items`, `payments` (neu), `invoice_sequences`/`offer_sequences`, KPIs. Solo-Workspaces bleiben unverändert lokal.

### Nicht-Ziele
- E-Rechnung/ZUGFeRD (eigenes Thema, siehe [[erechnung-pflicht-missing]]).
- PDF-Dateien in den Storage (gehört zur Domäne „Dateien").
- Mahnwesen-Umbau (separat).
- Offline (bewusst nicht; Cloud = online).

## Erfolgskriterien
1. Owner legt im Cloud-Workspace eine Rechnung an → sie liegt in Supabase, erscheint live beim anderen Owner-Gerät.
2. Beim **Finalisieren** (draft → offen) wird eine **lückenlose, eindeutige Nummer** vergeben — auch wenn zwei gleichzeitig finalisieren (atomar, keine Doppel/Lücken).
3. **Mitarbeiter** sieht keinen Finanzbereich, keine KPIs, keinen Umsatz; kann aus einem Kunden heraus einen **Rechnungs-/Angebots-Entwurf** anlegen.
4. Der Mitarbeiter-Entwurf erscheint beim Owner als **Vorschlag** zur Freigabe; nach Freigabe erhält er eine Nummer.
5. Mitarbeiter kann **keine** finalisierten/fremden Rechnungen oder Beträge lesen (per RLS, nicht nur UI).
6. Solo-Workspace: Finanzen unverändert lokal/offline.

## Architektur — Komponenten

### 1. FinanceGateway (`src/data/finance.gateway.ts`)
Mirror von `AccountsGateway`: routet jede `FinanceService`-Methode solo→`invoke` / shared→Supabase. Zu routen (aus `finance.service.ts`):
- **Invoices:** getInvoices, getInvoice(+items), createInvoice, updateInvoice, deleteInvoice, updateInvoiceStatus, getInvoiceSuggestions, approveInvoiceSuggestion, getInvoicesByAccount, getFinanceKpis, peekInvoiceNumber, getInvoiceSequence, setInvoiceStartNumber, setInvoiceFormat, invoiceNumberExists.
- **Offers:** getOffers, getOffer(+items), createOffer, updateOffer, deleteOffer, updateOfferStatus, convertOfferToInvoice, getOffersByAccount.
- **Payments:** addPayment, getPayments, getPaymentsByWorkspace, deletePayment.

Die Stores (`finance.store`) rufen künftig das Gateway. Wegen Umfang wird der Gateway in Unter-Module aufgeteilt (invoices / offers / payments), gemeinsame `shared()`/`uid()`-Helfer wie bei accounts.

### 2. Mapper (`src/data/finance.mapper.ts`)
Reine Konvertierung Supabase-Row ↔ Typ je Entität: `invoiceRowToInvoice`, `invoiceWithItems` (Rechnung + items), `offer…`, `payment…`, plus Payload→Row. Round-trip-testbar. Schema-Drift-Sicherung über die Verifikation (s. u.).

### 3. Atomare Nummernvergabe (GoBD) — Postgres-Funktion
Heute vergibt Rust `next_invoice_number` (read-compute-update der `invoice_sequences`-Zeile, Jahres-Reset über `seq_year`/`format`). Im Mehrnutzer-Cloud **atomar** als `SECURITY DEFINER`-Funktion:

`allocate_invoice_number(ws_id text) returns text` — sperrt die Sequenz-Zeile (`UPDATE invoice_sequences … RETURNING` bzw. `SELECT … FOR UPDATE`), berechnet den nächsten Zähler (gleiche Logik inkl. Jahres-Reset wie `compute_next_counter`), schreibt `next_number`/`seq_year` zurück und gibt die formatierte Nummer zurück. Garantiert lückenlos/eindeutig bei Parallelzugriff.
- **Nummer wird erst beim Finalisieren vergeben** (draft → offen). Entwürfe haben `number = NULL` (GoBD-konform).
- `peekInvoiceNumber` bleibt rein lesend (Vorschau), vergibt nichts.
- Analog `allocate_offer_number` für Angebote (Angebotsnummern sind nicht GoBD-kritisch, aber gleiche Mechanik für Konsistenz).

### 4. `payments`-Tabelle in Supabase anlegen
Spiegelt das lokale Schema (`schema.rs`): `id, workspace_id, invoice_id→invoices, amount, paid_at, method, note, created_at`. Mit RLS (owner-only, s. u.) + Realtime.

### 5. Berechtigung — `can_view_finance` + Vorschlags-Mechanismus
- `workspace_members.can_view_finance boolean default false` (Owner-Rolle implizit `true`; per Owner-UI pro Mitglied umschaltbar — später).
- **Mitarbeiter-Entwurf = bestehender Vorschlags-Mechanismus:** Entwurf wird mit `is_suggestion=true, suggested_by=<employee>` angelegt. Der Owner sieht ihn unter „Vorschläge", `approveInvoiceSuggestion` gibt ihn frei → Nummer wird vergeben, Status gesetzt. So mappt „Mitarbeiter legt Entwurf an → Owner finalisiert" sauber auf vorhandene Felder.

### 6. RLS-Policies (Sicherheit, Pflicht)
- **invoices / offers:**
  - Owner (`can_view_finance`/Owner): voller `ALL` über Workspace-Mitgliedschaft.
  - Mitarbeiter: `INSERT` erlaubt nur als Entwurf/Vorschlag (`created_by = auth.uid()` und `is_suggestion = true`/`status='draft'`); `SELECT`/`UPDATE` nur eigene, noch nicht freigegebene Zeilen (`created_by = auth.uid()` und nicht finalisiert). **Kein** Lesen finalisierter/fremder Rechnungen.
- **invoice_items / offer_items:** über das Eltern-Dokument scopen (`invoice_id in (select id from invoices where <sichtbar>)`).
- **payments:** **owner-only** (Geldeingänge) — Mitarbeiter kein Zugriff.
- **invoice_sequences / offer_sequences:** kein direkter Client-Zugriff; nur über die `SECURITY DEFINER`-Allocate-Funktion.
- Hinweis: Die existierenden Finanz-Policies der anderen App werden **geprüft und durch dieses Modell ersetzt** (aktuell vermutlich simples `is_workspace_member`-`ALL` → für das Entwurf-Modell zu offen).

### 7. UI-Gating
- Mitarbeiter (`can_view_finance=false`): **kein** „Finanzen"-Nav-Eintrag/-Route; im Kundendetail **kein** Finanzen-Tab mit Zahlen — stattdessen nur Aktion **„Rechnungs-/Angebots-Entwurf erstellen"**. KPIs/Geld-Cockpit/Dashboard-Umsatz ausgeblendet.
- Owner: unverändert voller Bereich.

### 8. Realtime
`invoices, invoice_items, offers, offer_items, payments` → in `supabase_realtime`-Publication + `replica identity full`. `useWorkspaceRealtime` um Finanz-Channels erweitern (Updates in `finance.store`). Items kommen über das Eltern-Dokument (beim Invoice-Event Rechnung inkl. Items neu laden).

## Datenfluss — Beispiele
- **Owner finalisiert:** updateInvoiceStatus(draft→offen) → Gateway (shared) ruft `allocate_invoice_number(ws)` → Nummer gesetzt, Status offen → Realtime an alle.
- **Mitarbeiter-Entwurf:** „Entwurf erstellen" → Gateway insert `is_suggestion=true, suggested_by=self`, `number=NULL` → RLS erlaubt (eigener Entwurf) → erscheint beim Owner als Vorschlag → Owner `approveInvoiceSuggestion` → Nummer + Status.

## Verifikation vor Implementierung (Pflicht-Task)
1. Supabase-Schema von `invoices/invoice_items/offers/offer_items/invoice_sequences/offer_sequences` gegen `schema.rs` abgleichen (Spaltennamen/Typen; insb. ob `invoice_sequences` `format`/`seq_year` hat).
2. Bestehende Finanz-RLS-Policies auslesen (ersetzen).
3. `payments` existiert nicht → anlegen.

## Risiken
- **GoBD-Atomicity:** die Allocate-Funktion muss wirklich serialisieren (Row-Lock); Tests mit Parallelzugriff.
- **Schema-Drift** der von der anderen App angelegten Tabellen.
- **Berechtigungs-Lecks:** Entwurf-RLS muss „nur eigene, nicht finalisierte" exakt treffen, sonst sieht ein Mitarbeiter doch Umsatz.
- **Gateway-Umfang:** ~27 Methoden — wird in Unter-Module gesplittet; Stores entsprechend umstellen.

## Reihenfolge (für den späteren Plan)
1. Verifikation + `payments` anlegen + RLS/Realtime einschalten.
2. Mapper + Gateway (invoices) + Store-Umstellung + Realtime.
3. Allocate-Funktion + Finalisierungs-Pfad.
4. Offers analog.
5. Payments (owner-only).
6. Entwurf-Berechtigung (RLS + UI-Gating + Vorschlags-Flow).
