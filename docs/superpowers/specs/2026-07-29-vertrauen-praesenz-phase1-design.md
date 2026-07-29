# Phase 1 — Vertrauen + Präsenz (reduzierter Scope) — Design Spec

**Datum:** 2026-07-29
**Bezug:** Detail-Spec zu Phase 1 aus dem Dach-Dokument `docs/superpowers/specs/2026-07-02-vorbereiteter-schreibtisch-design.md` (Abschnitte 7 und 10)
**Status:** Vom User freigegeben (Chat-Session 2026-07-29)

---

## 1. Ausgangslage

Die Dach-Spec vom 2026-07-02 plante Phase 1 als Aufbau der kompletten Präsenz-Schicht (Tray, Autostart, Notifications, Morgen-Briefing) plus Vertrauens-Schicht (sichtbare Fehler statt stiller Degradierung). Eine Code-Prüfung am 2026-07-29 ergab: **die Präsenz-Schicht existiert bereits fast vollständig** — Tray-Icon, Autostart-Plugin, Morgen-Briefing (`useBriefingScheduler`), Geld-Events (`useMoneyEvents`, in `App.tsx` gemountet), Team-Events, Ruhezeiten sind gebaut und getestet. Diese Spec deckt nur noch die tatsächlich offenen Lücken ab.

**Offen sind drei Bausteine:**
1. Tray-Badge ist nicht verdrahtet (Backend-Command existiert, wird nie aufgerufen).
2. Sync-„wartet noch"-Zustand ist unsichtbar (nur Fehlschläge werden angezeigt).
3. Drei konkrete stille Fehler in kritischen Pfaden (Mahnwesen ×2, Firmenprofil).

**Bewusst nicht Teil dieser Spec** (User-Entscheidung 2026-07-29, minimaler Scope): kein breiter Sweep nach weiteren stillen Fehlern über die gesamte Codebasis; die verschluckten `let _ = app.emit(...)`-Aufrufe in `connectivity.rs` (Fire-and-forget an ein evtl. nicht offenes Fenster, kein Nutzer-Impact); der `eprintln!`-Push-Fehler in `connectivity.rs:36` (normaler 10-Sekunden-Retry, wird durch Baustein 2 indirekt sichtbar, falls er sich häuft).

---

## 2. Baustein 1 — Tray-Badge verdrahten

**Problem:** `cmd_update_tray_status(app, open_count: u32)` (`src-tauri/src/main.rs:42-52`) setzt den Tray-Tooltip korrekt, wird aber vom Frontend nie aufgerufen. Die Zahl selbst wird bereits berechnet — inline in `NavSidebar.tsx:92` als `corraBadge = overdueCount + unreadMails + todayTodos`.

**Lösung:**
- Neue geteilte Funktion `computeOpenCount(overdueCount: number, unreadMails: number, todayTodos: number): number` in `src/lib/heute/due.ts` (dort liegt laut Code bereits die verwandte `isTodoForToday`-Logik — eine Quelle statt zwei Inline-Berechnungen).
- `NavSidebar.tsx` nutzt `computeOpenCount(...)` statt der Inline-Summe (Verhalten unverändert, nur eine Quelle).
- Neuer Hook `src/hooks/useTrayBadge.ts`: abonniert dieselben drei Store-Selektoren (`overdueCount` aus `finance.store`, `unreadMails` aus `mail.store`, `todayTodos` aus `todos.store`), ruft bei Änderung `invoke('cmd_update_tray_status', { openCount: computeOpenCount(...) })`. Gemountet einmalig in `App.tsx`, Muster identisch zu `useMoneyEvents()`.

**Kein neuer State, keine neue Tabelle.** Reine Verdrahtung von Bestehendem.

---

## 3. Baustein 2 — Sync-Pending sichtbar machen

**Problem:** `pendingCount` fließt bereits zuverlässig in `useWorkspaceStore` (Event `cultera://pending-count`, verdrahtet in `useSyncBridge.ts`), wird aber nirgends gerendert. `SyncStatusChip.tsx` zeigt nur `failedCount > 0`.

