# Projekt-Modul-Ausbau — Etappe 3: Phasen-Tab mit Gates + Deliverables

## Kontext

Etappe 1 (Datenmodell + Timeline-Übersicht, PR #5) und Etappe 2 (Detail-Kopf + Tabs + Cockpit, PR #6) sind gemergt. `ProjectPhase` hat seit Etappe 1 `gateName`/`gateState`/`gateDate`/`gateApprovedBy`, aber **kein** Feature setzt `gateState` jemals auf etwas anderes als `'open'` — der komplette Freigabe-Workflow (open→pending→approved) existiert bisher nur als Datenfelder, nicht als UI. Der Phasen-Tab (seit Etappe 2) zeigt Phasen nur als Kreis-Stepper mit Fortschritts-Regler; es gibt keine Deliverables (Ergebnisse pro Phase) als Datenmodell.

Diese Etappe (3 von 6) baut den vollen Freigabe-Workflow: Deliverables-Checkliste pro Phase + die drei Gate-Zustände mit echten Aktionen.

## Ziel dieser Etappe

- Neues Datenfeld `deliverables` pro Phase (JSON-Liste `{id, name, status}`).
- Drei neue Backend-Funktionen: Freigabe anfragen (open→pending), Freigabe eintragen (pending→approved, mit Freitext "wer hat freigegeben"), Deliverables aktualisieren.
- Phasen-Tab: bisheriger Kreis-Stepper wird durch eine aufklappbare Phasen-Liste ersetzt (Kopfzeile immer sichtbar, Details beim Aufklappen: Deliverables-Checkliste + Gate-Aktionen je nach Zustand).

**Explizit nicht Teil dieser Etappe:**
- Budgetanteil pro Phase (bräuchte ein neues `share`-Feld UND funktioniert nur bei befristeten Retainern — passt nicht zum "nur echte, vollständige Daten zeigen"-Prinzip).
- Echter Mail-Versand für "Erinnern" (bleibt Platzhalter-Toast wie andere sekundäre Aktionen bisher).
- Automatischer open→pending-Übergang aus Deliverables-Status (bewusst manuell, siehe unten).
- Ein "Protokoll"-Button bei `approved` (kein echter Audit-Trail über die zwei vorhandenen Felder hinaus vorhanden — ein Button ohne echten Inhalt dahinter wäre ein toter/fake Button).
- Drag-Reorder der Phasen-Liste (bestehende `reorderPhases`-Action im Store bleibt ungenutzt von UI, wie bisher).
- Cockpit-Tab-Änderungen (bleibt bei "Zur Phase"-Navigation, keine doppelte Freigabe-Aktion dort).

## Design-Entscheidungen

**Deliverables als JSON-Spalte, nicht eigene Tabelle.** `project_phases` ist eine typisierte Tabelle mit dediziertem Rust-Struct (anders als das generische `activities.payload`-JSON-Muster bei Todos) — trotzdem ist eine neue Tabelle für eine kurze, phasen-gebundene Liste ohne eigene Beziehungen (keine Zuweisung an Personen, kein Fälligkeitsdatum pro Item) unnötiger Aufwand. `deliverables TEXT NOT NULL DEFAULT '[]'` folgt strukturell dem `todos.checklist`-Vorbild: Rust reicht den String roh durch (kein `serde_json` in `project_phase.rs`), TypeScript parst/serialisiert im Mapper. Rust validiert beim Schreiben nur, dass es sich um gültiges JSON handelt (Boundary-Validierung), ohne die Struktur tief zu verstehen.

**open→pending ist ein manueller Klick, kein Automatismus.** Deliverables-Status und Gate-Status sind bewusst entkoppelt — eine Phase kann freigabereif sein, bevor alle Punkte abgehakt sind, oder umgekehrt. Ein Automatismus "alle Deliverables fertig → Gate automatisch pending" würde in der Praxis nicht immer treffen.

**`gate_approved_by` ist ein Freitext-Feld beim Klick auf "Freigabe eintragen".** Die Freigabe kommt meist vom Kunden, nicht von der eingeloggten Person — ein automatisch eingesetzter eigener Name wäre falsch.

**"Erinnern" bleibt Platzhalter.** Echter Mail-Versand (Compose mit vorausgefülltem Empfänger/Betreff) ist ein größerer, eigenständiger Baustein (braucht Kunden-E-Mail-Adresse + Compose-Integration) und bewusst nicht Teil dieser Etappe.

## Datenmodell

### `project_phases` — additive Migration (SQLite v39 / Supabase 0028)

| Spalte | Typ | Default | Bedeutung |
|---|---|---|---|
| `deliverables` | TEXT | `'[]'` | JSON-Array von `{id, name, status}`, `status ∈ {'open','review','done'}` |

### TypeScript

```typescript
export type DeliverableStatus = 'open' | 'review' | 'done'
export interface Deliverable {
  id: string
  name: string
  status: DeliverableStatus
}
```

`ProjectPhase.deliverables: Deliverable[]` (bereits geparst — Mapper macht `JSON.parse(row.deliverables ?? '[]')` beim Lesen, `JSON.stringify(...)` beim Schreiben über die neue `updateDeliverables`-Aktion).

### Rust (`src-tauri/src/db/project_phase.rs`)

- `ProjectPhase.deliverables: String` (roh, unverändert durchgereicht — kein `serde_json::from_str` in Rust).
- `request_gate(conn, id, project_id, gate_date: Option<String>) -> Result<ProjectPhase, AppError>`: nur wenn `gate_state == 'open'`, sonst `AppError::Validation`. Setzt `gate_state = 'pending'`, `gate_date = gate_date` (vom Aufrufer übergeben, optional). Setzt **nicht** automatisch `gate_date = heute` — ein frisch angefragtes Gate ohne explizites Fälligkeitsdatum soll nicht sofort als "warn"/dringend erscheinen (`projectHealthZeit`/`nextMove` behandeln `gate_date = null` bereits als "kein Termin gesetzt", nicht als überfällig).
- `approve_gate(conn, id, project_id, approved_by: String) -> Result<ProjectPhase, AppError>`: nur wenn `gate_state == 'pending'`, sonst `AppError::Validation`. `approved_by` muss nicht-leer sein (getrimmt), sonst `AppError::Validation`. Setzt `gate_state = 'approved'`, `gate_date = heute`, `gate_approved_by = approved_by`.
- `update_deliverables(conn, id, project_id, deliverables_json: String) -> Result<ProjectPhase, AppError>`: validiert nur, dass `deliverables_json` gültiges JSON ist (`serde_json::from_str::<serde_json::Value>`), sonst `AppError::Validation`. Speichert den String roh.

## UI

### Phasen-Tab — aufklappbare Liste ersetzt den Kreis-Stepper

Pro Phase eine Karte:
- **Kopfzeile** (immer sichtbar, Klick öffnet/schließt): Name, Zeitraum (`start_date`–`end_date`), Gate-Status-Tag (offen/Freigabe offen/freigegeben, Farbe aus `GATE_COLOR`), Fortschritts-Regler **nur** für die aktuelle Phase (`project.currentPhaseId`), Zwei-Klick-Löschen für Nicht-aktuelle Phasen (bestehendes Verhalten aus Etappe 1, unverändert übernommen).
- **Aufgeklappter Bereich**:
  - Deliverables-Checkliste: Liste vorhandener Punkte (Klick auf einen Punkt zyklt `open → review → done → open`), Entfernen-Icon pro Punkt, Eingabefeld + Button "+ Deliverable" am Ende.
  - Gate-Bereich, je nach `gate_state`:
    - `open`: "Noch keine Freigabe angefragt." + optionales Datumsfeld "Fällig bis (optional)" + Button "Freigabe anfragen" (Datumsfeld kann leer bleiben — kein erfundenes "heute fällig", das eine Dringlichkeit vortäuschen würde, die so nicht gemeint ist). Freigabe kann auf jeder Phase unabhängig von ihrer Reihenfolge angefragt werden, keine künstliche Beschränkung auf die aktuell aktive Phase.
    - `pending`: "{gate_date formatiert} · wartet auf Freigabe. Ohne sie startet die nächste Phase nicht." + Freitext-Eingabe "Wer hat freigegeben?" + Button "Freigabe eintragen" (disabled bis Eingabe nicht-leer) + Button "Erinnern" (Platzhalter-Toast, wie bisherige sekundäre Aktionen).
    - `approved`: "Freigegeben am {gate_date formatiert} — {gate_approved_by}. Die Folgephase ist entsperrt." Keine weiteren Buttons.

### Cockpit-Tab

Unverändert — `nextMove`s "Zur Phase"-CTA bleibt eine reine Tab-Navigation, keine Freigabe-Aktion wird im Cockpit dupliziert.

## Testing

- Rust-Unit-Tests (`db/project_phase.rs`): `request_gate` (Erfolg aus `open`, Ablehnung aus `pending`/`approved`), `approve_gate` (Erfolg aus `pending`, Ablehnung aus `open`/`approved`, Ablehnung bei leerem `approved_by`), `update_deliverables` (Erfolg mit gültigem JSON, Ablehnung bei ungültigem JSON), Migrations-Backfill-Test (`deliverables = '[]'` für Bestandsphasen).
- Frontend-Unit-Tests: Mapper-Parsing/Serialisierung von `deliverables`, neue Store-Actions (`requestGate`, `approveGate`, `updateDeliverables`).
- Komponenten-Tests: neue Phasen-Listen-Komponente (Auf-/Zuklappen, Gate-Zustände rendern die richtigen Texte/Buttons, Deliverable-Status-Zyklus, Fortschritts-Regler nur bei aktueller Phase, Zwei-Klick-Löschen weiterhin funktionsfähig).

## Offene Punkte für spätere Etappen

- Team-Zuweisung pro Deliverable/Phase — Etappe 4.
- Rechnungs-Kopplung an Gate-Freigabe (im Prototyp: "sobald Gate steht, Rechnungsentwurf erzeugen") — Etappe 6, nicht vorher, da sonst ein Verweis auf eine nicht existierende Funktion entstünde.
- Echter Mail-Versand für "Erinnern" — eigener Zusatzpunkt, wenn gewünscht.
