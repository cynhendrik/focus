# KI-Datenschutz-Transparenz — Design

**Datum:** 2026-06-25
**Status:** freigegeben (Design)
**Branch:** feature/erechnung-2026-06-21

## Ziel & Kontext

Cultera Focus nutzt KI-Funktionen (KORA-Chat, Textentwürfe, Kunden-Briefings,
Mahntext-Vorschläge), die Inhalte an **Anthropic PBC (USA)** übermitteln (Rust
`cmd_anthropic_messages` → `https://api.anthropic.com`). Die KI bleibt bewusst
**always-on** (Schalter/Abrechnung sind geparkt, siehe
`memory/kora-privacy-switch-deferred.md`). Damit ist DSGVO-**Transparenz Pflicht**:
Der Nutzer muss in der App nachvollziehen können, dass und wie KI-Funktionen Daten
an einen US-Dienstleister senden.

**Scope dieser Spec:** ein endnutzer-sichtbarer **In-App-Transparenzhinweis**.
Die rechtsverbindliche Datenschutzerklärung + der AVV/DPA mit Anthropic sind
**außerhalb** dieser Spec (Anwalt/operativ).

## Nicht-Ziele (YAGNI)

- KI Ein/Aus-Schalter und Pro-Nutzer-Abrechnung (geparkt, eigene Spec).
- Vollständige Datenschutzerklärung / Impressum in der App.
- Konfigurierbarer/editierbarer Text. Der Text ist statisch.
- Einwilligungs-Dialog / Consent-Gate.

## Architektur (zwei Berührungspunkte)

### 1. Neue Settings-Sektion „Datenschutz" (sichtbar für alle)

- **`src/store/ui.store.ts`:** `SettingsTab`-Union um `'datenschutz'` erweitern.
- **`src/components/settings/SettingsSidebar.tsx`:** neuen Eintrag
  `{ key: 'datenschutz', label: 'Datenschutz', icon: ShieldCheck }` ergänzen,
  positioniert **nach `'integrationen'`**. **Für alle sichtbar** (kein Gating
  wie `developer`).
- **`src/components/settings/DatenschutzSettings.tsx`** (neu): rein **statische**,
  strukturierte Text-Komponente. Keine Props (oder nur was das Styling braucht),
  kein State, keine Logik. Folgt dem Card-Styling der bestehenden Sektionen
  (`--surface`/`--border`/`--radius`, Überschrift wie in `DeveloperSettings`).
- **`src/routes/SettingsRoute.tsx`:** bei `tab === 'datenschutz'`
  `<DatenschutzSettings />` rendern.

### 2. Inline-Hinweis an KORA

- **`src/components/corra/CorraIdleView.tsx`:** dezente Hinweiszeile (klein,
  `--fg-dim`, Info-Icon) am unteren Rand des Begrüßungsscreens:
  „KI-Antworten werden von Anthropic (USA) erzeugt. Mehr erfahren →".
- Klick navigiert zur Sektion: `setAppView('settings')` + `setSettingsTab('datenschutz')`
  (beide aus `useUiStore`). Kein neuer Store-State nötig.

## Der Text (final, statisch)

> **KI-Funktionen & Datenschutz**
>
> Cultera Focus bietet KI-gestützte Funktionen — den KORA-Assistenten,
> Textentwürfe, Kunden-Briefings und Mahntext-Vorschläge. Dafür übermitteln wir
> die jeweils nötigen Inhalte an unseren Dienstleister **Anthropic PBC (USA)**
> und lassen sie dort verarbeiten.
>
> - **Wann:** Nur wenn du eine KI-Funktion aktiv nutzt (KORA anschreiben,
>   Entwurf/Briefing/Mahntext anfordern). Ohne deine Aktion gehen keine Daten an die KI.
> - **Welche Daten:** Je nach Funktion z. B. Kundennamen, Kontaktdaten, Notizen,
>   Rechnungs-/Angebotsdaten und deine Chat-Eingaben.
> - **Zweck:** Erzeugung von Vorschlägen, Entwürfen und Zusammenfassungen.
> - **Anbieter:** Anthropic PBC, San Francisco, USA. Über die API übermittelte
>   Inhalte werden standardmäßig **nicht zum Training** der Modelle verwendet.
>
> _Rechtsgrundlage der Übermittlung in die USA (z. B. Standardvertragsklauseln /
> AVV mit Anthropic) sowie die vollständige Datenschutzerklärung: **wird ergänzt**._

**Hinweis im Code:** Die letzte (kursive) Zeile ist ein bewusster Platzhalter —
es wird **kein** abgeschlossener AVV behauptet. Sie bleibt sichtbar als „wird
ergänzt", bis die rechtliche Grundlage steht. Alle anderen Aussagen sind
verifizierte Tatsachen (KI nur auf Nutzeraktion; Anthropic API trainiert
standardmäßig nicht auf Inhalten).

## Tests

- **`DatenschutzSettings.test.tsx`** (neu): rendert die Komponente, prüft dass
  Überschrift „KI-Funktionen & Datenschutz" vorhanden ist und der Text „Anthropic"
  sowie „USA" nennt (Kern-Transparenzaussage darf nicht still verschwinden).
- Bestehende Suite muss grün bleiben (`npm run typecheck`, `npm run test:run`).

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `src/store/ui.store.ts` | `SettingsTab` += `'datenschutz'` |
| `src/components/settings/SettingsSidebar.tsx` | Eintrag „Datenschutz" (ShieldCheck), für alle sichtbar |
| `src/components/settings/DatenschutzSettings.tsx` | **neu** — statische Text-Sektion |
| `src/components/settings/DatenschutzSettings.test.tsx` | **neu** — Render-Test |
| `src/routes/SettingsRoute.tsx` | Render bei `tab === 'datenschutz'` |
| `src/components/corra/CorraIdleView.tsx` | Hinweiszeile + Navigation zur Sektion |

## Verifikation (Abschluss-Gate)

`npm run typecheck` sauber + `npm run test:run` grün; KORA-Hinweis sichtbar und
führt per Klick in die Settings-Sektion (visuell im Tauri-Fenster geprüft).
