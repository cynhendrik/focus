# Design: Der vorbereitete Schreibtisch — Produkt-Redesign Cultera OS

**Datum:** 2026-07-02
**Status:** Entwurf, vom Product Owner abschnittsweise freigegeben (Chat-Session 2026-07-02)
**Grundlage:** 4-Agenten-Tiefenaudit vom 2026-07-02 (Feature-Inventar, Erstnutzer-Erlebnis, Retention, Wert/Aufwand)

---

## 1. Problem

Das Audit hat zwei strukturelle Defekte identifiziert, die den Tag-3-Ausstieg von Nutzern erklären:

1. **Die App ist stumm, sobald sie geschlossen ist.** Keine System-Notifications, kein Tray, kein Badge, kein Autostart. Retention hängt zu 100 % an der Selbstdisziplin des Nutzers.
2. **Der Aha-Moment kommt zu spät und ungeführt.** Pflicht-Cloud-Login + E-Mail-Bestätigung + 4–5 Onboarding-Modals vor jedem Wert; die Onboarding-Checkliste endet vor der ersten Rechnung; unvollständige Rechnungen (Platzhalter statt Steuernummer/IBAN) sind exportierbar.

Dazu: drei Insel-Module mit negativem Wert (Kalender ohne Sync, Mail ohne OAuth, Zahlungsabgleich manuell), Doppelsysteme (3 Notizsysteme, 2 Follow-up-Systeme, leverage-Fassade), stille Fehler (Sync-Queue, leere catch-Blöcke, Mahnung ohne PDF möglich).

Die Stärke der App liegt im reifen Finanz-Kern (echtes ZUGFeRD, Storno+Gutschrift, wiederkehrende Rechnungen, 3-stufiges Mahnwesen) und in den Brücken zwischen Modulen (Zeit→Rechnung, Deal→Rechnungsvorschlag, Mail→Kunde, überfällig→Mahn-Aufgabe).

## 2. Entscheidungen des Product Owners

