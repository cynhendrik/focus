# Geld-Kreislauf / Mahnwesen — Design

**Datum:** 2026-06-23
**Branch-Kontext:** feature/erechnung-2026-06-21
**Status:** freigegeben (Design), bereit für Implementierungsplan

## Problem

Der „Geld-Kreislauf" (Rechnung → überfällig → Mahnung → Zahlung) ist zu ~70 % gebaut,
schließt sich aber nicht von selbst. Zwei konkrete Bruchstellen:

1. **Stufen-Bug (Kernproblem):** Die Mahnstufe wird in `getDunningState`
   (`src/hooks/useOverdueTaskSync.ts`) aus *abgeschlossenen* `send_reminder`-To-dos
   abgeleitet. Aber: der Hook `useOverdueTaskSync()`, der diese To-dos anlegen würde,
   ist **nirgends gemountet** (nur `getDunningState` wird vom `MahnwesenPanel` genutzt).
   Es entstehen also überhaupt keine `send_reminder`-To-dos, und das Panel legt beim
   Versand auch keins an → die abgeleitete Stufe steht für *jede* überfällige Rechnung
   dauerhaft auf 0 („Zahlungserinnerung"), der Cooldown startet nie, der Kreislauf
   dreht nicht weiter.
2. **Kein Anstoß:** Eine Mahnung geht nur raus, wenn der Nutzer aktiv den
   Finanzen→Mahnwesen-Tab öffnet und „Senden" klickt. Es fehlt ein zentraler Nudge.

Zusätzlich fehlen Mahngebühren und ein expliziter „eskaliert"-Zustand.

## Ausgangslage (verifiziert am Code)

- **Vorhanden & funktionsfähig:** `MahnwesenPanel.tsx` (gemountet unter
  `FinanceRoute` Tab `mahnwesen`, **nicht** tot) mit Einzel- + `sendAll`-Versand;
  echter SMTP-Versand (`mail.service.ts` → Tauri `email_send`) inkl. PDF-Anhang;
  KORA-Mahntext (`generateCorraDraft`); Überfälligkeits-Ableitung (`isOverdue`,
  GoBD-sauber nie persistiert); `getDunningState` + Cooldowns 7/14/21 vorhanden, aber
  der erzeugende Hook `useOverdueTaskSync()` ist ungenutzt/nicht gemountet (→ keine
  Reminder-To-dos, Stufe bleibt 0);
  Zahlungserfassung + Auto-`paid` bei 100 % (`payment.rs`); cloud-fähig über
  `finance.gateway.ts` (Supabase wenn shared, sonst lokal).
- **Datenmodell:** `Invoice.status: 'draft' | 'open' | 'paid' | 'overdue' | 'cancelled'`
  (`src/types/finance.types.ts`). `Payment` separat. `Todo` hat `tags: string[]`,
  `notes`, aber **kein** Metadata-JSON-Feld.
- **Dunning-Cadence:** `DUNNING_COOLDOWN_DAYS = {0:7, 1:14, 2:21}`, `MAX_AUTO_LEVEL = 2`.

## Getroffene Entscheidungen

| Frage | Entscheidung |
|-------|--------------|
| Automatik-Grad | **Nudge + 1 Klick** — App stößt an, Mensch bestätigt |
| Scope | **Automatik + gestaffelte Mahnpauschale** (keine Verzugszinsen) |
| Gebühren-Modell | **gestaffelt, konfigurierbar** — Default 0 / 5 / 10 € (Stufe 0/1/2) |
| Gebühren-Tracking | **separat am Mahnvorgang**, keine Mutation finalisierter Rechnungen (GoBD) |
| Nudge-Ort | **Karte auf „Heute"** → Review-Liste → Alle senden / einzeln |
| Endstufe | nach 2. Mahnung unbezahlt → **„eskaliert — braucht Entscheidung"**, kein Auto-Mahnen |
| Architektur | **Ansatz A** — bestehende Engine wiederverwenden + Stufen-Bug fixen (keine neue Tabelle) |

## Datenfluss

```
Rechnung offen + überfällig (isOverdue)
  └─► Dunning-Engine (getDunningState): Stufe N, phase = due | cooldown | escalated
       └─► Heute-Karte (DunningNudgeCard): "N Mahnungen fällig · Σ Betrag"
            └─► Review (DunningReviewModal): Kunde · Stufe · Tage · Betrag inkl. Gebühr · Text-Vorschau
                 └─► [Alle senden]/einzeln → dunning.service.sendReminder(invoice, level)
                      ├─ KORA-Text + Rechnungs-PDF (wie bisher)
                      ├─ SMTP-Versand (wie bisher)
                      └─ ✅ abgeschlossenes send_reminder-To-do anlegen + fee:<cent>-Tag  ← BUGFIX
                           └─► Stufe zählt hoch, Cooldown startet
  └─► Zahlung erfasst → status = paid → Kreislauf geschlossen
  └─► nach 2. Mahnung unbezahlt → phase = escalated → "Braucht Entscheidung"
```

Single Source of Truth bleibt die Ableitung (Überfälligkeit + Stufe). Neu: der Versand
**protokolliert** den Schritt, damit die Ableitung der Realität entspricht.

## Komponenten

### `src/services/dunning.service.ts` (neu)
Zentrale, testbare Mahn-Logik — aus `MahnwesenPanel` extrahiert und erweitert.

- `sendReminder(invoice, level)`:
  Kontakt-Mail laden → KORA-Text → Rechnungs-PDF (optional) → `MailService.sendEmail`
  → **bei Erfolg:** ein **abgeschlossenes** `send_reminder`-To-do anlegen
  (`status:'done'`, `bucket:'done'`, `sourceRef: invoice.id`) mit dem berechneten
  Gebühren-Snapshot als Tag `fee:<cent>`. Das ist das Protokoll-Artefakt, aus dem
  `getDunningState` die Stufe ableitet. Wirft bei Versand-Fehler (dann kein To-do).
- `dueReminders(invoices, todos, accounts, config)`: Selektor → Liste der jetzt
  fälligen Mahnungen (`phase === 'due'`), sortiert (höchste Stufe zuerst, dann älteste).
- `escalatedInvoices(...)`: Selektor → Rechnungen mit `phase === 'escalated'`.
- `dunningFee(level, config)`: Gebühr der Stufe (Cent).
- `outstandingTotal(invoice, payments, sentLevels, config)`:
  Rechnungsrest (`remaining`) + Summe der für bereits gesendete Stufen berechneten Gebühren.

### `getDunningState` (erweitert, in `useOverdueTaskSync.ts`)
- Neues Feld `phase: 'due' | 'cooldown' | 'escalated'`.
  `canCreate` bleibt erhalten (= `phase === 'due'`), für Abwärtskompatibilität der Tests.
- Ab Stufe ≥ `MAX_AUTO_LEVEL + 1` → `phase = 'escalated'`.

### `useOverdueTaskSync` (toter Hook — wird entfernt)
- Der Hook `useOverdueTaskSync()` ist nicht gemountet und legt keine To-dos an.
  Er wird **entfernt** (YAGNI). `getDunningState`, `DunningState` und
  `shouldCreateReminderTask` bleiben in der Datei (vom Panel + Test genutzt) und
  werden um `phase` erweitert.
- **Sichtbarkeit (gelöst durch Design, kein Ausfiltern nötig):** Es entstehen nie
  *offene* `send_reminder`-To-dos — der `dunning.service` legt beim Versand nur
  *abgeschlossene* an. Alle „Heute"-Listen filtern `status !== 'done'`, sehen diese
  also nie. Eine Karte ist die einzige sichtbare Oberfläche; der Stufen-Trail
  (abgeschlossene To-dos) bleibt intakt. Keine der vielen Today-Filter-Stellen
  (NavSidebar, Widgets, CyPlanPanel …) muss angefasst werden.

### UI
- `DunningNudgeCard.tsx` (neu): auf dem Heute-Dashboard; zeigt Anzahl + Summe fälliger
  Mahnungen; nur sichtbar wenn > 0; Klick öffnet Review.
- `DunningReviewModal.tsx` (neu): Liste je Mahnung (Kunde, Stufe, Tage überfällig,
  Betrag inkl. Gebühr, aufklappbare Text-Vorschau); pro Zeile [Senden]/[Überspringen],
  oben [Alle senden]. Zeilen ohne Kunden-Mail klar als „nicht sendbar" markiert.
- `MahnwesenPanel.tsx`: bleibt als Detailansicht, nutzt jetzt `dunning.service`
  (eigene Sende-Logik entfällt). Zeigt zusätzlich den „eskaliert"-Bereich.
- Settings → Finanzen: drei Gebühren-Felder (Stufe 0/1/2).

### Settings / Persistenz
- Gebühren-Defaults als **`dunningFees?: number[]`** in `CompanyProfile` (Euro, Stufe
  0/1/2; Default `[0, 5, 10]`). Persistiert über das vorhandene `saveProfile`
  (`JSON.stringify(profile)` → `CompanyGateway.update({ profile })`) — funktioniert
  lokal (Rust) **und** shared (Supabase) ohne neue Tabelle/Migration. Editiert wird's
  in der bestehenden Company-Profil-Maske (wo schon `zahlungszielTage` etc. gepflegt
  werden).
- Gebühren-Snapshot pro Versand in `Todo.tags` (`fee:<cent>`), audit-stabil:
  spätere Default-Änderung schreibt Historie nicht um.

## Gebühren-Modell (bewusste Vereinfachung)

- Gebühr ist gestaffelt pro Stufe, Default 0/5/10 €.
- Beim Versand wird die Gebühr der Stufe als Cent-Snapshot getaggt.
- „Offener Gesamtbetrag" (Review + Mahntext) = Rechnungsrest + Σ bereits berechneter Gebühren.
- **Vereinfachung:** Beim „bezahlt"-Markieren gilt der gesamte Vorgang inkl. Gebühren
  als beglichen — **kein** separates Gebühren-Zahlungs-Ledger. Verzugszinsen und
  getrennte Gebühren-Buchung sind ausdrücklich Folge-Iterationen.

## Trigger

Kein Hintergrund-Cron nötig: `dueReminders` ist ein abgeleiteter Selektor und
reaktiv. Die Heute-Karte spiegelt jederzeit den aktuellen Stand; der natürliche
Trigger ist App-Start / Öffnen von „Heute" (sowie Datumswechsel im laufenden Betrieb).
Optionale Verfeinerung (nicht in dieser Iteration): Neuberechnung um lokale
Mitternacht bei laufender App.

## Persistenz der Mahnstufe über App-Neustarts (Task 9)

Die Stufe wird aus *abgeschlossenen* `send_reminder`-To-dos abgeleitet, aber der
Startup-Loader (`todos.store.loadAll` → `getOpenTasks`) lädt nur `status='open'`.
Damit die Stufe nach einem Neustart nicht auf 0 zurückfällt (Risiko Doppel-Versand),
hydriert ein Hook (`useReminderTrailHydration`, gemountet in DashboardRoute +
FinanceRoute) den erledigten Mahn-Trail **pro Konto mit überfälliger Rechnung** über
das vorhandene `ActivitiesGateway.getByAccount` (funktioniert lokal **und** Supabase —
kein Backend-Eingriff). `todos.store.hydrateReminderTrail(accountIds)` ist idempotent
(merkt geladene Konten), merge nur DONE `send_reminder`-To-dos in `allTodos` (verschmutzt
keine Today-Listen, die `status!=='done'` filtern). Fehler werden geloggt, nicht geworfen.

## Fehlerbehandlung

- Kein Mail-Konto konfiguriert → globaler Hinweis, Versand deaktiviert.
- Keine Kunden-Mail → betroffene Zeile „nicht sendbar", restliche Zeilen sendbar.
- Versand-Fehler pro Zeile isoliert: „Alle senden" bricht nicht ab; Ergebnis-Toast
  fasst zusammen (`„3 gesendet, 1 fehlgeschlagen"`). Stufe zählt nur bei Erfolg hoch.
- PDF-Generierung bleibt optional (Mail geht auch ohne Anhang raus, wie heute).

## Tests

`dunning.service` (Vitest):
- Versand schließt das `send_reminder`-To-do ab → Stufe zählt hoch (Regression für Bugfix).
- Cooldown-Gating: nächste Stufe erst nach 7/14/21 Tagen.
- Eskalation: ab Stufe 3 `phase = 'escalated'`, kein `due` mehr.
- Gebühren-Staffelung: `dunningFee(level, config)` korrekt; Default 0/5/10.
- `outstandingTotal`: Rechnungsrest + Σ berechneter Gebühren.
- „keine Kunden-Mail" → Zeile nicht sendbar; isolierter Fehler bricht Batch nicht ab.

## Nicht-Ziele (diese Iteration)

- Verzugszinsen (tagesgenau, B2B/B2C).
- Separates Gebühren-Zahlungs-Ledger.
- Frei konfigurierbare Eskalationsstufen / Cadence-Editor (bleibt 7/14/21).
- Vollautomatischer Versand ohne menschliche Bestätigung.
- Persistierter `dunning`-Record / neue Supabase-Tabelle (das wäre Ansatz B).

## Berührte Dateien

- **Neu:** `src/services/dunning.service.ts`, `src/components/finance/DunningNudgeCard.tsx`,
  `src/components/finance/DunningReviewModal.tsx`,
  `src/services/__tests__/dunning.service.test.ts`.
- **Geändert:** `src/hooks/useOverdueTaskSync.ts` (`getDunningState` um `phase`
  erweitert; toten Hook `useOverdueTaskSync()` entfernen),
  `src/components/finance/MahnwesenPanel.tsx` (nutzt Service, „eskaliert"-Bereich),
  `src/types/company.types.ts` (`CompanyProfile.dunningFees`),
  Company-Profil-Settings-Maske (drei Gebühren-Felder),
  `src/routes/DashboardRoute.tsx` (Karte einhängen).
