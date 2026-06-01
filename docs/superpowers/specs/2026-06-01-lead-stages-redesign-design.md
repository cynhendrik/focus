# Lead-Stages-System Redesign

**Datum:** 2026-06-01
**Status:** Approved, ready for implementation plan
**Scope:** Leads-Board bekommt konfigurierbare Stages (wie Pipeline), zwei feste Terminal-Stages (`Qualifiziert` → Pipeline-Bridge, `Disqualifiziert` → Re-Engage), Confirmation-Cards beim Drag in Terminal-Stages.

---

## Ziel

Lead-Stages sind bisher hardcoded (`new`, `attempted`, `warm`, `call_booked`). Der User soll eigene Zwischen-Stages definieren können. Die Terminal-Stages `Qualifiziert` und `Disqualifiziert` sind immer vorhanden und nicht löschbar. Jede Terminal-Stage triggert eine Confirmation-Card mit kontextspezifischer Aktion.

---

## 1 — Datenmodell

### Neue Tabelle `lead_stages` (DB-Migration v19)

```sql
CREATE TABLE IF NOT EXISTS lead_stages (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL,
  name          TEXT NOT NULL,           -- Schlüssel, z.B. 'qualifiziert'
  label         TEXT NOT NULL,           -- Anzeigename, z.B. 'Qualifiziert'
  color         TEXT NOT NULL DEFAULT '#6B7280',
  order_index   INTEGER NOT NULL DEFAULT 0,
  is_qualified  INTEGER NOT NULL DEFAULT 0,   -- 1 = Terminal "Qualifiziert"
  is_disqualified INTEGER NOT NULL DEFAULT 0, -- 1 = Terminal "Disqualifiziert"
  created_at    TEXT NOT NULL,
  UNIQUE(workspace_id, name)
);
```

**Default-Seed** (einmalig beim ersten Start via `seed_lead_stages` Command, idempotent):

| Label | Color | Flag |
|---|---|---|
| Neu | #60a5fa | — |
| Kontaktiert | #fbbf24 | — |
| Warm | #4ade80 | — |
| Qualifiziert | #D0FC69 | `is_qualified=1` |
| Disqualifiziert | #6B7280 | `is_disqualified=1` |

### `lead_status` Feld

`accounts.lead_status` bleibt ein freier Text-String. Er enthält ab sofort den `name`-Wert der jeweiligen `lead_stage` (z.B. `'neu'`, `'warm'`, `'qualifiziert'`). Die bestehenden Werte `new`, `attempted`, `warm` werden per Migration auf die neuen Default-Stage-Namen gemappt.

**Migration v19 SQL:**
```sql
-- Neue Tabelle
CREATE TABLE IF NOT EXISTS lead_stages ( ... );

-- Bestehende lead_status-Werte migrieren
UPDATE accounts SET lead_status = 'neu'         WHERE lead_status = 'new';
UPDATE accounts SET lead_status = 'kontaktiert' WHERE lead_status = 'attempted';
UPDATE accounts SET lead_status = 'warm'        WHERE lead_status = 'warm';
UPDATE accounts SET lead_status = 'qualifiziert'   WHERE lead_status = 'call_booked';
UPDATE accounts SET lead_status = 'disqualifiziert' WHERE lead_status = 'lost_reengage';
```

---

## 2 — Backend (Rust)

### Neue Dateien

**`src-tauri/src/db/lead_stage.rs`**
- `get_lead_stages(conn, workspace_id) -> Vec<LeadStage>`
- `upsert_lead_stage(conn, payload) -> LeadStage`
- `delete_lead_stage(conn, id, workspace_id) -> Result` (Fehler wenn `is_qualified` oder `is_disqualified`)
- `reorder_lead_stages(conn, workspace_id, ids: Vec<String>) -> Result`
- `seed_lead_stages(conn, workspace_id) -> Result` (idempotent, legt Default-Stages an falls keine existieren)

**`src-tauri/src/commands/lead_stage.rs`**
- `get_lead_stages(workspace_id)`
- `upsert_lead_stage(payload)`
- `delete_lead_stage(id, workspace_id)`
- `reorder_lead_stages(workspace_id, ids)`
- `seed_lead_stages(workspace_id)`

Alle Commands in `commands/mod.rs` und `main.rs` registrieren.

`seed_lead_stages` wird in `App.tsx` beim Start aufgerufen (wie `PipelineService.seed`).

---

## 3 — Frontend

### Neue/geänderte Dateien

```
src/types/lead.types.ts                   ← LeadStage-Type hinzufügen
src/services/lead-stages.service.ts       ← NEU
src/store/lead-stages.store.ts            ← NEU
src/components/leads/
  ├─ LeadStagesManager.tsx                ← NEU (analog StagesManager.tsx)
  ├─ QualifyModal.tsx                     ← NEU
  └─ DisqualifyModal.tsx                  ← NEU
src/routes/LeadsRoute.tsx                 ← dynamische Columns, neue Modal-Trigger
src/App.tsx                               ← seed_lead_stages beim Start
```

### `LeadStage` Type

```ts
export interface LeadStage {
  id: string
  workspaceId: string
  name: string
  label: string
  color: string
  orderIndex: number
  isQualified: boolean
  isDisqualified: boolean
  createdAt: string
}
```

### `LeadStagesManager`