| Frage | Entscheidung |
|---|---|
| Module streichen/zusammenlegen? | Erlaubt. Kalender bleibt aber Vollmodul (Team-Termine mit Mitarbeitern). |
| Zielkunde | Solo → Team wachsend, beides gleichwertig. Solo-Start ohne Hürde, Team-Features wachsen mit. |
| Kernversprechen | Alle drei geschichtet: „Dein Tag ist schon organisiert" (Erlebnis) → „Du bekommst dein Geld schneller" (Beweis) → „Alles an einem Ort" (Struktur). |
| Lautstärke | „Ruhig aber präsent": 1 Morgen-Briefing + Geld-Events + Team-Events. Autostart + Tray-Badge. Kein Spam, keine Streaks. |
| Autonomie der „Sekretärin" | Vorbereiten + 1-Klick-Freigabe. Jeder Versand nach außen braucht einen Klick. |
| KI-Einsatz | Code zuerst. KI nur nutzerausgelöst (Antwortentwürfe lazy, „Umformulieren"-Knopf, KORA-Chat). Mahn-/Begleittexte werden von KI auf Templates umgestellt. |
| Außen-Anbindungen jetzt | Kalender-Sync (Google/Outlook/CalDAV) + Mail-OAuth (Gmail/Microsoft). **Kein** Bank-Abgleich in diesem Umbau (spätere Phase). |
| Gesamtansatz | A — „Der vorbereitete Schreibtisch" (zentraler Freigabe-Stapel, Module als Zulieferer), mit Modul-Aufwertungen als Unterbau. |

## 3. Produkt-Narrativ und Qualitätsmaßstab

**Cultera OS ist die Sekretärin, die dein Geschäft im Schlaf vorbereitet.** Jeden Morgen liegt ein fertiger Stapel bereit: Mahnungen formuliert, Follow-ups geschrieben, Antworten entworfen, Rechnungen aus erfasster Zeit vorbereitet, der Tag sortiert. Der Nutzer gibt frei — ein Klick pro Karte.

**Qualitätsmaßstab (zugleich Anti-Feature-Creep-Regel):** Ein Modul ist „wichtig und gut", wenn es dem Stapel Arbeit liefert, die es dem Nutzer abnimmt. Jedes Modul muss den Satz vervollständigen können: *„Ich habe für dich … vorbereitet."* Kann es das nicht, wird es verschmolzen oder degradiert.

**Psychologische Mechaniken (bewusst eingesetzt):**
- *Fait accompli:* fertige Arbeit lehnt man ungern ab — stärker als jeder Hinweis.
- *Verlustaversion:* Geld-Beträge in Briefing und Events („2.400 € offen").
- *Zeigarnik-Effekt:* ein kleiner, sichtbar endlicher Stapel will geleert werden.
- *Endowment:* eigene Daten ab Minute 10 (CSV-Import, Mail-Anbindung) — die App gehört dem Nutzer.
- *Commitment/Ritual:* Morgen-Briefing als täglicher Anker, Ein-Zug-Fokus bleibt.
- *Belohnung = echter Fortschritt:* Wochensumme in Euro („4.700 € in Bewegung gebracht"), keine Punkte/Streaks.
- *Vertrauen als Basis:* Transparenz (jede Karte zeigt ihre Regel), keine stillen Fehler.

## 4. Modul-Landkarte (~13 Nav-Flächen → 9)

| Modul | Entscheidung | „Ich habe für dich …" |
|---|---|---|
| **Mein Tag** | Herz der App: Stapel + Tagesplan + KPIs | „… deinen Tag vorbereitet — 4 Freigaben, 2.400 € offen." |
| **KORA** | Bleibt als Chat; zusätzlich Stimme des Stapels (Briefing-Text, Entwürfe auf Klick) | „… deine Texte geschrieben." |
| **Kunden** | Bleibt; erhält das EINE Notizsystem (3→1) | „… die Historie parat, bevor du anrufst." |
| **Akquise** | Fusion aus 4 Flächen (Leads, Pipeline, Follow-Ups, Newcomer) → 1 Fläche, 2 Tabs (Leads-Board, Deals). Kampagnen = Werkzeug innerhalb Leads. Follow-ups laufen über den Stapel. | „… das Follow-up an Lead X geschrieben." |
| **Finanzen** | Bleibt Kraftzentrum; liefert Mahnungen + Rechnungsvorschläge in den Stapel | „… die Mahnung fertig — mit PDF." |
| **Mail** | Bleibt; OAuth; Positionierung „Kunden-Postfach" (nicht Client-Ersatz); liefert Antwortentwürfe | „… eine Antwort auf Meyers Mail entworfen." |
| **Kalender** | Bleibt Vollmodul (Team-Planer); Sync lesend→schreibend; liefert Termin-Vorbereitung | „… dein 10-Uhr-Dossier vorbereitet." |
| **Zeit & Aufträge** | Bekommt Nav-Eintrag + Live-Timer (Tray/Header); liefert Rechnungsentwürfe aus unabgerechneter Zeit | „… 12 Std. bei Kunde Y zur Rechnung gemacht." |
| **Team** | Chat-Overlay + Zuweisungen bleiben (keine eigene Nav-Fläche); speist Notifications | „… dir Maries Zuweisung gemeldet." |

**Verschwindet:** leverage-Re-Export-Fassade, 2 von 3 Notizsystemen, „Follow-Ups" und „Newcomer" als eigene Nav-Flächen, Deutsch/Englisch-Mischtexte (z. B. „Clients"-Titel, englischer Login).

**Bewusst NICHT in diesem Umbau:** Bank-Abgleich, E-Rechnung-Empfang, Belege/DATEV, Projektplanner. Alle vier fügen sich später als neue Stapel-Zulieferer ein, ohne das Konzept zu ändern.

## 5. Die Vorbereitungs-Engine — Code zuerst, KI nur auf Klick

Die Engine, die den Stapel füllt, ist **100 % deterministischer Code** (Regeln, Fristen, Templates). Kein API-Call im Grundbetrieb: kostenlos, offline-fähig, sofort, vorhersagbar.

### Über Code (deterministisch)

| Vorbereitung | Mechanik | Basis heute |
|---|---|---|
| Rechnungsvorschläge (Vertrag/Deal/Zeit) | `nextBillingDate` fällig / Deal gewonnen / unabgerechnete Zeit → Entwurfs-Karte | existiert (`checkAndCreateDueInvoices`, `InvoiceSuggestions`), wird in Stapel umgeleitet |
| Mahnungs-Erkennung, Stufen, Fristen, Gebühren | überfällig + Cooldown → Stufe N | existiert (`dunning.service.ts`) |
| Mahntexte | **Templates mit Platzhaltern** (Name, Betrag, Rechnungsnr., Frist, Gebühr) je Tonstufe | heute KI → **Umstellung auf Templates** |
| Follow-up-Fälligkeiten/Kadenzen | Regel-Engine: kein Kontakt seit X Tagen / Stage Y → fällig | Backend existiert (`follow_up_queue`, `engine/rules.rs`), wird angebunden |
| Follow-up-Texte (Standardfälle) | Templates je Anlass (nach Angebot, Erstkontakt, Reaktivierung) | neu |
| Tages-Priorisierung | deterministisches Scoring: Geld > Frist > Alter | existiert (`heute-queue.ts`) |
| Morgen-Briefing-Text | regelbasierter Satz-Baukasten | existiert (`koraLine`) |
| Termin-Vorbereitung | Query-Aggregation: letzte 5 Mails, offene Rechnungen/Aufgaben, letzte Notizen zum Kunden | neu |
| Rechnungs-Begleitmail | Template | heute KI → Template |
| Notifications | Code | neu |

### Über KI (nur diese drei, alle nutzerausgelöst)

1. **Antwortentwürfe auf eingehende Kundenmails** — erzeugt erst beim Öffnen der Karte (lazy), nicht automatisch pro Mail.
2. **„Mit KORA umformulieren"-Knopf** auf jeder Template-Karte.
3. **KORA-Chat** — unverändert, nur auf Anfrage.

**Kosteneffekt:** Grundbetrieb 0 € KI-Kosten; Kosten nur proportional zu bewussten Klicks. App bleibt funktionsfähig ohne Netz/Anthropic. KORA-Modell bleibt `claude-haiku-4-5`.

## 6. Der Stapel — die Freigabe-Inbox

### Ort und Grundmechanik

„Mein Tag" wird umgebaut: Stapel zuerst und am größten, dann Tagesplan, dann KPIs. Die bestehende „Dein nächster Zug"-Mechanik (eine Fokus-Karte + „Als nächstes"-Liste) bleibt und wird vom Hinweis („Rechnung überfällig") zum fertigen Arbeitsergebnis („Mahnung liegt bereit") aufgewertet.

### Anatomie einer Karte

Jede Karte beantwortet drei Fragen:
1. **Was vorbereitet wurde:** „Zahlungserinnerung an Meyer GmbH — 1.190 €, Rechnung #23, 14 Tage überfällig."
2. **Warum (die Regel, sichtbar):** „Stufe 1, weil 14 Tage ohne Zahlung." Der Nutzer rätselt nie, warum eine Karte existiert.
3. **Das Ergebnis selbst (aufklappbar):** fertiger Mailtext, PDF-Anhang, Rechnungsentwurf. Kein Blindflug-Freigeben.

**Vier Aktionen, immer dieselben:**
- **Freigeben** (primär, 1 Klick): sendet/erstellt wirklich; Bestätigung mit Ergebnis („Mahnung versendet ✓ — PDF angehängt").
- **Anpassen:** Entwurf editierbar öffnen; dort sitzt der optionale „Mit KORA umformulieren"-Knopf.
- **Später** (Snooze: morgen / 3 Tage / nächste Woche): Karte kommt wieder; nichts fällt still weg.
- **Verwerfen** mit Regel-Lernen: nach 3× Verwerfen desselben Kartentyps für dieselbe Quelle/Stage fragt die App „Soll ich das künftig nicht mehr vorbereiten?" (Regel-Anpassung per Code, nicht per KI).

### Kartentypen (Start-Set)

| Typ | Zulieferer | Freigeben bewirkt |
|---|---|---|
| Mahnung/Zahlungserinnerung | Finanzen | Mail mit PDF raus, Stufe hochgezählt |
| Follow-up an Lead/Kunde | Akquise | Mail raus, Follow-up protokolliert |
| Antwortentwurf | Mail (KI, lazy) | Antwort raus, Thread am Kunden |
| Rechnungsentwurf (Vertrag/Deal/Zeit) | Finanzen/Zeit | Rechnung freigegeben, optional direkt mit Begleitmail versendet |
| Termin-Vorbereitung | Kalender | kein Versand — „Gelesen", öffnet Kunden-Dossier |
| Aufgabe fällig | Team/Todos | abhaken oder öffnen |

### Verhaltensregeln

- **Deckel:** max. ~7 sichtbare Karten, Rest hinter „+ n weitere".
- **Dedupe:** pro Rechnung/Lead/Mail genau eine aktive Karte; Snooze respektiert Quell-Cooldowns.
- **Reihenfolge:** deterministisches Scoring (Geld > Frist > Alter), bestehende Heute-Queue-Logik.
- **Team-Modus:** Karten haben einen Zuständigen; jeder sieht seinen Stapel; Karten sind delegierbar („An Marie übergeben"). Solo-Nutzer sehen davon nichts.
- **Leerer Stapel = Belohnung:** „Alles erledigt. Heute ist frei für Fokusarbeit." + Wochensumme („Diese Woche freigegeben: 3 Mahnungen, 2 Rechnungen — 4.700 € in Bewegung gebracht"). Einziger Gamification-Moment: echter Fortschritt in Euro.

### Datenmodell

Neue lokale Tabelle `prepared_items`:
`id, type, source_kind, source_id, workspace, assignee, payload (JSON: Titel, Begründung, Entwurfstext, Anhänge), score, status (pending/approved/snoozed/dismissed), snooze_until, created_at, approved_at, rule_id`.

Die Engines (Dunning, Follow-up-Queue, Verträge, Zeit, Kalender) schreiben in `prepared_items`; der Stapel liest nur. Cloud-Sync über den bestehenden Mechanismus (Team-Delegation). Bestehende Kanäle (Mahn-Todos, `InvoiceSuggestions`) werden **migriert, nicht dupliziert** — es entsteht kein drittes Parallel-System.

## 7. Präsenz-Schicht — „ruhig aber präsent"

**Drei Notification-Klassen, mehr nicht:**
1. **Morgen-Briefing** (werktags, Standard 8:30, Zeit einstellbar): eine System-Notification — „Guten Morgen. 4 Dinge liegen bereit — 2.400 € offen, 1 Termin um 10:00." Klick öffnet den Stapel. **Leerer Stapel → keine Notification** (Stille ist die Belohnung).
2. **Geld-Events** (sofort, je Ereignis genau einmal): Rechnung heute überfällig geworden („Mahnung liegt bereit"), Zahlung verbucht.
3. **Team-Events:** Zuweisung, @Erwähnung, DM — bestehende In-App-Glocke wird zum OS durchgereicht. Solo-Nutzer erhalten diese Klasse nie.

**Infrastruktur:** Tray-Icon mit Badge (= Stapel-Anzahl), Tray-Menü (Stapel öffnen / Quick Capture / Beenden), Autostart im Hintergrund, Ruhezeiten standardmäßig an (nach 18 Uhr + Wochenende stumm). Technisch: `tauri-plugin-notification`, `tauri-plugin-autostart`, Tauri-Tray.

**Konsequenz:** Vorbereitungs-Engines laufen im Hintergrundprozess (App im Tray), nicht erst beim Fensteröffnen. Der bestehende 10-Sekunden-Sync-Loop erhält einen „Vorbereitungs-Tick" (stündlich + beim Aufwachen), damit das Morgen-Briefing stimmt.

## 8. Onboarding — das Onboarding IST der Stapel

Die heutige Kaskade (Splash → Pflicht-Login → E-Mail-Bestätigung → WelcomeIntro → CompanyStep → NamePrompt → TourOffer → OnboardingCard) entfällt. Stattdessen:

1. **Start ohne Konto.** Erster Start → direkt lokaler Workspace, kein Login. Konto erst bei Cloud-Bedarf (Team einladen, zweites Gerät) — dann ist die Motivation da. Löst den „local-first"-Widerspruch und den Boot-Crash ohne `.env`. Splash < 1 s.
2. **Onboarding-Karten im Stapel** (gleiche Karten-Mechanik wie echte Arbeit):
   - „Lass uns deine erste Rechnung bauen — dauert 2 Minuten." (Primärkarte)
   - „Kunden mitbringen — CSV aus Excel/Lexoffice importieren."
   - „Mail-Konto verbinden — dann ordne ich Kundenmails automatisch zu."
   - „Soll ich dich morgens briefen? — Autostart + Benachrichtigung aktivieren."
3. **Firmendaten just-in-time:** Die erste Rechnung fragt fehlende Pflichtangaben (Firma, Steuernummer, IBAN) inline im Rechnungsformular ab. **Export wird blockiert**, solange rechtliche Pflichtfelder fehlen (heute stille Platzhalter im PDF = Haftungsrisiko). Basis: bestehender Readiness-Check (`erechnung-readiness.ts`) bekommt Durchsetzungskraft.
4. **Aha-Moment in Minute 5:** fertige, E-Rechnungs-konforme PDF, auf Wunsch direkt per Mail versendet. Danach kündigt die Sekretärin an, was sie ab jetzt übernimmt („Ich erinnere dich, wenn die Zahlung ausbleibt — und bereite die Mahnung vor.").
5. **CSV-Import (neu, Pflichtbestandteil):** Kunden-Import mit Spalten-Mapping (Name, E-Mail, Firma, Adresse). Der nicht eingebundene `MigrationWizard` wird dabei ersetzt/gelöscht. Endowment-Moment: eigene Daten ab Minute 10.
6. **Solo = volle Rechte:** `isAdmin`-Gating gilt nur in geteilten Workspaces; im lokalen Solo-Workspace gibt es keine versteckten Buttons.

## 9. Modul-Aufwertungen

- **Akquise-Fusion:** 1 Fläche, 2 Tabs (Leads-Board mit Inline-Follow-ups — schon gebaut — und Deals/Pipeline). Kampagnen („Newcomer") als Werkzeug innerhalb Leads. leverage-Re-Exports aufgelöst.
- **Kalender:** Sync zuerst **lesend** (Google/Outlook/CalDAV-Abo; externe Termine grau), schreibend als zweite Stufe. Termin-Vorbereitung als Stapel-Karte. Team-Features (Pro-Person-Farbe, Privatsphäre, Beitreten) unverändert.
- **Mail:** OAuth für Gmail/Microsoft (OAuth-Flow + Token-Refresh in Rust, XOAUTH2 für IMAP/SMTP). Positionierung „Kunden-Postfach mit Kontext und fertigen Antwortentwürfen", nicht Client-Ersatz.
- **Zeit & Aufträge:** Nav-Eintrag; Live-Timer im Tray/Header (Start/Stop pro Auftrag) als täglicher Habit-Anker; erfasste Zeit → Rechnungsentwurf-Karte.
- **Notizen 3 → 1:** `notes-module.store` wird das eine System; Activity-Notizen werden migriert. Sticky-Canvas entfällt standardmäßig; es bleibt nur, falls sich bei der Migration echte Nutzungsdaten dafür finden — dann als Darstellungsform desselben Systems, nie als eigener Datenbestand.

## 10. Vertrauens-Schicht (nicht verhandelbar)

1. **Sync-Status ehrlich:** Hängende Queue-Einträge (401/403/RLS) erzeugen sichtbaren Zustand („3 Änderungen warten auf Sync — erneut versuchen / Details") statt endlosem stillen Retry. `last_synced_at` nur bei komplettem Erfolg.
2. **Kein stilles Degradieren:** Mahnung ohne PDF wird nicht gesendet, sondern als Fehler-Karte gezeigt. Fehlgeschlagenes Speichern (z. B. Firmenprofil) meldet sich. Leere `catch {}`-Blöcke in kritischen Pfaden (Speichern, Versand, Sync) erhalten Fehlerpfade.
3. **Verständliche Fehler:** keine rohen `String(e)`-Ausgaben in UI; benannte Meldungen mit Details-Aufklapp.
4. **Protokollbuch:** Jede Freigabe hinterlässt eine nachlesbare Aktivität am Kunden (was rausging, wann, mit welchem Anhang).

## 11. Umsetzungs-Phasen (jede einzeln shipbar)

1. **Phase 1 — Vertrauen + Präsenz:** Vertrauens-Schicht, Notifications/Tray/Autostart, Morgen-Briefing aus bestehender `koraLine`. *Kleinster Aufwand, größter Churn-Effekt.*
2. **Phase 2 — Der Stapel:** `prepared_items`, Umbau „Mein Tag", Migration Mahn-Todos/InvoiceSuggestions/Follow-ups zu Karten, Template-Umstellung Mahn-/Begleittexte.
3. **Phase 3 — Onboarding neu:** Start ohne Konto, Onboarding-Karten, Firmendaten just-in-time, Export-Blockade, CSV-Import.
4. **Phase 4 — Konsolidierung:** Akquise-Fusion, Notizen 3→1, Zeit-Timer + Nav-Eintrag, Nav-/Sprach-Bereinigung.
5. **Phase 5 — Außenwelt:** Kalender-Sync (lesend → schreibend), Mail-OAuth.
6. **Später:** Bank-Abgleich (CSV/CAMT), E-Rechnung-Empfang, Belege/DATEV, Projektplanner — als neue Stapel-Zulieferer.

Jede Phase erhält eine eigene Detail-Spec + Implementierungsplan; diese Spec ist das Dach-Dokument.

## 12. Erfolgs-Kriterien

- **Tag-3-Retention:** Nutzer erhält ab Tag 1 mindestens einen externen Trigger pro Werktag (sofern Stapel nicht leer) und kann jede vorbereitete Arbeit mit genau 1 Klick freigeben.
- **Time-to-value:** Erste konforme Rechnung (ohne Platzhalter) in < 5 Minuten ab Erststart, ohne Konto.
- **KI-Kosten:** 0 API-Calls im Grundbetrieb; Calls nur bei Antwortentwurf-Öffnen, „Umformulieren", KORA-Chat.
- **Kein neues Parallel-System:** Nach Phase 2 existiert genau ein Vorbereitungs-Kanal (`prepared_items`); nach Phase 4 genau ein Notizsystem und eine Akquise-Fläche.
- **Kein stiller Fehler in kritischen Pfaden:** Versand-, Speicher- und Sync-Fehler sind im UI sichtbar.
