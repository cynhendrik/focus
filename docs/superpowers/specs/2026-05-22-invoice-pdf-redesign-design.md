# Invoice PDF Redesign — Design Spec

**Datum:** 2026-05-22  
**Branch:** feature/v2-redesign  
**Ansatz:** Iterativ — bestehenden Code erweitern, kein Rewrite

---

## Ziel

Den bestehenden Rechnungs-PDF-Export auf das neue "Modern B" Layout bringen:
- **Firmenlogo** oben rechts (Upload in Einstellungen)
- **Datum + Einheit** pro Rechnungsposition (neue DB-Spalten)
- **Layout-Feintuning** im `InvoicePDF.tsx` (schwerere Trennlinie, Zahlungsbedingungen im Metablock)
- Selbe Änderungen für `OfferPDF.tsx` und `OfferItem`

Rechnungsnummern-Format (`YYYY-NNNNN`, 5-stellig) bleibt unverändert — ist bereits korrekt implementiert.

---

## 1. Datenmodell

### 1.1 DB-Migration — `invoice_items` und `offer_items`

Neue nullable Spalten via `ALTER TABLE`:

```sql
ALTER TABLE invoice_items ADD COLUMN item_date TEXT;
ALTER TABLE invoice_items ADD COLUMN unit TEXT;

ALTER TABLE offer_items ADD COLUMN item_date TEXT;
ALTER TABLE offer_items ADD COLUMN unit TEXT;
```

- `item_date`: ISO-Datum (`YYYY-MM-DD`), nullable. Wenn `NULL` → im PDF wird das Rechnungsdatum angezeigt.
- `unit`: Freitext-Einheit (z.B. `Stk.`, `Std.`, `Tag`, `Monat`, `Pauschal`), nullable.

Migration-Nummer: **v13** (v12 = Finance-Tabellen, bereits deployed).

### 1.2 `CompanyProfile` — Logo

Das Feld `logoBase64?: string` wird dem TypeScript-Interface hinzugefügt. Es wird in der vorhandenen JSON-Spalte `profile` in `company_settings` gespeichert — kein Schema-Change erforderlich, nur ein neues JSON-Feld.

Empfohlene Maximalgröße: 300 KB nach base64-Kodierung (ca. 220 KB Binär). Keine serverseitige Validierung — UI-seitige Warnung bei Überschreitung.

---

## 2. Backend (Rust)

### 2.1 Structs (`db/invoice.rs` und `db/offer.rs`)

`InvoiceItem` und `OfferItem`:
```rust
pub item_date: Option<String>,
pub unit:      Option<String>,
```

`UpsertInvoiceItemPayload` und `UpsertOfferItemPayload`:
```rust
pub item_date: Option<String>,
pub unit:      Option<String>,
```

### 2.2 `map_item()` — Spaltenindizes

Die zwei neuen Felder werden am Ende der SELECT-Liste angehängt. `map_item()` bekommt zwei neue `r.get()`-Aufrufe mit den entsprechenden Indizes (9 und 10).

### 2.3 `replace_items()` — INSERT

INSERT-Statement wird um `item_date` und `unit` erweitert. Werte werden als Bindings übergeben (NULL wenn `None`).

### 2.4 Keine neuen Tauri-Commands

`create_invoice`, `update_invoice`, `create_offer`, `update_offer` funktionieren weiterhin — sie nehmen jetzt die erweiterten Payloads entgegen.

---

## 3. Frontend-Typen

### `src/types/finance.types.ts`

Folgende Interfaces erhalten `itemDate?: string` und `unit?: string`:
- `InvoiceItem`
- `UpsertInvoiceItemPayload`
- `OfferItem`
- `UpsertOfferItemPayload`

### `src/types/company.types.ts`

```ts
export interface CompanyProfile {
  // … bestehende Felder …
  logoBase64?: string
}
```

---

## 4. PDF-Template (`InvoicePDF.tsx`)

### 4.1 Logo im Header

```tsx
{/* Rechts oben */}
{profile.logoBase64
  ? <Image src={profile.logoBase64} style={{ width: 48, height: 48, objectFit: 'contain' }} />
  : <InitialsBadge name={profile.name} />   // View + Text, Initialen in Kreis
}
```

`InitialsBadge`: Inline-Komponente, die aus dem Firmennamen die ersten 1-2 Buchstaben als dunklen Kreis (48×48pt) rendert. Kein externer SVG nötig — reine react-pdf Primitives.

