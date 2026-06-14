# Launch-Checkliste — Sicherheit, Daten & Recht

Stand: erstellt während Code-Review. Legende: **[Code]** = im Repo erledig-/machbar · **[Du]** = Supabase-Dashboard / Vertrag / Recht (kann ich nicht für dich tun).

---

## 🔴 1. Datenverlust verhindern — die eigentliche Lücke

**Befund:** Heute syncen nur **3 Tabellen** nach Supabase: `accounts`, `deals`, `activities`
(`enqueue()` in `src-tauri/src/db/account.rs`, `deal.rs`, `activity_engine/mod.rs`).
**Alles andere ist rein lokal** und wird **nirgends gesichert**: Rechnungen, Angebote,
Kontakte, Kunden, Notizen, Dateien, Kalender, Kampagnen, Tasks, Zeiterfassung.

→ Geht der Rechner eines Testkunden kaputt, sind diese Daten **weg**.

**Lösung gebaut — Backup/Restore (für die Testphase):**
- [x] **[Code]** Vollständiges **Backup exportieren** (`cmd_export_backup`): dumpt ALLE
      Tabellen als versioniertes JSON. UI: Einstellungen → Daten & Gefahrenzone.
- [x] **[Code]** **Backup importieren** (`cmd_import_backup`): stellt aus der JSON-Datei
      wieder her (schema-tolerant, INSERT OR REPLACE).
- [ ] **[Du, Tester-Hinweis]** Testern sagen: regelmäßig „Backup exportieren" und die Datei
      sicher ablegen (Cloud-Drive). Bei Gerätedefekt → „Backup importieren".
- [ ] **[Optional, Code]** Auto-Export beim App-Schließen, damit es nicht an Tester-Disziplin
      hängt.

**Später (SaaS):** Dieselbe JSON-Datei ist der Input für den einmaligen Cloud-Importer
(Mapping in Postgres + Zuordnung zu Account/Workspace). Format ist versioniert
(`format`/`version`) und stabil.

> Hinweis: Echtes Cloud-Backup käme erst mit dem SaaS-Backend. Für die Testphase deckt
> Export/Import den Datenverlust ab.

---

## 🔴 2. RLS (Row Level Security) — Schutz der Account-Daten

**[Code]** Migration vorbereitet: `supabase/migrations/0001_enable_rls.sql`
(workspaces, workspace_members, accounts, deals, activities).

- [ ] **[Du]** Auf **Staging**-Projekt anwenden, Spaltentypen prüfen (uuid vs text).
- [ ] **[Du]** Verifizieren: mit Tester-A einloggen → Daten von Tester-B **nicht** sichtbar.
- [ ] **[Du]** In allen Tabellen „RLS enabled" im Dashboard bestätigen (kein „unrestricted").
- [ ] **[Du]** Dann auf Produktion anwenden.

---

## 🔴 3. Backups / Dauerhaftigkeit

- [ ] **[Du]** Supabase **Pro-Plan** (Free hat kaum/keine Point-in-Time-Recovery).
- [ ] **[Du]** Tägliche Backups + PITR aktiv prüfen.

---

## 🔴 4. DSGVO (Pflicht — deutsche App, Rechnungs-/Kundendaten = personenbezogen)

- [ ] **[Du]** Supabase-Projekt in **EU-Region**.
- [ ] **[Du]** **AVV / DPA** mit Supabase abschließen (im Dashboard verfügbar).
- [ ] **[Du]** **Datenschutzerklärung** (welche Daten, Zweck, Supabase als Auftrags-
      verarbeiter, Speicherort, Aufbewahrung).
- [ ] **[Du]** **Löschung auf Anfrage** umsetzbar (Account + Daten).
- [ ] **[Code]** App-Aussagen ehrlich halten — `OnboardingWizard` korrigiert
      („Lokal-first …" statt „nichts geht über Server"); bei aktivem Cloud-Sync ggf.
      erneut anpassen.

---

## 🟠 5. Auth-Settings (Supabase → Authentication)

- [ ] **[Du]** E-Mail-Bestätigung: für Tester ggf. aus, für Launch an.
- [ ] **[Du]** Eigenes **SMTP** (Resend/Postmark) — der Supabase-Mailer hat harte Limits.
- [ ] **[Du]** Passwort-Policy (Mindestlänge) setzen.
- [ ] Optional: MFA für Geschäftsdaten.

---

## 🟠 6. Secrets / Schlüssel-Hygiene

- [x] **[Code]** Client nutzt nur den **anon-Key** (öffentlich, ok) — `src/lib/supabase.ts`.
- [x] **[Code]** Kein `service_role`-Key im Client (geprüft).
- [ ] **[Du]** `service_role`-Key niemals ins Bundle — nur in Edge Functions.
- [ ] **[Du/Code]** `VITE_LEAD_WEBHOOK_SECRET` liegt im Client-Bundle (extrahierbar).
      Für Produktion: Webhook server-seitig absichern statt geteiltem Secret im Client.

---

## 🟡 7. App-Auslieferung (Installer)

- [ ] **[Du]** **Code-Signing-Zertifikat** (OV/EV), sonst SmartScreen-Warnung „Unbekannter
      Herausgeber". Für wenige Tester verzichtbar (durchklicken), für Launch empfohlen.
- [ ] **[Code/Du]** Auto-Update (Tauri-Updater + Releases) — nicht nötig für erste Runde.
- [ ] **[Code/Du]** Crash-/Fehler-Reporting — sonst keine Sicht auf Tester-Probleme.

---

## Erledigt (Code, in diesem Review)
- [x] RLS-Migration als versionierte SQL-Datei (`supabase/migrations/0001_enable_rls.sql`).
- [x] Falsche Datenschutz-Aussage im Onboarding korrigiert.
- [x] anon-Key-only / kein service_role im Client verifiziert.
