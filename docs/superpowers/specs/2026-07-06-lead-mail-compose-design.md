# Lead-Mail-Compose

## Kontext

CRM-Audit 2026-07-04 (Memory `crm-audit-2026-07-04`): „Kein Lead-Level-Mail-Compose (nur mailto:)". `LeadDetailModal.tsx:240-252` zeigt die E-Mail-Adresse eines Leads nur als `<a href="mailto:...">`-Pille — Klick öffnet den externen Mail-Client des Nutzers statt in der App zu schreiben.

Recherche (2026-07-06) zeigt: die komplette Infrastruktur für In-App-Mail-Versand existiert bereits und wird von Mahnwesen + Follow-up-Sequenz produktiv genutzt. Diese Spec ist reines Wiring, kein neuer Versand-Code.

**Wiederverwendete Bausteine (unverändert):**
- `ComposeModal` (`src/components/mail/ComposeModal.tsx`) — Compose-UI mit `mode`, `accountId`, `initialTo/initialSubject/initialBody/initialAttachmentPaths`, `onClose`, `onSent`. Bereits genutzt in `MahnwesenPanel.tsx:449-464` und `DunningReviewModal.tsx`.
- `MailService.sendEmail` (`src/services/mail.service.ts:78`) → Rust `email_send` (`src-tauri/src/email/commands.rs:521`) → SMTP via `lettre`. `ComposeModal` ruft das intern selbst auf, hier nicht direkt aufzurufen.
- Aktivitäts-Logging nach Versand: exaktes Muster aus `src/services/stapel-actions.service.ts:119-127` (Sequenz-Mail):
  ```ts
  await ActivitiesGateway.create({
    workspaceId, createdBy: userId, accountId: <leadId>,
    type: 'email', title: '…', body: `Per E-Mail an ${email}.`, status: 'done',
  })
  ```
  in try/catch mit `log.warn` bei Fehler (Mail ist schon raus — ein Logging-Fehler darf das dem Nutzer nicht als Fehler verkaufen).

## Scope

Nur `src/components/leads/LeadDetailModal.tsx`. Keine neue Komponente, kein neuer Service, kein Rust-/DB-Code.

## Änderungen

1. **Neuer State:** `const [showCompose, setShowCompose] = useState(false)`.

2. **Neuer Header-Button** (im bestehenden Action-Row neben „Sequenz starten"/„Zu Kunde machen"/„Löschen", Zeile ~178-224), Label „Mail schreiben" mit `Mail`-Icon aus `lucide-react`:
   - `disabled` wenn `!lead.email` ODER `mailAccounts.length === 0` (`useMailStore(s => s.accounts)`).
   - `title`-Tooltip erklärt warum: `!lead.email` → "Ohne E-Mail-Adresse nicht möglich"; kein Account → "Kein E-Mail-Konto konfiguriert" — exakt das bestehende Fehlertext-Muster aus `stapel-actions.service.ts:60-61` etc.
   - `onClick={() => setShowCompose(true)}`.

3. **Contact-Info-Pille wird nicht-interaktiv** (Zeile 240-252): `<a href="mailto:...">` → `<span>` mit identischem Markup/Styling (`✉️ {lead.email}`), da der Compose-Button jetzt der primäre Weg ist. Die Adresse bleibt sichtbar, ist aber kein Link mehr — kein doppelter Pfad zum selben Ziel.

4. **ComposeModal-Rendering**, als Sibling-Overlay nach exakt demselben Muster wie `showConvertChoice` (Zeile 347-353):
   ```tsx
   {showCompose && (
     <ComposeModal
       mode="new"
       accountId={mailAccounts[0].id}
       initialTo={[lead.email!]}
       onClose={() => setShowCompose(false)}
       onSent={handleMailSent}
     />
   )}
   ```
   (Button ist disabled wenn `mailAccounts` leer oder `lead.email` null ist, daher sind `mailAccounts[0]` und `lead.email!` an dieser Stelle sicher.)

5. **`handleMailSent`** (neue Funktion, async):
   ```ts
   async function handleMailSent() {
     setShowCompose(false)
     try {
       await ActivitiesGateway.create({
         workspaceId, createdBy: userId, accountId: lead.id,
         type: 'email', title: `Mail an ${lead.name}`,
         body: `Per E-Mail an ${lead.email}.`, status: 'done',
       })
     } catch (err) {
       log.warn('lead mail activity logging failed', { err })
     }
     showToast({ message: 'Mail gesendet.', variant: 'success' })
   }
   ```
   Loggen ist best-effort (try/catch, `log.warn`) — ein Logging-Fehler darf die bereits erfolgreich verschickte Mail nicht als Fehler erscheinen lassen, analog `stapel-actions.service.ts:129-131`.

## Nicht im Scope (bewusst, per Nutzer-Entscheidung)

- Keine Interaktion mit der Follow-up-Sequenz — läuft unabhängig weiter, der bestehende „Sequenz stoppen"-Button bleibt der einzige Weg, sie zu beenden.
- Kein Default-Betreff/-Text — `ComposeModal` startet leer (`mode="new"` ohne `initialSubject`/`initialBody`).
- Kein Bulk-Newcomer→Lead (eigene, spätere Spec).
- Kein neuer Rust-/DB-Code, kein neuer Send-Pfad.

## Tests

`LeadDetailModal.tsx` hat aktuell keine dedizierte RTL-Testdatei (Konvention dieser Codebase: große Modal-Komponenten wie `NavSidebar.tsx` sind ebenfalls ungetestet, die zugrundeliegenden Bausteine — `ComposeModal`, `MailService.sendEmail`, `ActivitiesGateway.create` — sind an ihrer eigenen Stelle bereits getestet). Diese Änderung fügt keine neue Testdatei hinzu; Verifikation über die volle `npx vitest run`-Regression + `npx tsc --noEmit` + manuellen Smoke-Test (Button-Zustände: mit/ohne E-Mail, mit/ohne Mail-Konto; Senden; Aktivität erscheint im Verlauf).

## Akzeptanzkriterien

- Klick auf „Mail schreiben" öffnet `ComposeModal` vorausgefüllt mit der Lead-E-Mail als Empfänger.
- Button ist sichtbar deaktiviert (mit erklärendem Tooltip), wenn der Lead keine E-Mail hat oder kein Mail-Konto konfiguriert ist.
- Nach erfolgreichem Versand: Toast „Mail gesendet.", Aktivität vom Typ `email` erscheint im `ActivityStream` des Leads.
- Die alte `mailto:`-Pille verschickt keine Mails mehr (kein `<a href="mailto:">` im Contact-Info-Bereich); die E-Mail-Adresse bleibt als Text sichtbar.
- `npx vitest run` und `npx tsc --noEmit` bleiben grün.