### 4.2 Tabellenspalten

Neue Spaltenreihenfolge:

| Spalte | Breite | Ausrichtung |
|---|---|---|
| Bezeichnung | flex: 3 | links |
| Datum | 58pt | rechts |
| Menge | 38pt | rechts |
| Einheit | 46pt | rechts |
| Einzelpreis | 60pt | rechts |
| MwSt (nur Standard) | 38pt | rechts |
| Betrag | 60pt | rechts |

Datum-Wert: `item.itemDate ?? invoice.date`, formatiert `DD.MM.YYYY`.  
Einheit-Wert: `item.unit ?? ''`.  
MwSt-Spalte entfällt bei `kleinunternehmer` und `reverse_charge` (wie bisher).

### 4.3 Layout-Feintuning

- Header-Trennlinie: `height: 1.5` statt `0.75` (stärkere visuelle Trennung)
- Metablock rechts: Zahlungsbedingungen als neue Zeile — Wert wird berechnet als `daysBetween(invoice.date, invoice.dueDate)` und angezeigt als `"X Tage"` (kein neues DB-Feld nötig)
- Einheitliche `gap`-Abstände im Metablock

### 4.4 Dateiname beim Download

```ts
const filename = `RECHNUNG ${invoice.number ?? 'Entwurf'} - ${account.name} - ${fmt(invoice.total)}.pdf`
```
Analog zum Beispiel-PDF: `RECHNUNG 2026-00002 - Kundenname - 120,00 EUR.pdf`

---

## 5. `OfferPDF.tsx`

Identische Änderungen wie `InvoicePDF.tsx`:
- Logo-Rendering im Header
- Tabellenspalten um Datum + Einheit erweitert
- Layout-Feintuning

---

## 6. Frontend-UI

### 6.1 `PositionsEditor.tsx`

Jede Position bekommt eine zweite Eingabezeile (unterhalb Titel/Beschreibung):

- **Datum-Feld**: `<input type="date">`, vorausgefüllt mit Rechnungsdatum (prop). Änderbar pro Position.
- **Einheit-Feld**: Combobox — Schnellauswahl-Buttons (`Stk.` / `Std.` / `Tag` / `Monat` / `Pauschal`) + freies Textfeld. Kein Pflichtfeld.

Beide Felder sind optional — bestehende Rechnungen ohne diese Felder funktionieren weiterhin.

### 6.2 Company Settings — Logo-Upload

Neuer Abschnitt „Firmenlogo" in der bestehenden Settings-UI (`SettingsRoute.tsx` oder `CompanyRoute.tsx`):

1. Logo-Vorschau (32×32px, abgerundet) — zeigt Initialen-Fallback wenn kein Logo
2. Button „Logo hochladen" → Tauri `open()` File-Dialog, Filter: `['png', 'jpg', 'jpeg', 'svg']`
3. Datei client-seitig als base64 lesen (`FileReader`) → `CompanyProfile.logoBase64` setzen → `update_company_settings` aufrufen
4. „Entfernen"-Link (nur sichtbar wenn Logo vorhanden) → setzt `logoBase64` auf `undefined`
5. UI-Warnung wenn Datei > 300 KB (vor dem Speichern)

Kein neuer Tauri-Command nötig.

---

## 7. Nicht im Scope

- Logo-Crop/Resize in der App
- Mehrere Logos pro Workspace
- Per-Rechnung überschreibbares Logo
- Angebots-Logo-Upload (folgt automatisch durch geteilten `CompanyProfile`-Store)

---

## 8. Offene Abhängigkeiten

- Migration-Nummer: v13 (bereits oben festgelegt)
- Einheitenspalte in `OfferItem` ist identisch mit Invoice — Offer-Workflow bleibt unverändert

---

## Implementierungsreihenfolge (für den Plan)

1. DB-Migration (`invoice_items` + `offer_items`)
2. Rust-Structs + map/insert aktualisieren
3. TypeScript-Typen erweitern
4. `PositionsEditor.tsx` — Datum + Einheit Felder
5. Logo-Upload in Settings
6. `InvoicePDF.tsx` — Logo + neue Spalten + Layout
7. `OfferPDF.tsx` — gleiche Änderungen
8. Download-Dateiname anpassen