**Lösung:** `SyncStatusChip.tsx` erhält einen zweiten, ruhigeren Sichtbarkeits-Zweig:
- `failedCount > 0` → bestehender Zustand (rot, `CloudOff`, „X Änderungen konnten nicht synchronisiert werden").
- `failedCount === 0 && pendingCount > 0` → neuer Zustand: neutrales `RefreshCw` (rotierend via bestehende `busy`-Animation-Klasse), Label „Synchronisiert …", Tooltip `„${pendingCount} Änderungen werden übertragen"`. Kein Klick-Handler nötig (kein Fehler zum Wiederholen), reine Information.
- `failedCount === 0 && pendingCount === 0` → wie bisher: Komponente rendert `null`.

Damit werden auch hängende Sync-Retries (wiederholte `eprintln!`-Fehlschläge in `connectivity.rs`) indirekt sichtbar: der pending-Zustand bleibt einfach länger stehen, statt für immer unsichtbar zu sein.

---

## 4. Baustein 3 — Drei stille Fehler

| Ort | Heute | Fix |
|---|---|---|
| `dunning.service.ts:179` — `ContactsGateway.getByAccount(...).catch(() => [])` | Kontakt-Lookup schlägt fehl → stiller Fallback auf Konto-E-Mail, kein Log | `log.warn('contact lookup failed, falling back to account email', { invoiceId, err })` im catch ergänzen. Fallback-Verhalten bleibt (ist korrekt), wird nur nachvollziehbar. |
| `dunning.service.ts:267-269` — Protokollbuch-Aktivität nach Versand schlägt fehl | Nur `log.warn`, `sendReminder()` gibt trotzdem `{ ok: true }` ohne Hinweis zurück | Rückgabewert um `warning`-Feld ergänzen, exakt das Muster der `recordReminderSent`-Fehlerbehandlung 15 Zeilen darüber: `{ invoiceId, ok: true, warning: 'Mahnung gesendet, aber nicht im Kundenverlauf protokolliert.' }` |
| `company.service.ts` `tryParse` | Kaputtes JSON in `profile`/`modules`/`crmConfig` → stiller Fallback auf `{}`, kein Log, kein Hinweis | `tryParse(json, fallback, fieldName)` bekommt einen dritten Parameter; im catch: `log.warn('company settings field corrupt, using fallback', { field: fieldName })` **und** `toastError(...)` beim Aufruf in `CompanyService.get()`, da beschädigte Firmendaten direkt die Rechnungs-Pflichtfelder (Steuernummer/IBAN) betreffen. |

Alle drei Fixes sind rein additiv (Logging/Toast/Warnfeld) — kein bestehendes Verhalten ändert sich, außer dass Fehler jetzt sichtbar/nachvollziehbar sind.

---

## 5. Tests

- `computeOpenCount()` — Unit-Test (Summenlogik, `0` bei allen Feldern leer).
- `sendReminder()` — neuer Testfall: Protokollbuch-Fehler → `warning`-Feld gesetzt, `ok` bleibt `true`.
- `company.service.ts` — Testfall: korruptes JSON → `log.warn` aufgerufen (Spy), Fallback-Wert wie bisher.
- `SyncStatusChip` — Komponenten-Test für den neuen Pending-Zustand (Icon/Label/Tooltip bei `pendingCount > 0, failedCount === 0`) zusätzlich zum bestehenden Fehler-Zustand-Test.
- Tray-Tooltip selbst (natives OS-UI) nur manuell verifizierbar — kein automatisierter Test dafür vorgesehen.

---

## 6. Erfolgskriterium

Nach dieser Phase: kein „stilles Degradieren" mehr in den drei genannten Pfaden, hängender Sync-Zustand ist im UI sichtbar (nicht nur Fehlschläge), Tray zeigt die reale Anzahl offener Punkte — ohne dass dafür der „Stapel" (Phase 2) existieren muss.
