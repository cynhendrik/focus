# Geld-Kreislauf / Mahnwesen — Design

**Datum:** 2026-06-23
**Branch-Kontext:** feature/erechnung-2026-06-21
**Status:** freigegeben (Design), bereit für Implementierungsplan

## Problem

Der „Geld-Kreislauf" (Rechnung → überfällig → Mahnung → Zahlung) ist zu ~70 % gebaut,
schließt sich aber nicht von selbst. Zwei konkrete Bruchstellen:

1. **Stufen-Bug (Kernproblem):** Die Mahnstufe wird in `getDunningState`
   (`src/hooks/useOverdueTaskSync.ts`) aus *abgeschlossenen* `send_reminder`-To-dos
   abgeleitet. Das `MahnwesenPanel` schließt beim Versand aber **kein** To-do ab
   (kein Treffer auf `send_reminder`/`done` in `MahnwesenPanel.tsx`). Folge: man sendet,
   die Engine merkt es sich nicht, die Stufe bleibt hängen, der Cooldown startet nie →
   kein Weiterdrehen.
2. **Kein Anstoß:** Eine Mahnung geht nur raus, wenn der Nutzer aktiv den
   Finanzen→Mahnwesen-Tab öffnet und „Senden" klickt. Es fehlt ein zentraler Nudge.

Zusätzlich fehlen Mahngebühren und ein expliziter „eskaliert"-Zustand.

## Ausgangslage (verifiziert am Code)

- **Vorhanden & funktionsfähig:** `MahnwesenPanel.tsx` (gemountet unter
  `FinanceRoute` Tab `mahnwesen`, **nicht** tot) mit Einzel- + `sendAll`-Versand;
  echter SMTP-Versand (`mail.service.ts` → Tauri `email_send`) inkl. PDF-Anhang;
  KORA-Mahntext (`generateCorraDraft`); Überfälligkeits-Ableitung (`isOverdue`,
  GoBD-sauber nie persistiert); `useOverdueTaskSync` legt `send_reminder`-To-dos an;
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
                      └─ ✅ send_reminder-To-do auf 'done' + Gebühren-Snapshot in tags  ← BUGFIX
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
  → **bei Erfolg:** zugehöriges `send_reminder`-To-do auf `status:'done'` setzen
  (bzw. ein abgeschlossenes anlegen, falls keins existiert) und den berechneten
  Gebühren-Snapshot als Tag `fee:<cent>` ergänzen. Wirft bei Versand-Fehler.
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

### `useOverdueTaskSync` (angepasst)
- Das `send_reminder`-To-do bleibt das **Protokoll-Artefakt** für die Stufen-Ableitung:
  es wird weiterhin (genau eins offen pro fälliger Stufe) angelegt und beim Versand
  abgeschlossen.
- **Sichtbarkeit:** Diese `send_reminder`-To-dos werden aus der normalen „Heute"-
  Aufgabenliste **ausgefiltert** (per `actionType === 'send_reminder'`) — die
  Heute-Karte ist ihre einzige sichtbare Oberfläche. Damit: eine Karte statt N
  sichtbarer To-dos → weniger Fragmentierung, Stufen-Trail bleibt intakt.
  (Konkret: die Stelle prüfen, die `bucket: 'today'`-To-dos rendert, und
  `send_reminder` dort ausschließen.)

### UI
- `DunningNudgeCard.tsx` (neu): auf dem Heute-Dashboard; zeigt Anzahl + Summe fälliger
  Mahnungen; nur sichtbar wenn > 0; Klick öffnet Review.
- `DunningReviewModal.tsx` (neu): Liste je Mahnung (Kunde, Stufe, Tage überfällig,
  Betrag inkl. Gebühr, aufklappbare Text-Vorschau); pro Zeile [Senden]/[Überspringen],
  oben [Alle senden]. Zeilen ohne Kunden-Mail klar als „nicht sendbar" markiert.
- `MahnwesenPanel.tsx`: bleibt als Detailansicht, nutzt jetzt `dunning.service`
  (eigene Sende-Logik entfällt). Zeigt zusätzlich den „eskaliert"-Bereich.
- Settings → Finanzen: Editor für `dunningConfig` (drei Gebühren-Felder).

### Settings / Persistenz
- `dunningConfig` als JSON in den Company-Settings — analog zum bestehenden
  `modules` / `crmConfig`-Muster (`company.store` + `CompanyGateway`).
  Form: `{ fees: [0, 5, 10] }` (Euro, Stufe 0/1/2).
- Gebühren-Snapshot pro Versand in `Todo.tags` (`fee:<cent>`), audit-stabil:
  spätere Config-Änderung schreibt Historie nicht um.

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
- **Geändert:** `src/hooks/useOverdueTaskSync.ts` (`phase`, Karte-statt-Flut),
  `src/components/finance/MahnwesenPanel.tsx` (nutzt Service, „eskaliert"-Bereich),
  `src/store/company.store.ts` + Settings-UI (`dunningConfig`),
  Heute-Dashboard (Karte einhängen).
