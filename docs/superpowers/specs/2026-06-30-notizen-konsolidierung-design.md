# Notizen-Konsolidierung — Design-Spec (1b, Teil A: Notizen)

**Datum:** 2026-06-30
**Status:** Entwurf zur Freigabe
**Kontext:** Audit 2026-06-30 — „verschluckte Notizen". Teil B (Follow-ups) ist eine eigene Spec.

---

## Ziel (eine Zeile)

Eine zu einem Kunden erfasste Notiz erscheint **immer** im **Verlauf** des Kunden — egal über welchen Eingang sie erfasst wurde — **ohne** den eigenständigen **Notizen-Tab** aufzugeben.

## Das Problem (verifiziert am Code)

Es gibt zwei getrennte Notiz-Speicher mit **unterschiedlichem Schema**:

| | `note_entries` (Notizen-Tab) | `activities` Typ `note` (Verlauf) |
|---|---|---|
| Felder | Ordner, Tags, Rich-Text (HTML), Stickies | `note_type`, `waiting_reply`, `pinned`, Body |
| Store | `useNotesModuleStore` | `useNotesStore` |
| Gateway | `NotesModuleGateway` (Tabelle `note_entries`) | `ActivitiesGateway` (Tabelle `activities`) |
| Schreibt rein | Quick-Capture (⌘⇧N) `QuickCaptureModal.tsx:120`, `GlobalQuickComposer.tsx:281`, Notizen-Tab `CustomerNotesPane.tsx:445` | Verlauf-Notiz `InfosFeed.tsx:165`, `WorkflowPane.tsx:19` |
| Liest | `CustomerNotesPane` (Tab „Notizen", `CustomerRoute.tsx:177`) | `InfosFeed`/Verlauf (`CustomerRoute.tsx:180`), `InsightsStrip`, `PulseBar`, `ActivityStream` |

**Folge:** Eine Quick-Capture-Notiz (`note_entries`, mit `accountId`) erscheint im Tab „Notizen", **nicht** im Tab „Verlauf" (der `activities` liest). Wer in den Verlauf schaut, denkt, die Notiz sei weg.

Die beiden Systeme sind **legitim verschieden**: eine leichte CRM-Timeline-Notiz mit Flags (angeheftet / „warte auf Antwort") vs. eine Dokument-Notiz mit Ordnern/Rich-Text. Sie sollen **nicht** verschmolzen werden — der eigentliche Fehler ist nur die **Unsichtbarkeit** der Dokument-Notiz im Verlauf.

## Verworfene Alternative: physisches Spiegeln (Dual-Write)

Notizen aus `note_entries` zusätzlich als `activities`-Zeile schreiben. **Verworfen**, weil:
- Schema-Mismatch (`note_entries` kennt kein `pinned`/`waiting_reply`; `activities` kennt keine Ordner/Tags/Stickies) → Zusammenzwingen ist verlustbehaftet.
- Erfordert Sync bei jedem Anlegen/Ändern/Löschen, eine Verknüpfung (`note_entry_id`), Dedup gegen Realtime, einen Backfill **und** eine Rust-Änderung an `create_activity`.
- Hoher Aufwand + große Fehlerfläche für ein reines Anzeige-Problem.

## Gewählter Ansatz: Read-Merge (der Verlauf liest beide Quellen)

`note_entries` bleibt die **einzige Quelle** für Dokument-Notizen (Notizen-Tab unverändert). Der **Verlauf** lädt die `note_entries` des Kunden **zusätzlich** und mischt sie chronologisch in den Aktivitäts-Feed, dargestellt als eigenes, klar gelabeltes Element **„📝 Notiz"**, das beim Klick die Notiz im **Notizen-Tab** öffnet.

**Vorteile:** keine Duplizierung, keine Datenmigration, keine Schema-Änderung, kein Rust-Eingriff, nichts an Altdaten. Die CRM-Timeline-Notiz (`activities` Typ `note`) bleibt als eigener, leichterer Element-Typ erhalten.

### Datenfluss (nachher)

```
Notizen-Tab (CustomerNotesPane) ── liest/schreibt ──> note_entries  (Quelle Dokument-Notizen)
Quick-Capture / GlobalQuickComposer ─ schreibt ─────> note_entries
                                                          │
Verlauf (TimelinePane/ActivityStream) ── liest ──────────┤ (NEU: als "📝 Notiz"-Element, Klick → Notizen-Tab)
                                       ── liest ──> activities (Ereignisse + CRM-Notiz Typ 'note', unverändert)
```

## Betroffene Stellen

- **`TimelinePane.tsx` / `ActivityStream.tsx`** — neue Quelle „Dokument-Notizen": `note_entries` des Kunden laden (via `useNotesModuleStore.loadForAccount` bzw. dessen `entries`) und in die zeitlich sortierte Feed-Liste mischen. Neuer Element-Typ `note_doc` mit eigenem Icon/Label und Klick-Handler „im Notizen-Tab öffnen" (setzt den Kunden-Tab auf `notizen` und selektiert die Notiz).
- **`ActivityStream`** kennt heute Element-„kinds" (`ActivityStream.tsx:70`). Wir ergänzen den `note_doc`-kind in der Render-Logik. `activities` Typ `note` (CRM-Notiz) bleibt unangetastet.
- **Kein** Schreibpfad wird umgeleitet. Quick-Capture/Composer schreiben weiter `note_entries`; die Verlauf-eigene „Notiz hinzufügen"-Aktion (`InfosFeed`) bleibt die CRM-Timeline-Notiz.
- **Daten/Realtime:** `note_entries` wird in geteilten Workspaces bereits per Realtime nachgeladen (`useWorkspaceRealtime.ts` Tabellen `note_entries`/`note_folders`). Der Verlauf muss bei diesen Events ebenfalls neu mischen — sicherstellen, dass `TimelinePane` auf `note_entries`-Änderungen reagiert (Store-Selektor genügt, da `useNotesModuleStore.entries` ohnehin aktualisiert wird).

## Randfälle & Entscheidungen

1. **Sortierung:** Mischung nach `createdAt` (Dokument-Notiz) bzw. `created_at` (Aktivität), absteigend — konsistent mit bestehender Verlauf-Sortierung.
2. **Performance:** `note_entries` werden ohnehin pro Kunde geladen (Notizen-Tab). Der Verlauf nutzt denselben geladenen Store-Stand → kein Extra-Query, nur ein Merge im Render.
3. **Anzeige im Verlauf:** Titel + Textauszug (HTML → Plaintext, gekürzt) als „📝 Notiz". Kein Bearbeiten im Verlauf — Klick öffnet die Notiz im Notizen-Tab (dort wird editiert). So bleibt `note_entries` die einzige Schreibquelle.
4. **Altdaten:** unangetastet. Bestehende `activities`-Notizen bleiben CRM-Timeline-Notizen; bestehende `note_entries` erscheinen ab sofort auch im Verlauf — rückwirkend, da Read-Merge.
5. **Doppelte Anzeige?** Ausgeschlossen: `activities` Typ `note` und `note_entries` sind disjunkte Quellen; eine Notiz liegt immer nur in genau einer.

## Offene Entscheidung für dich

- **Verlauf-Element der Dokument-Notiz:** nur Auszug + Klick-zum-Öffnen (empfohlen, schlank), **oder** zusätzlich Inline-Aktionen (anheften, löschen) direkt im Verlauf? Empfehlung: **nur Auszug + Klick** — Bearbeiten bleibt im Notizen-Tab, hält die Quelle sauber.

## Nicht in dieser Spec (Out of Scope)

- **Follow-ups** (4 konkurrierende Konzepte) → eigene Spec „1b Teil B".
- Zusammenlegen der CRM-Timeline-Notiz mit der Dokument-Notiz (bewusst getrennt belassen).
- Dass KORA-Kontext / „letzte Aktivität" Dokument-Notizen mitzählen — späterer, separater Schritt, falls gewünscht.

## Akzeptanzkriterien

1. Eine per Quick-Capture (⌘⇧N) zu Kunde X erfasste Notiz erscheint danach **sowohl** im Notizen-Tab **als auch** im Verlauf von Kunde X.
2. Im Verlauf ist sie klar als „📝 Notiz" erkennbar (kein getarntes Ereignis) und öffnet per Klick den Notizen-Tab.
3. CRM-Timeline-Notizen (angeheftet / „warte auf Antwort") funktionieren unverändert; `InsightsStrip`/`PulseBar` unverändert.
4. Keine doppelten Einträge; bestehende Daten unverändert; `tsc` clean, Tests grün.
