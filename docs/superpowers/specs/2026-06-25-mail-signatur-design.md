# E-Mail-Signatur (Outlook-Stil) — Design

**Datum:** 2026-06-25
**Status:** freigegeben (Design), bereit für Implementierungsplan

## Problem

Ausgehende Mails (inkl. der neuen Mahn-Mails) haben unten **keine Unternehmensdaten**.
In Deutschland sind geschäftliche E-Mails Geschäftsbriefe und müssen Pflichtangaben
tragen (Firma + Rechtsform, Sitz, Handelsregister + Nummer, Geschäftsführer, USt-IdNr.).
Der Nutzer möchte — wie in Outlook — **einmal** eine Signatur festlegen, die automatisch
in neue Mails eingesetzt und pro Mail noch editierbar ist.

## Ausgangslage (verifiziert)

- Es gibt **keine** Signatur/Footer-Funktion (nur ein toter Kommentar in `ClientsRoute.tsx`).
- Mails sind **reiner Text**: `SendEmailPayload { ... bodyText: string }` (kein HTML).
- Alle benötigten Daten liegen im **`CompanyProfile`** (`src/types/company.types.ts`):
  `name, address, phone, email, website, taxId, steuernummer, iban, bic, bankName,
  handelsregister, registergericht, geschaeftsfuehrer`.
- `ComposeModal` (`src/components/mail/ComposeModal.tsx`) ist die zentrale Verfassen-UI;
  es kann seit Kurzem `initialBody` vorbefüllt bekommen und sendet `bodyText`.
- Mahn-Mails öffnen jetzt `ComposeModal` mit `mode="new"` + vorbefülltem `initialBody`
  (Mahn-Text). Allgemeine neue Mails nutzen `ComposeModal mode="new"` ohne initialBody.

## Entscheidungen

| Frage | Entscheidung |
|-------|--------------|
| Footer-Inhalt | Frei editierbare Signatur, **vorbefüllbar aus dem Firmenprofil** (Gruß-Zeile + Pflichtangaben-Block) |
| Modell | **Outlook-Stil**: einmal in den Einstellungen festlegen, automatisch in neue Mails |
| Geltungsbereich | **Neue Mails** (`mode="new"`, inkl. Mahnungen). Antworten/Weiterleitungen: keine Auto-Signatur |
| Format | **Reiner Text** (Mails sind Text) |

## Komponenten

### 1. Persistenz — `CompanyProfile.emailSignature`
Neues optionales Feld `emailSignature?: string` in `src/types/company.types.ts`.
Persistiert über das vorhandene `saveProfile` (JSON im Profil) — lokal **und** Supabase,
kein Backend-Umbau (gleiches Muster wie `dunningFees`).

### 2. Signatur-Builder (reine Funktion)
`src/lib/mail-signature.ts` (neu):
- `buildSignatureFromProfile(profile: CompanyProfile): string` — baut einen Text-Block aus
  den vorhandenen Profilfeldern. Nur gesetzte Felder werden aufgenommen (keine leeren Zeilen).
  Reihenfolge/Form (Beispiel):
  ```
  {name}
  {address}
  Tel: {phone} · {email} · {website}
  USt-IdNr.: {taxId} · StNr.: {steuernummer}
  {registergericht} {handelsregister} · GF: {geschaeftsfuehrer}
  {bankName} · IBAN: {iban} · BIC: {bic}
  ```
  Felder, die leer sind, entfallen samt Label/Trenner.
- `appendSignature(body: string, signature: string): string` — hängt die Signatur mit dem
  Standard-Trenner an: `body` + `\n\n-- \n` + `signature`. Wenn `signature` leer/undefined
  ist → `body` unverändert. Wenn `body` leer ist → nur `-- \n{signature}` (führende
  Leerzeilen vermeiden).
- Beide Funktionen sind rein und unit-testbar.

### 3. Einstellungen-UI — `WorkspaceSettings.tsx`
Neue Sektion **„E-Mail-Signatur"** (nach „Mahngebühren"):
- mehrzeiliges `<textarea>` gebunden an `form.emailSignature`.
- Button **„Aus Firmenprofil übernehmen"** → setzt `form.emailSignature =
  buildSignatureFromProfile(form)` (überschreibt das Feld; der Nutzer kann danach editieren,
  z. B. „Mit freundlichen Grüßen, {Name}" oben ergänzen).
- Speicherung über den vorhandenen „Speichern"-Button (`saveProfile(form)`), keine neue
  Save-Logik.

### 4. Anwendung — `ComposeModal.tsx`
Eine zentrale Stelle. Beim Initialisieren des `body`-States für **`mode === 'new'`**:
- Signatur aus dem Company-Store lesen: `useCompanyStore.getState().profile.emailSignature`
  (oder via Hook-Selektor).
- Initialen Body = `appendSignature(initialBody ?? '', signature)`.
- Für `mode === 'reply' | 'forward'` **keine** Auto-Signatur (Body bleibt wie bisher).
So bekommen ALLE neuen Mails (allgemein + Mahnungen) konsistent die Signatur, ohne dass
der Mahn-Service oder einzelne Aufrufer sie selbst anhängen müssen. Die Signatur ist im
Editor sicht- und editierbar; gesendet wird der finale `bodyText`.

## Datenfluss

```
Einstellungen: emailSignature einmal festlegen (optional aus Profil vorbefüllt) → saveProfile
   └─► CompanyProfile.emailSignature (lokal + Supabase)

Neue Mail (ComposeModal mode="new", evtl. mit initialBody aus prepareReminder)
   └─► body = appendSignature(initialBody ?? '', profile.emailSignature)
        └─► im Editor sicht-/editierbar → senden (bodyText inkl. Signatur)
Antwort/Weiterleitung → keine Auto-Signatur
```

## Fehlerbehandlung / Edge-Cases

- `emailSignature` leer/undefined → Mails verhalten sich exakt wie heute (kein Anhang).
- „Aus Firmenprofil übernehmen" bei leerem Profil → erzeugt einen weitgehend leeren Block;
  unschädlich, der Nutzer kann tippen.
- Doppelte Signatur: Da nur `mode="new"` anhängt und das einmal beim Init geschieht, gibt es
  keine Mehrfach-Anhängung (kein Re-Append bei Re-Render).

## Tests

`src/lib/mail-signature.test.ts` (Vitest):
- `buildSignatureFromProfile`: nimmt nur gesetzte Felder, lässt leere weg, korrekte Form.
- `appendSignature`: hängt mit `-- `-Trenner an; leere Signatur → Body unverändert; leerer
  Body → kein führender Leerraum.

## Nicht-Ziele

- HTML-Signaturen / Logo-Bild im Footer (Mails sind Text).
- Mehrere Signaturen / pro-Konto-Signaturen (eine pro Workspace genügt).
- Auto-Signatur in Antworten/Weiterleitungen.

## Berührte Dateien

- **Neu:** `src/lib/mail-signature.ts`, `src/lib/mail-signature.test.ts`.
- **Geändert:** `src/types/company.types.ts` (`emailSignature?`),
  `src/components/settings/WorkspaceSettings.tsx` (Signatur-Sektion + Button),
  `src/components/mail/ComposeModal.tsx` (Signatur an `mode="new"`-Body anhängen).
