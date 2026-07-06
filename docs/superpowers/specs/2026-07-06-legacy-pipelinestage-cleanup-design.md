# Legacy `Lead.pipelineStage`-Cleanup + Nav-Badge-Fix

## Kontext

CRM-Audit 2026-07-04 (siehe Memory `crm-audit-2026-07-04`) markierte `Lead.pipelineStage` + die Selektoren `newLeads/warmLeads/attemptedLeads/lostLeads` als "stale". Code-Verifikation (2026-07-06) zeigt: es ist schlimmer als vermutet.

`Lead.pipelineStage` (Werte `inbox/waiting_reply/replied/lost/won`) ist ein eigenständiges, älteres Konzept — komplett getrennt vom heute live genutzten Lead-Stage-System (`Lead.leadStatus` + `useLeadStagesStore`, das `LeverageLeadsRoute` tatsächlich rendert). Der einzige Rust-Befehl, der `pipelineStage` je ändern könnte (`update_lead_stage` / `db::lead::update_pipeline_stage`), hat **keinen Aufrufer** im Frontend (`leads.service.ts:42` exportiert `updateLeadStage`, aber niemand importiert es). Für jeden echten Lead bleibt `pipelineStage` daher für immer auf `'inbox'` eingefroren.

Das ist nicht nur toter Code: `NavSidebar.tsx:66` zeigt das Leads-Badge in der Nav über `useLeadsStore(s => s.newLeads().length)` an — `newLeads()` filtert auf `pipelineStage === 'inbox'`. Da praktisch jeder Lead ewig auf `'inbox'` steht, zeigt das Badge heute effektiv **"Anzahl aller Leads"** statt "Anzahl neuer/unbearbeiteter Leads". Ein echter, bisher unbemerkter Bug.

## Scope

**Nur TypeScript/React.** Rust-Command `update_lead_stage` + DB-Spalte `accounts.pipeline_stage` bleiben unangetastet:
- Non-destruktiv: Rust fällt bei fehlendem `pipeline_stage`-Feld im Payload bereits auf `"inbox"` zurück (`db/lead.rs:89`), kein Migrations-Risiko.
- `Option<String>`-Felder werden von serde bei fehlendem Schlüssel automatisch als `None` deserialisiert — das Weglassen des Feldes im JS-Payload ist wire-kompatibel, keine Rust-Änderung nötig.
- Verhalten für bestehende Daten ändert sich nicht: die Spalte liest/schreibt schon heute nur `'inbox'`.

## Änderungen

1. **`src/types/lead.types.ts`** — `PipelineStage`-Typ-Export entfernen; `pipelineStage`-Feld aus `Lead`- und `UpsertLeadPayload`-Interface entfernen.
2. **`src/store/leads.store.ts`** — Interface- und Implementierungs-Einträge für `newLeads`, `attemptedLeads`, `warmLeads`, `lostLeads` entfernen.
3. **`src/components/layout/NavSidebar.tsx`** — Badge-Fix:
   - `useLeadStagesStore` importieren.
   - Offene Stages ableiten wie in `LeverageLeadsRoute.tsx:199` (`stages.filter(s => !s.isQualified && !s.isDisqualified)`).
   - Badge zählt `leads.filter(l => l.leadStatus === openStages[0]?.name).length` — Leads in der ersten offenen Stage (kommt der ursprünglichen Bedeutung "neu/unbearbeitet" am nächsten).
   - Falls `openStages` leer ist (keine Stages geladen/konfiguriert), Badge zeigt `undefined` (kein Badge) statt Crash — gleiches Muster wie bestehendes `badge={openDealCount || undefined}`.
4. **`src/data/accounts.mapper.ts`** — `pipelineStage` aus Lese-Mapper (Zeile ~13) und Schreib-Mapper (Zeile ~45) entfernen.
5. **`src/lib/lead-payload.ts`** — `pipelineStage: lead.pipelineStage` aus `leadToUpsertPayload` entfernen; Doc-Kommentar-Referenz auf `pipeline_stage→"inbox"` in der Fallback-Erklärung kann stehen bleiben (beschreibt weiterhin akkurat, was der Rust-Layer tut) oder wird sprachlich leicht angepasst, falls sie nach der Änderung missverständlich wirkt.
6. **Tests/Fixtures nachziehen** (kompilieren + inhaltlich sauber, kein `pipelineStage` mehr in Testdaten):
   - `src/data/accounts.mapper.test.ts`
   - `src/store/leads.store.test.ts` (inkl. Entfernen von Tests, die ausschließlich die 4 gelöschten Selektoren prüfen)
   - `src/lib/lead-payload.test.ts`
   - `src/lib/ai/corra-intelligence.test.ts`
   - `src/lib/tour/fixtures.ts`

## Akzeptanzkriterien

- `PipelineStage`-Typ und `pipelineStage`-Feld existieren nirgends mehr im TS-Code.
- `newLeads/attemptedLeads/warmLeads/lostLeads` existieren nirgends mehr.
- Leads-Badge in der Nav zeigt die Anzahl der Leads in der ersten offenen Stage, nicht mehr "alle Leads".
- `npx vitest run`, `npx tsc --noEmit`, `cargo test` bleiben grün (Rust unverändert, sollte automatisch grün bleiben).
- Keine neuen Tauri-Payload-Felder nötig; Wire-Format zu Rust bleibt kompatibel (Feld einfach weggelassen).

## Nicht im Scope

- Rust-Command `update_lead_stage` / `db::lead::update_pipeline_stage` (0 Aufrufer, aber Entscheidung: unangetastet lassen).
- DB-Spalte `accounts.pipeline_stage` (bleibt bestehen, enthält weiterhin nur `'inbox'`-Werte).
- Die übrigen CRM-P2-Punkte (Lead-Mail-Compose, KORA-Newcomer-Klassifizierung) — eigene Spec-Zyklen.
