# Projekt-Modul-Ausbau — Etappe 6: Rechnungen im Projekt-Kontext

## Kontext

Etappe 1-5 (Datenmodell + Timeline-Übersicht, Detail-Kopf + Tabs + Cockpit, Phasen-Tab mit Gates + Deliverables, Team-Zuweisung, Moodboard) sind gemergt (PR #5-#9). `ProjectDetailRoute.tsx` hat aktuell drei Tabs (`'cockpit' | 'phasen' | 'moodboard'`). Diese letzte Etappe (6 von 6) fügt einen vierten Tab hinzu: "Rechnungen".

Diese App hat bereits eine vollständige, reife Rechnungs-Infrastruktur: `Invoice`-Datenmodell (Positionen, Steuerarten, Status, Zahlungen), PDF-Generierung (`InvoicePDF.tsx`), ein reifes Mahnwesen (`dunning.service.ts`, Erinnerungsstufen mit Gebühren, PDF+Mail+Todo-Erzeugung) und eine bestehende Rechnungs-Ansicht pro Kunde (`FinanzPane.tsx`, Tab "Finanzen" im Kunden-Detail). Was fehlt, ist ausschließlich der **Projekt-Bezug**: `Invoice` hat aktuell kein `projectId`-Feld, nur `accountId` (Kunde) und optional `dealId` (Pipeline-Deal).

Der externe Design-Prototyp (`project-invoices.jsx`) zeigt zusätzlich eine automatische Entwurfs-Erzeugung aus "Mehrstunden einer freigegebenen Phase" -- das ist **nicht umsetzbar ohne Value-Lüge**: Zeiterfassung (`TimeEntry`) ist heute ausschließlich kundenbezogen (`customerId`), es gibt kein `projectId`/`phaseId`-Feld und damit keine echte Datengrundlage für "9 Überstunden in dieser Phase". Ebenso existiert kein Automatismus, der aus dem bereits vorhandenen `Project.retainerMonthly`-Feld automatisch wiederkehrende Rechnungen erzeugt -- Rechnungserstellung ist heute vollständig manuell.

## Ziel dieser Etappe

- `Invoice` bekommt ein optionales `projectId`-Feld (additive Migration, analog zum bestehenden `dealId`-Feld).
- Neuer Tab "Rechnungen" im Projekt-Detail, spiegelt `FinanzPane.tsx`'s bestehendes Muster: gefilterte Rechnungsliste, Status-Badges, PDF-Download, bestehender Mahnwesen-Button, Summen-Kopfzeile (Bezahlt/Offen/Gestellt).
- "Neue Rechnung" aus dem Projekt-Tab heraus erstellt eine Rechnung mit vorausgefülltem Kunde **und** Projekt.
- Bestehende Rechnungen (auch solche ohne Projekt-Bezug) lassen sich nachträglich einem Projekt zuordnen -- sowohl im neuen Projekt-Tab als auch in der bestehenden `FinanzPane`.

**Explizit nicht Teil dieser Etappe:**
- Kein automatisch generierter Rechnungsentwurf aus Phasen-/Gate-Mehrstunden -- keine echte Datengrundlage (siehe oben).
- Kein Retainer-Abrechnungs-Automatismus oder -Shortcut ("Diesen Monat abrechnen") -- eigene, spätere Initiative, falls gewünscht.
- Keine Änderung an der bestehenden Rechnungs-Erstellung, PDF-Generierung, Zahlungs-Erfassung oder am Mahnwesen selbst -- alle vier werden unverändert wiederverwendet, nicht neu gebaut.
- Keine Cockpit-/Timeline-Sichtbarkeit von Rechnungs-Signalen (z.B. "3 Rechnungen offen" im Cockpit) -- das war bereits in Etappe 1 als "kommt mit Etappe 6" vorgemerkt, bleibt hier aber bewusst außen vor, um den Scope dieser letzten Etappe klein zu halten; kann als eigener Folgepunkt aufgegriffen werden.

## Design-Entscheidungen

**`project_id` als optionales Feld, kein Pflichtfeld.** Nicht jeder Kunde/jede Rechnung ist zwingend an ein Projekt gekoppelt (z.B. Einzelrechnungen ohne Projektstruktur). `NULL` bleibt ein gültiger, unveränderter Zustand für alle bestehenden Rechnungen nach der Migration.

**Wiederverwendung, keine Parallel-Implementierung.** Der neue Projekt-Tab ist im Kern dieselbe Ansicht wie `FinanzPane.tsx`, nur nach `project_id` statt `account_id` gefiltert. Erstellungs-Modal, PDF-Download, Mahnwesen-Button, Status-Logik bleiben exakt die bestehenden Komponenten/Services -- nur um die Möglichkeit erweitert, `project_id` mitzugeben bzw. nachträglich zu setzen.

**Zuordnung bestehender Rechnungen als kleines Dropdown, keine Bulk-Aktion.** Ein einfaches Zuordnen-Dropdown pro Rechnungszeile (Projekt wählen aus den Projekten des jeweiligen Kunden) reicht für den erwarteten Anwendungsfall (gelegentliches Nachpflegen) -- keine Mehrfachauswahl/Bulk-Zuordnung nötig.

**Keine Vortäuschung von Automatisierung.** "Neue Rechnung" aus dem Projekt-Tab heraus ist ein echter Vorausfüll-Mechanismus (Kunde + Projekt sind bereits bekannt, warum erneut auswählen lassen), keine automatische Inhalts-Generierung -- Positionen, Beträge, Leistungszeitraum bleiben wie bisher vom Nutzer einzutragen.

## Datenmodell

### `invoices` — additive Migration (SQLite vNN / Supabase NNNN, Nummer bei Planerstellung final)

| Spalte | Typ | Default | Bedeutung |
|---|---|---|---|
| `project_id` | TEXT, NULL | `NULL` | Optionale Projekt-Zuordnung |

### Rust (`src-tauri/src/db/invoice.rs`)

- `Invoice.project_id: Option<String>` (analog zu `deal_id: Option<String>`).
- `get_by_project(conn, project_id) -> Result<Vec<Invoice>, AppError>` (analog zu `get_by_account`).
- `set_project(conn, invoice_id, project_id: Option<String>) -> Result<Invoice, AppError>` -- setzt/entfernt die Projekt-Zuordnung einer bestehenden Rechnung (Boundary-Validierung: Projekt muss existieren, falls `Some`, sonst `AppError::NotFound`).
- `create`/`update` (bestehende Funktionen) um das optionale `project_id`-Feld im Payload erweitert.

### TypeScript

`Invoice.projectId: string | null` (bereits geparst -- Mapper-Erweiterung analog zum bestehenden `dealId`-Handling).

## UI

### Neuer Tab "Rechnungen"

`ProjectTab`-Typ erweitert um `'rechnungen'`. Tab erscheint in der bestehenden `TabBar` neben Cockpit/Phasen/Moodboard.

Inhalt spiegelt `FinanzPane.tsx`:
- Rechnungsliste (Nummer, Datum, Betrag, Status-Badge), gefiltert nach `project_id === project.id`.
- Summen-Kopfzeile: Bezahlt / Offen / Gestellt, aus der gefilterten Liste berechnet.
- "Neue Rechnung"-Button öffnet das bestehende Erstellungs-Modal, vorausgefüllt mit `accountId = project.accountId` und `projectId = project.id`.
- PDF-Download, Mahnwesen-Button ("Mahnung") pro Zeile -- unverändert wiederverwendet.
- Zuordnen-Dropdown pro Zeile (auch für Rechnungen ohne aktuelle Projekt-Zuordnung, um sie diesem Projekt nachträglich zuzuweisen).

### Bestehende `FinanzPane.tsx` (Kunden-Detail) -- kleine Erweiterung

Jede Rechnungszeile bekommt ebenfalls das Zuordnen-Dropdown (Projekt aus den Projekten dieses Kunden wählen, oder "kein Projekt"), damit die Zuordnung von beiden Seiten aus möglich ist.

## Testing

- Rust-Unit-Tests (`db/invoice.rs`): `get_by_project` (Filterung, leere Liste), `set_project` (Erfolg, Ablehnung bei unbekanntem Projekt, Entfernen der Zuordnung via `None`), bestehende `create`/`update`-Tests um `project_id`-Fälle erweitert, Migrations-Backfill-Test (bestehende Rechnungen bekommen `project_id = NULL`).
- Frontend-Unit-Tests: Mapper-Erweiterung um `projectId`, neue Store-Actions/Service-Methoden.
- Komponenten-Test für den neuen Projekt-Tab (Liste, Summen, Erstellen-Vorausfüllung, Zuordnen-Dropdown) sowie ein Regressionstest für `FinanzPane.tsx`'s erweitertes Zuordnen-Dropdown (falls dafür bereits Tests existieren -- sonst neu ergänzt).

## Offene Punkte für spätere Etappen

- Echte Zeiterfassung pro Projekt/Phase (`TimeEntry.projectId`/`phaseId`) -- Voraussetzung für jede künftige automatische Rechnungs-Erzeugung aus Mehrstunden.
- Retainer-Abrechnungs-Automatismus oder -Shortcut.
- Rechnungs-Signale im Cockpit/Timeline (z.B. "X offen").
