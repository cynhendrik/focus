# Projekt-Modul-Ausbau — Etappe 4: Team & Kapazität

## Kontext

Etappe 1-3 (Datenmodell + Timeline-Übersicht, Detail-Kopf + Tabs + Cockpit, Phasen-Tab mit Gates + Deliverables) sind gemergt (PR #5, #6, #7). Der Phasen-Tab zeigt seit Etappe 3 eine aufklappbare Liste von Phasenkarten mit Deliverables-Checkliste und Gate-Workflow -- aber nirgends steht, **wer** an einer Phase arbeitet.

Es existiert bereits ein Mitglieder-Verzeichnis (`profiles` + `workspace_members` in Supabase, gebündelt in `useMembersStore()`), das für Aufgaben-Zuweisung (`Todo.assignee`, `AssigneePicker`) genutzt wird. Projektphasen haben aktuell kein Zuweisungsfeld.

Diese Etappe (4 von 6) fügt Team-Zuweisung pro Phase hinzu: mehrere Mitglieder pro Phase, rein informativ.

## Ziel dieser Etappe

- Neues Datenfeld `assignee_ids` pro Phase (JSON-Liste von `user_id`-Strings, mehrere Personen möglich).
- Neue Backend-Funktion: Zuweisungen einer Phase aktualisieren (komplette Liste ersetzen, wie bei `update_deliverables`).
- Phasen-Tab: in der aufgeklappten Phasenkarte werden zugewiesene Mitglieder als Namens-Chips angezeigt, mit Entfernen-Icon pro Chip und einem "+ Person"-Button, der ein Dropdown mit allen Workspace-Mitgliedern öffnet.

**Explizit nicht Teil dieser Etappe:**
- Kapazitäts-/Auslastungs-Berechnung (bräuchte eine Stunden-Datengrundlage, die nirgends existiert -- ein "wie ausgelastet ist Person X" ohne echte Zeiterfassung wäre eine Value-Lüge).
- Stunden gegen Retainer-Budget verfolgen (bräuchte `TimeEntry.projectId`, eigene spätere Runde).
- "Meine Phasen"-Filter in der Projekt-Übersicht/Timeline.
- Sichtbarkeit in "Mein Tag" (koppelt an bestehende Mein-Tag-Logik, größerer Eingriff).
- Avatar-/Farb-Feld im Mitgliederprofil -- Namens-Chips brauchen kein neues Datenfeld auf `MemberProfile`.
- Beschränkung der Zuweisung auf die aktuell aktive Phase -- wie beim Gate-Workflow (Etappe 3) ist jede Phase unabhängig von Reihenfolge/Status zuweisbar.
- Timeline- oder Cockpit-Sichtbarkeit der Zuweisung (bleibt auf den Phasen-Tab beschränkt).

## Design-Entscheidungen

**`assignee_ids` als JSON-Spalte, nicht eigene Zuordnungs-Tabelle.** Folgt exakt dem `deliverables`-Muster aus Etappe 3: `assignee_ids TEXT NOT NULL DEFAULT '[]'`, Rust reicht den String roh durch (nur Boundary-Validierung auf gültiges JSON), TypeScript parst/serialisiert im Mapper. Eine eigene Tabelle mit referenzieller Integrität wäre für eine reine Informationsliste (kein Datum, keine Rolle pro Zuweisung, keine Historie) unnötiger Aufwand -- gleiche Abwägung wie bei Deliverables.

**Komplettes Ersetzen der Liste, kein Hinzufügen/Entfernen als eigene Backend-Operation.** Wie bei `update_deliverables`: das Frontend hält die aktuelle Liste im State, fügt/entfernt lokal ein Element und schickt die komplette neue Liste an eine einzige `update_assignees`-Funktion. Kein `add_assignee`/`remove_assignee` als separate Commands -- unnötige API-Fläche für eine simple Liste.

**Keine Kapazitäts-Vortäuschung.** Diese Etappe zeigt ausschließlich "wer ist zugewiesen", keine abgeleiteten Kennzahlen ("Auslastung: 80%") ohne echte Datengrundlage. Das entspricht der bereits etablierten Linie aus Etappe 2 (Budget-/Stimmungs-Ampel bewusst `'unknown'` statt erfundenem `'ok'`).

**Ehrlicher Hinweis zu lokalen Workspaces:** In einem rein lokalen (nicht geteilten) Workspace enthält `useMembersStore().members()` nur die eigene Person. Die Zuweisungsfunktion bleibt dort technisch funktional (man kann sich selbst zuweisen), ist aber praktisch wenig nützlich, bis der Workspace geteilt wird. Das ist eine ehrliche Einschränkung der Funktion selbst, kein Bug und keine Value-Lüge -- wird nicht künstlich versteckt oder umgangen.

## Datenmodell

### `project_phases` — additive Migration (SQLite v40 / Supabase 0029)

| Spalte | Typ | Default | Bedeutung |
|---|---|---|---|
| `assignee_ids` | TEXT | `'[]'` | JSON-Array von `user_id`-Strings (Workspace-Mitglieder) |

### TypeScript

`ProjectPhase.assigneeIds: string[]` (bereits geparst -- Mapper macht `JSON.parse(row.assignee_ids ?? '[]')` beim Lesen, analog zu `parseDeliverables`, mit gleicher defensiver Behandlung von Array- und String-Form für den lokalen/Cloud-Unterschied).

### Rust (`src-tauri/src/db/project_phase.rs`)

- `ProjectPhase.assignee_ids: String` (roh, unverändert durchgereicht).
- `update_assignees(conn, id, project_id, assignee_ids_json: String) -> Result<ProjectPhase, AppError>`: validiert nur, dass `assignee_ids_json` gültiges JSON ist (`serde_json::from_str::<serde_json::Value>`), sonst `AppError::Validation`. Speichert den String roh -- identisches Muster zu `update_deliverables`.

## UI

### Phasen-Tab -- neuer Bereich in der aufgeklappten Phasenkarte

Dritter Bereich neben Deliverables-Checkliste und Gate-Bereich (Layout: drei Spalten oder Deliverables/Gate oben, Team-Zeile darunter -- wird beim Implementierungsplan anhand des bestehenden Grids entschieden):

- Namens-Chips der zugewiesenen Mitglieder (Klarname via `useMembersStore().nameOf(userId)`), je mit kleinem "×"-Icon zum Entfernen.
- "+ Person"-Button öffnet ein Dropdown mit allen Workspace-Mitgliedern (`useMembersStore().members()`), die noch nicht zugewiesen sind. Klick auf einen Eintrag fügt ihn zur Liste hinzu und schließt das Dropdown.
- Keine zugewiesenen Mitglieder: neutraler Hinweistext ("Noch niemand zugewiesen."), kein erfundener Platzhalter-Name.

### Cockpit-Tab

Unverändert -- keine Team-Information im Cockpit in dieser Etappe.

## Testing

- Rust-Unit-Tests (`db/project_phase.rs`): `update_assignees` (Erfolg mit gültigem JSON, Ablehnung bei ungültigem JSON), Migrations-Backfill-Test (`assignee_ids = '[]'` für Bestandsphasen).
- Frontend-Unit-Tests: Mapper-Parsing/Serialisierung von `assigneeIds` (String- und Array-Form, analog zu `parseDeliverables`), neue Store-Action (`updateAssignees`).
- Komponenten-Tests: Mitglieder-Chips anzeigen, Mitglied über Dropdown hinzufügen, Mitglied entfernen, leerer Zustand zeigt Hinweistext.

## Offene Punkte für spätere Etappen

- Kapazitäts-/Auslastungs-Berechnung auf Basis echter Zeiterfassung -- eigene Initiative, nicht Teil dieses Ausbaus.
- Stunden gegen Retainer-Budget -- bräuchte `TimeEntry.projectId`.
- "Meine Phasen"-Filter / Mein-Tag-Integration -- wenn gewünscht, eigener Zusatzpunkt.