Dropdown-Popover (identisches Pattern wie `StagesManager.tsx` bei Pipeline):
- Öffnet via "Stages"-Button im Lead-Board-Header (neben "+ Lead")
- Drag-to-Reorder via `@dnd-kit/sortable`
- Farbwahl (8 Preset-Colors)
- Rename via Inline-Input (on blur speichern)
- Trash-Icon nur bei nicht-locked Stages (`!is_qualified && !is_disqualified`)
- Locked-Stages zeigen ein Schloss-Icon statt Trash

### `LeadsRoute` — dynamische Columns

```ts
// Statt hardcoded COLUMNS:
const stages = useLeadStagesStore(s => s.stages)

// boardLeads = alle Leads deren lead_status NICHT is_disqualified und reEngageDate == null
const boardLeads = useMemo(
  () => allLeads.filter(l => {
    const stage = stages.find(s => s.name === l.leadStatus)
    return !stage?.isDisqualified && l.reEngageDate == null
  }),
  [allLeads, stages]
)

// Columns = alle Stages in order_index-Reihenfolge
// Terminal-Stages sind Drop-only (keine eigenen Karten), lösen Modal aus
```

**handleDragEnd:**
```ts
if (targetStage.isQualified) {
  setPendingQualify(lead)   // öffnet QualifyModal
  return
}
if (targetStage.isDisqualified) {
  setPendingDisqualify(lead) // öffnet DisqualifyModal
  return
}
bulkUpdate({ ids: [lead.id], status: targetStage.name }, workspaceId)
```

---

## 4 — QualifyModal

Erscheint wenn Lead in `Qualifiziert`-Spalte gezogen wird.

```
┌─────────────────────────────────┐
│  Termin buchen                  │
│  Max Mustermann                 │
│                                 │
│  Termin am:                     │
│  [________________] (optional)  │
│                                 │
│  [Zurück]   [In Pipeline →]     │
└─────────────────────────────────┘
```

- Datum-Feld optional — wird als Notiz auf dem Deal-Activity gesetzt (falls angegeben)
- "In Pipeline →" → `convertToDeal(leadId)` → Toast "Deal angelegt — {Name}" mit "→ Pipeline öffnen"-Button
- Lead verschwindet aus dem Board (wird zu Kunde)
- "Zurück" → Modal schließen, Lead bleibt in vorheriger Stage (kein State-Update)

---

## 5 — DisqualifyModal

Erscheint wenn Lead in `Disqualifiziert`-Spalte gezogen wird.

```
┌──────────────────────────────────┐
│  Wann re-engagen?                │
│  Max Mustermann                  │
│                                  │
│  [30 Tage]  [60 Tage]  [90 Tage]│
│                                  │
│  Datum: [__________________]     │
│                                  │
│  [Zurück]    [Disqualifizieren]  │
└──────────────────────────────────┘
```

- Klick auf 30/60/90 → füllt Datum-Feld automatisch (heute + N Tage)
- Freie Datumseingabe möglich
- "Disqualifizieren" → `bulkUpdate({ status: 'disqualifiziert', reEngageDate })` → Lead wandert in Re-Engage-Sidebar
- "Zurück" → kein State-Update, Lead bleibt in vorheriger Stage

---

## 6 — Re-Engage-Sidebar (unverändert)

Die bestehende `ReEngageSidebar`-Komponente bleibt unverändert. Sie zeigt alle Leads mit `reEngageDate != null`, sortiert nach Datum. Kein Umbau nötig.

---

## 7 — App.tsx Seed

```ts
// wie PipelineService.seed():
useEffect(() => {
  if (activeWorkspaceId) {
    LeadStagesService.seed(activeWorkspaceId)
  }
}, [activeWorkspaceId])
```

---

## 8 — Akzeptanzkriterien

- [ ] Default Lead-Stages werden beim ersten Start angelegt (Neu/Kontaktiert/Warm/Qualifiziert/Disqualifiziert)
- [ ] "Stages"-Button öffnet Dropdown-Popover mit Drag-Reorder, Farbe, Rename
- [ ] Qualifiziert + Disqualifiziert haben kein Trash-Icon (Schloss statt Trash)
- [ ] Neue Custom-Stage anlegen → erscheint sofort im Board
- [ ] Custom-Stage löschen → verschwindet aus Board, betroffene Leads bleiben erhalten
- [ ] Drag in Qualifiziert → QualifyModal erscheint, Lead bleibt in Stage bis Bestätigung
- [ ] QualifyModal "In Pipeline →" → Deal angelegt, Toast, Lead weg vom Board
- [ ] QualifyModal "Zurück" → kein State-Update
- [ ] Drag in Disqualifiziert → DisqualifyModal erscheint
- [ ] 30/60/90-Buttons füllen Datum-Feld
- [ ] DisqualifyModal "Disqualifizieren" → Lead in Re-Engage-Sidebar, weg vom Board
- [ ] DisqualifyModal "Zurück" → kein State-Update
- [ ] Bestehende `lead_status`-Werte korrekt migriert (new→neu, attempted→kontaktiert etc.)
- [ ] Re-Engage-Sidebar zeigt weiterhin korrekt alle Leads mit reEngageDate

---

## 9 — Out of Scope

- Stages für Leads workspace-übergreifend teilen
- Stage-basierte Filter / Smart Lists
- Bulk-Aktionen mit Stage-Terminal (nur Einzelkarte)
- Farb-Gradient oder Icon pro Stage (nur Dot-Color wie bei Pipeline)
